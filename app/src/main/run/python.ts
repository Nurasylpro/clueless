// "Run the code": Python highlights are run for real (Pyodide, Python compiled to WebAssembly)
// instead of asking Claude to write the trace. It runs in a worker thread so a stuck loop can
// never freeze the app: the worker is stopped after a hard timeout and started again next time.
// No Electron imports, so scripts and tests use it directly.
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CodeTrace, EntityKind, EntityValue, StepKind, TraceEntity, TraceStep } from '../../shared/trace'
import { MAX_STEPS } from '../../shared/trace'
import { TRACE_PY } from './pyTrace'

/** Lines a run may execute before it stops (the trace keeps the first MAX_STEPS). */
const RUN_STEP_CAP = 400
/** How long the Python itself may run. */
const RUN_MS = 2000
/** On top of that: loading Pyodide the first time, and slack. Past this the worker is stopped. */
const HARD_TIMEOUT_MS = 15_000

// Plain CommonJS so it runs the same under Electron and tsx. Pyodide loads once per worker.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const ready = (async () => {
  const { loadPyodide } = await import(workerData.moduleUrl)
  const py = await loadPyodide({ indexURL: workerData.indexDir, stdin: () => { throw new Error('no input') } })
  py.runPython(workerData.source)
  return py
})()
parentPort.on('message', async (msg) => {
  try {
    const py = await ready
    const fn = py.globals.get(msg.fn)
    const result = fn(...msg.args)
    fn.destroy()
    parentPort.postMessage({ id: msg.id, ok: true, result })
  } catch (err) {
    parentPort.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) })
  }
})
`

export interface RawStep {
  line: number
  frame: number
  kind: 'call' | 'line'
  result: string
  updates: [string, EntityKind, Partial<EntityValue>][]
}

export interface RawRun {
  steps: RawStep[]
  error: string
  errorInSnippet: boolean
  setupError: string
  stopped: '' | 'steps' | 'time'
  stdout: string
  value: string
}

export interface RunPlan {
  /** Python that runs first: the inputs the code needs. */
  setup: string
  /** Python that runs after the code to start it, e.g. `Solution().twoSum(nums, 9)`; "" if none. */
  call: string
}

type Pending = { resolve: (v: string) => void; reject: (e: Error) => void }

export class PythonRunner {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1

  /** `pyodideDir`: the folder of the pyodide npm package (unpacked from the asar in the built app). */
  constructor(private readonly pyodideDir: string) {}

  /** Start loading Pyodide in the background (about a second), so the first run is quick. */
  warm(): void {
    this.ensure()
  }

  async trace(code: string, plan: RunPlan): Promise<RawRun> {
    const indexed = indexedNames(code)
    const json = await this.call('run_trace', [plan.setup, code, plan.call, RUN_STEP_CAP, RUN_MS, JSON.stringify(indexed)])
    return JSON.parse(json) as RawRun
  }

  /** Run a whole program (for the model test set). */
  async run(source: string, maxMs = 5000): Promise<{ ok: boolean; stdout: string; error?: string }> {
    return JSON.parse(await this.call('run_code', [source, maxMs]))
  }

  dispose(): void {
    void this.worker?.terminate()
    this.worker = null
  }

  private ensure(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        moduleUrl: pathToFileURL(join(this.pyodideDir, 'pyodide.mjs')).href,
        indexDir: this.pyodideDir + '/',
        source: TRACE_PY
      }
    })
    worker.unref()
    worker.on('message', (msg: { id: number; ok: boolean; result?: string; error?: string }) => {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.result ?? '')
      else p.reject(new Error(msg.error))
    })
    const fail = (err: Error): void => {
      if (this.worker === worker) this.worker = null
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
    }
    worker.on('error', fail)
    worker.on('exit', () => fail(new Error('The Python worker stopped.')))
    this.worker = worker
    return worker
  }

  private call(fn: string, args: unknown[]): Promise<string> {
    const worker = this.ensure()
    const id = this.nextId++
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('The code ran too long.'))
        this.dispose() // a stuck loop: stop the worker; the next call starts a fresh one
      }, HARD_TIMEOUT_MS)
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e))
      })
      worker.postMessage({ id, fn, args })
    })
  }
}

// ---------- raw run -> CodeTrace ----------

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g
const KEYWORDS = new Set(['for', 'while', 'if', 'elif', 'else', 'return', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'range', 'len', 'def', 'self'])

/** Names the code indexes (`s[i]`, `grid[r][c]`): a string indexed like this is drawn as boxes. */
export function indexedNames(code: string): string[] {
  return [...new Set([...code.matchAll(/([A-Za-z_]\w*)\s*\[/g)].map((m) => m[1]))]
}

/** index variable -> the array it indexes, from `name[i]` and `grid[r][c]` in the code. */
function indexPairs(code: string): Map<string, Map<string, number>> {
  const pairs = new Map<string, Map<string, number>>()
  for (const m of code.matchAll(/([A-Za-z_]\w*)((?:\s*\[\s*[A-Za-z_]\w*\s*\])+)/g)) {
    for (const idx of m[2].matchAll(/\[\s*([A-Za-z_]\w*)\s*\]/g)) {
      const counts = pairs.get(idx[1]) ?? new Map<string, number>()
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
      pairs.set(idx[1], counts)
    }
  }
  return pairs
}

const indentOf = (line: string): number => line.length - line.trimStart().length

/** Last line (1-based) of the block under the header at `line`. */
function blockEnd(lines: string[], line: number): number {
  const base = indentOf(lines[line - 1])
  let end = line
  for (let i = line; i < lines.length; i++) {
    if (!lines[i].trim() || lines[i].trim().startsWith('#')) continue
    if (indentOf(lines[i]) <= base) break
    end = i + 1
  }
  return end
}

function stepKind(text: string, raw: RawStep): StepKind {
  if (raw.kind === 'call') return 'call'
  if (/^(async\s+)?for\b/.test(text)) return 'loop'
  if (/^(if|elif|while)\b/.test(text)) return 'condition'
  if (/^return\b/.test(text)) return 'return'
  if (/^[A-Za-z_][\w.[\]\s,]*(\+|-|\*|\/|\/\/|%|\||&|\^)?=(?!=)/.test(text)) return 'assign'
  return 'other'
}

function focusOf(line: string, kind: StepKind): string {
  const text = line.trim().replace(/\s+#.*$/, '')
  if (kind === 'loop') return text.replace(/:$/, '')
  if (kind === 'condition') return text.replace(/^(if|elif|while)\s+/, '').replace(/:$/, '').trim()
  return ''
}

const fullValue = (v: Partial<EntityValue>): EntityValue => ({ scalar: '', items: [], entries: [], rows: [], ...v })

/** Turn a run into the trace the app animates. Null when nothing in the code ran. */
export function toCodeTrace(run: RawRun, code: string): CodeTrace | null {
  const lines = code.split('\n')
  const named = new Set(code.match(IDENT) ?? [])

  // Entities: every variable the code itself names, in the order it first changed.
  const kinds = new Map<string, EntityKind[]>()
  for (const s of run.steps) for (const [name, kind] of s.updates) if (named.has(name)) kinds.set(name, [...(kinds.get(name) ?? []), kind])
  const entities: TraceEntity[] = [...kinds].map(([name, seen]) => ({
    id: name,
    name,
    kind: seen.find((k) => k !== 'value') ?? 'value',
    indexOf: null
  }))
  const byName = new Map(entities.map((e) => [e.id, e]))
  for (const [index, counts] of indexPairs(code)) {
    const e = byName.get(index)
    if (!e || e.kind !== 'value') continue
    const target = [...counts].sort((a, b) => b[1] - a[1]).find(([name]) => ['array', 'grid'].includes(byName.get(name)?.kind ?? ''))
    if (target) e.indexOf = target[0]
  }

  const steps: TraceStep[] = []
  run.steps.forEach((raw, i) => {
    const line = raw.line
    if (line < 1 || line > lines.length) return
    const text = lines[line - 1].trim()
    const kind = stepKind(text, raw)
    let result = raw.result
    if (kind === 'condition') {
      const next = run.steps.slice(i + 1).find((s) => s.frame === raw.frame)
      result = next && next.line > line && next.line <= blockEnd(lines, line) ? 'true' : 'false'
    }
    const updates = raw.updates.filter(([name]) => byName.has(name)).map(([name, , value]) => ({ entity: name, value: fullValue(value) }))
    const updated = new Set(updates.map((u) => u.entity))
    const reads = [...new Set(text.match(IDENT) ?? [])].filter((n) => byName.has(n) && !updated.has(n) && !KEYWORDS.has(n))
    steps.push({ line, endLine: line, focus: raw.kind === 'call' ? '' : focusOf(lines[line - 1], kind), kind, result, reads, updates })
  })

  if (run.error && run.errorInSnippet && steps.length) {
    const last = steps[steps.length - 1]
    steps.push({ line: last.line, endLine: last.line, focus: '', kind: 'other', result: run.error, reads: [], updates: [] })
  }
  if (!steps.some((s) => s.kind !== 'call') || !entities.length) return null
  return { language: 'python', code, entities, steps: steps.slice(0, MAX_STEPS) }
}

/** Is this highlight Python? Good enough to pick the runner; the model confirms the language. */
export function looksLikePython(code: string): boolean {
  const lines = code.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  if (!lines.length) return false
  if (lines.some((l) => /[{};]\s*$/.test(l) && !/^[\w\s,]+=\s*[{[(]/.test(l))) return false // braces/semicolons: C-like
  if (lines.some((l) => /^(public|private|static|int|void|let|const|var|function|#include)\b/.test(l))) return false
  return lines.some((l) => /^(def|class|for|while|if|elif|else|return|import|from)\b.*$/.test(l) || /:\s*$/.test(l) || /^\w+\s*=/.test(l))
}
