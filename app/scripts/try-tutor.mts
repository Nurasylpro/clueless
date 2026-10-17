// Try the tutor in the terminal, without Electron. Good for testing your API key and the prompt.
//
//   npm run try -- "A 5 kg block slides down a frictionless 30° ramp. Find its acceleration."
//   npm run try -- --image path/to/screenshot.png
//
// Then type answers. Commands: /hint  /next  /reveal  /recap  /quit   (add --debug to see the hidden solution)
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import type { AnswerCheck, TutorReplyT } from '../src/shared/contracts'
import { checkAnswer } from '../src/main/checker/check'
import { loadEnvFiles } from '../src/main/env'
import { Tutor, type ImageInput, type Tag } from '../src/main/tutor/tutor'

loadEnvFiles([join(process.cwd(), '.env')])
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('No ANTHROPIC_API_KEY. Copy .env.example to .env and add your key.')
  process.exit(1)
}

const args = process.argv.slice(2)
const debug = args.includes('--debug')
const imageAt = args.indexOf('--image')
let image: ImageInput | undefined
if (imageAt >= 0) {
  const path = args[imageAt + 1]
  image = { data: readFileSync(path).toString('base64'), mediaType: path.endsWith('.png') ? 'image/png' : 'image/jpeg' }
}
const text = args.filter((a, i) => !a.startsWith('--') && i !== imageAt + 1).join(' ').trim() || undefined
if (!image && !text) {
  console.error('Give a problem as text, or --image path/to/screenshot.png')
  process.exit(1)
}

const tutor = new Tutor(new Anthropic(), process.env.CLUELESS_MODEL || undefined, (line) => console.log(`  (${line})`))
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
    reply.recap.flashcards.forEach((c) => console.log(`  card: ${c.front} -> ${c.back}`))
    if (reply.recap.similarProblem) console.log(`  try next: ${reply.recap.similarProblem}`)
  }
  pendingCheck = t.check
}

const COMMANDS: Record<string, Tag> = { '/hint': 'HINT', '/next': 'WHAT NEXT', '/reveal': 'REVEAL', '/recap': 'RECAP' }

show(await tutor.start({ image, text }))
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
