// Try the tutor in the terminal, without Electron. Good for testing your API key and the prompt.
//
//   npm run try -- "A 5 kg block slides down a frictionless 30° ramp. Find its acceleration."
//   npm run try -- --image path/to/screenshot.png
//
// Then type answers. Commands: /hint  /next  /reveal  /recap  /quit   (add --debug to see the hidden solution)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import type { AnswerCheck, TutorReplyT } from '../src/shared/contracts'
import { checkAnswer } from '../src/main/checker/check'
import { loadEnvFiles } from '../src/main/env'
import { createTransport } from '../src/main/tutor/provider'
import { Tutor, type ImageInput, type Tag } from '../src/main/tutor/tutor'

loadEnvFiles([join(process.cwd(), '.env')])
const transport = createTransport()
if (!transport) {
  console.error('No Claude credentials. Copy .env.example to .env and fill in the Bedrock (AWS) or ANTHROPIC_API_KEY lines.')
  process.exit(1)
}
console.log(`Using ${transport.provider === 'bedrock' ? `Amazon Bedrock (${transport.region})` : 'the Claude API'} · ${transport.model}`)

const args = process.argv.slice(2)
const debug = args.includes('--debug')
const imageAt = args.indexOf('--image')
let image: ImageInput | undefined
if (imageAt >= 0) {
  const path = args[imageAt + 1]
  image = { data: readFileSync(path).toString('base64'), mediaType: path.endsWith('.png') ? 'image/png' : 'image/jpeg' }
}
const text = args.filter((a, i) => !a.startsWith("--") && (imageAt < 0 || i !== imageAt + 1)).join(' ').trim() || undefined
if (!image && !text) {
  console.error('Give a problem as text, or --image path/to/screenshot.png')
  process.exit(1)
}

const tutor = new Tutor(transport, (line) => console.log(`  (${line})`))
let pendingCheck: AnswerCheck | null = null

function show(reply: TutorReplyT): void {
  if (reply.problem) {
    console.log(`\n== ${reply.problem.title} [${reply.problem.subject}${reply.problem.language ? `, ${reply.problem.language}` : ''}]`)
    console.log(`   ${reply.problem.summary}`)
    if (debug) console.log(`   hidden solution: ${reply.problem.hiddenSolution}`)
  }
  const t = reply.turn
  const current = t.plan.find((s) => s.status === 'current')
  if (current) console.log(`   step ${current.id}/${t.plan.length}: ${current.text}`)
  const tags = [t.kind, t.verdict !== 'none' && t.verdict, t.hintLevel > 0 && `hint ${t.hintLevel}`, t.gap && `${t.gap.type}: ${t.gap.topic}`]
  console.log(`\nclueless [${tags.filter(Boolean).join(' · ')}]\n${t.message}`)
  if (t.visual) console.log(`   (visual: ${t.visual.frames.map((f) => f.type).join(', ')})`)
  if (t.check) console.log(`   (will check your next answer: ${t.check.kind}${debug ? ` vs ${t.check.reference}` : ''})`)
  if (reply.recap) {
    console.log(`\nRECAP\n  explain back: ${reply.recap.explainBack}`)
    reply.recap.gaps.forEach((g) => console.log(`  gap: ${g.type} · ${g.topic}`))
    if (reply.recap.similarProblem) console.log(`  try next: ${reply.recap.similarProblem}`)
  }
  pendingCheck = t.check
}

const COMMANDS: Record<string, Tag> = { '/hint': 'HINT', '/next': 'WHAT NEXT', '/reveal': 'REVEAL', '/recap': 'RECAP' }

try {
  show(await tutor.start({ image, text }))
} catch (err) {
  console.error(`error: ${(err as Error).message}`)
  process.exit(1)
}
const rl = createInterface({ input: process.stdin, output: process.stdout })
for (;;) {
  const line = (await rl.question('\nyou> ')).trim()
  if (!line) continue
  if (line === '/quit') break
  try {
    if (COMMANDS[line]) {
      show(await tutor.send({ tag: COMMANDS[line] }))
      continue
    }
    const notes: string[] = []
    if (pendingCheck) {
      const result = checkAnswer(pendingCheck, line)
      console.log(`   (math engine: ${result.status})`)
      notes.push(`[CHECKER] ${result.detail}`)
    }
    show(await tutor.send({ tag: 'STUDENT', text: line, notes }))
  } catch (err) {
    console.error(`error: ${(err as Error).message}`)
  }
}
rl.close()
