// A code trace: what "Ask" on highlighted code comes back with when Animate is on.
// Claude reads the highlighted code and writes down every step it runs: which line, which part
// of the line, and the new value of every variable ("entity") that changed. The app draws the
// entities as simple figures on the left and the code on the right, spotlighting each step.
//
// The wire schema has no unions (fast to compile as a structured output); "nothing" is "" or [].
import { z } from 'zod'

export const EntityKind = z.enum([
  'value', // a number, string, bool, None, ...: one box
  'array', // a list / array / indexed string: a row of boxes
  'grid', // a 2-D list: a grid of boxes
  'set', // a set: a bag of items
  'map' // a dict / hashmap / object / Counter: key → value rows
])

export const StepKind = z.enum(['declare', 'assign', 'loop', 'condition', 'call', 'return', 'other'])

/** One entity's whole value at a moment. Only the field for its kind is used; the rest are empty. */
export const EntityValue = z.object({
  scalar: z.string(), // value: "5", "'a'", "True", "None"
  items: z.array(z.string()), // array and set (sets in insertion order)
  entries: z.array(z.object({ key: z.string(), value: z.string() })), // map
  rows: z.array(z.array(z.string())) // grid
})

export const TraceWire = z.object({
  message: z.string(), // Markdown, shown before the animation (or alone when there's none)
  language: z.string(), // "python", "cpp", ... ("" when it isn't code)
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(), // as written in the code
      kind: EntityKind,
      indexOf: z.string() // an index variable: the id of the array or grid it indexes, else ""
    })
  ),
  steps: z.array(
    z.object({
      line: z.number(), // 1-based, in the highlighted code
      endLine: z.number(), // same as line for a one-line step
      focus: z.string(), // the exact part of the line this step is about ("" = the whole line)
      kind: StepKind,
      result: z.string(), // condition: "true" / "false"; return: the value; else ""
      reads: z.array(z.string()), // ids of entities this step reads
      updates: z.array(z.object({ entity: z.string(), value: EntityValue })) // full new values
    })
  ) // [] = no animation (Animate off, or the highlight isn't code)
})

export type EntityKind = z.infer<typeof EntityKind>
export type StepKind = z.infer<typeof StepKind>
export type EntityValue = z.infer<typeof EntityValue>
export type TraceWireT = z.infer<typeof TraceWire>

export interface TraceEntity {
  id: string
  name: string
  kind: EntityKind
  indexOf: string | null
}

export interface TraceStep {
  line: number
  endLine: number
  focus: string
  kind: StepKind
  result: string
  reads: string[]
  updates: { entity: string; value: EntityValue }[]
}

export interface CodeTrace {
  language: string
  code: string // the highlighted code, normalized; step line numbers point into it
  entities: TraceEntity[]
  steps: TraceStep[]
}

export interface TraceReply {
  message: string
  trace: CodeTrace | null
}

export const MAX_STEPS = 120

/** Make copied code clean and stable: \n line ends, tabs as 4 spaces, no shared indent, no blank edges. */
export function normalizeSnippet(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  const indents = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length)
  const common = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(common)).join('\n')
}

/** "  1 | code" lines, so Claude can point at exact line numbers. */
export function numberLines(code: string): string {
  const lines = code.split('\n')
  const width = String(lines.length).length
  return lines.map((l, i) => `${String(i + 1).padStart(width)} | ${l}`).join('\n')
}

const emptyValue = (): EntityValue => ({ scalar: '', items: [], entries: [], rows: [] })

/** Wire reply -> app reply. Drops anything that doesn't fit the code instead of failing. */
export function fromTraceWire(wire: TraceWireT, code: string): TraceReply {
  const message = wire.message.trim()
  const lines = code.split('\n')

  const entities: TraceEntity[] = []
  const ids = new Set<string>()
  for (const e of wire.entities) {
    const id = e.id.trim()
    if (!id || ids.has(id)) continue
    ids.add(id)
    entities.push({ id, name: e.name.trim() || id, kind: e.kind, indexOf: e.indexOf.trim() || null })
  }
  for (const e of entities) if (e.indexOf && !ids.has(e.indexOf)) e.indexOf = null

  const steps: TraceStep[] = []
  for (const s of wire.steps.slice(0, MAX_STEPS)) {
    const line = clampInt(s.line, 1, lines.length)
    const endLine = clampInt(s.endLine, line, lines.length)
    const focus = s.focus && lines[line - 1].includes(s.focus) ? s.focus : ''
    steps.push({
      line,
      endLine,
      focus,
      kind: s.kind,
      result: s.result.trim(),
      reads: [...new Set(s.reads.filter((id) => ids.has(id)))],
      updates: s.updates
        .filter((u) => ids.has(u.entity))
        .map((u) => ({ entity: u.entity, value: { ...emptyValue(), ...u.value } }))
    })
  }

  const trace = entities.length && steps.length && lines.some((l) => l.trim()) ? { language: wire.language.trim(), code, entities, steps } : null
  return { message, trace }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo))
}
