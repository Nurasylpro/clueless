// Try "Ask" on highlighted code in the terminal, without Electron: Claude traces the file step by
// step, exactly what the full-screen animation plays. Good for checking a demo snippet first.
//
//   npm run trace -- path/to/code.py           Animate on (max effort, full trace)
//   npm run trace -- path/to/code.py --off     Animate off (text only)
//   npm run trace -- path/to/code.py --json    print the whole trace as JSON
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CodeTrace, EntityValue } from '../src/shared/trace'
import { loadEnvFiles } from '../src/main/env'
import { Tracer } from '../src/main/island/tracer'
import { createTransport } from '../src/main/tutor/provider'

loadEnvFiles([join(process.cwd(), '.env')])
const transport = createTransport()
if (!transport) {
  console.error('No Claude credentials. Copy .env.example to .env and fill in the Bedrock (AWS) or ANTHROPIC_API_KEY lines.')
  process.exit(1)
}

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('Give a code file: npm run trace -- path/to/code.py')
  process.exit(1)
}
const animate = !args.includes('--off')
const snippet = readFileSync(file, 'utf8')

console.log(`${transport.provider === 'bedrock' ? `Amazon Bedrock (${transport.region})` : 'Claude API'} · ${transport.model} · ${animate ? 'Animate on, max effort' : 'Animate off, high effort'}`)
const tracer = new Tracer(transport, (line) => console.log(`  (${line})`))
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
  process.exit(1)
}

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
