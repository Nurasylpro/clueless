// Try "Ask" on highlighted code in the terminal, without Electron: the same steps the animation
// plays. Python is run for real (Haiku sets up the run); other languages are traced by Claude.
// Good for checking a demo snippet first.
//
//   npm run trace -- path/to/code.py           Animate on
//   npm run trace -- path/to/code.py --off     Animate off (text only)
//   npm run trace -- path/to/code.py --json    print the whole trace as JSON
//   npm run trace -- path/to/code.py --effort medium   force an effort for Claude-written traces
//   npm run trace -- path/to/code.py --no-run  Claude writes the trace even for Python
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CodeTrace, EntityValue } from '../src/shared/trace'
import { loadEnvFiles } from '../src/main/env'
import { Tracer, traceEffort, type Effort } from '../src/main/island/tracer'
import { PythonRunner } from '../src/main/run/python'
import { createTransport } from '../src/main/tutor/provider'

loadEnvFiles([join(process.cwd(), '.env')])
const transport = createTransport(process.env, 'tutor')
const fast = createTransport(process.env, 'fast')
if (!transport || !fast) {
  console.error('No Claude credentials. Copy .env.example to .env and fill in the Bedrock (AWS) or ANTHROPIC_API_KEY lines.')
  process.exit(1)
}

const args = process.argv.slice(2)
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--effort')
if (!file) {
  console.error('Give a code file: npm run trace -- path/to/code.py')
  process.exit(1)
}
const animate = !args.includes('--off')
const effortAt = args.indexOf('--effort')
const effort = effortAt >= 0 ? (args[effortAt + 1] as Effort) : undefined
const snippet = readFileSync(file, 'utf8')

const shownEffort = effort ?? traceEffort(snippet)
console.log(
  `${transport.provider === 'bedrock' ? `Amazon Bedrock (${transport.region})` : 'Claude API'} · ${fast.model} + ${transport.model} · ${animate ? `Animate on (${shownEffort} effort if Claude writes the trace)` : 'Animate off'}`
)
const runner = args.includes('--no-run') ? null : new PythonRunner(join(process.cwd(), 'node_modules', 'pyodide'))
const tracer = new Tracer({ tutor: transport, fast }, runner, (line: string) => console.log(`  (${line})`), effort)
try {
  const reply = await tracer.ask({ snippet, image: null, animate })
  console.log(`\n${reply.message}\n`)
  if (reply.trace) {
    if (args.includes('--json')) console.log(JSON.stringify(reply.trace, null, 2))
    else printTrace(reply.trace)
  } else if (animate) {
    console.log('(no animation: Claude answered with text only)')
  }
} catch (err) {
  console.error(`error: ${(err as Error).message}`)
  process.exitCode = 1
}
runner?.dispose()

function printTrace(trace: CodeTrace): void {
  const lines = trace.code.split('\n')
  const names = new Map(trace.entities.map((e) => [e.id, e]))
  console.log(`entities: ${trace.entities.map((e) => `${e.name} (${e.kind}${e.indexOf ? `, indexes ${names.get(e.indexOf)?.name}` : ''})`).join(', ')}`)
  console.log(`${trace.steps.length} steps\n`)
  trace.steps.forEach((s, i) => {
    const where = s.focus || lines[s.line - 1].trim()
    const result = s.result ? ` -> ${s.result}` : ''
    const updates = s.updates.map((u) => `${names.get(u.entity)?.name} = ${show(names.get(u.entity)?.kind, u.value)}`).join(', ')
    console.log(`${String(i + 1).padStart(3)}. L${s.line} ${s.kind.padEnd(9)} ${where}${result}${updates ? `   | ${updates}` : ''}`)
  })
}

function show(kind: string | undefined, v: EntityValue): string {
  if (kind === 'array') return `[${v.items.join(', ')}]`
  if (kind === 'set') return `{${v.items.join(', ')}}`
  if (kind === 'map') return `{${v.entries.map((e) => `${e.key}: ${e.value}`).join(', ')}}`
  if (kind === 'grid') return `[${v.rows.map((r) => `[${r.join(', ')}]`).join(', ')}]`
  return v.scalar
}
