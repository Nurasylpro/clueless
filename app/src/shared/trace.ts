// A code trace: what "Ask" on highlighted code comes back with when Animate is on.
// Every step the code runs: which line, which part of the line, the new value of every variable
// ("entity") that changed, and one short sentence saying what happens (shown on top of the
// animation, and read aloud when Voice is on). Python is run for real to get the steps
// (src/main/run); for other languages Claude reads the code and writes them down itself.
//
// The wire schema has no unions (fast to compile as a structured output); "nothing" is "" or [].
import { z } from 'zod'
import { narrateStep } from './narrate'

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

const TraceOutcome = z.object({
  status: z.enum(['matched', 'mismatch', 'unknown']),
  expected: z.string(),
  actual: z.string(),
  evidence: z.string() // where the expected result comes from, not a claim of general correctness
})

export const TraceWire = z.object({
  // Markdown. With an animation: the recap shown in the island after it has played (under 60
  // words). Without one: the answer itself.
  message: z.string(),
  intro: z.string(), // animation only: one short sentence shown (and said) before step 1; else ""
  language: z.string(), // "python", "cpp", ... ("" when it isn't code)
  // A question about the screen (no highlight) that Claude animates anyway: the code it traced,
  // copied exactly from the screenshot; step line numbers point into it. "" otherwise.
  code: z.string(),
  outcome: TraceOutcome,
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
      updates: z.array(z.object({ entity: z.string(), value: EntityValue })), // full new values
      say: z.string() // one short sentence: what happens here and why (shown on top, read aloud)
    })
  ), // [] = no animation (Animate off, the highlight isn't code, or the app runs it: see run)
  // [RUN] only: how the app runs the highlighted Python itself. "" otherwise.
  run: z.object({
    setup: z.string(), // runs first: the inputs the code needs
    call: z.string() // runs after it to start it, e.g. "Solution().twoSum([2, 7, 11, 15], 9)"
  })
})

/** [NARRATE]: after the app ran the code itself, Claude writes the words for the steps it got. */
export const NarrationWire = z.object({
  intro: z.string(),
  message: z.string(),
  says: z.array(z.string()) // one per step, in order
})
export type NarrationWireT = z.infer<typeof NarrationWire>

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
  say: string // never empty after fromTraceWire / withNarration: the app fills any gap itself
}

export interface CodeTrace {
  intro: string // shown (and said) before step 1
  language: string
  code: string // the highlighted code, normalized; step line numbers point into it
  entities: TraceEntity[]
  steps: TraceStep[]
  outcome?: z.infer<typeof TraceOutcome>
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
export function fromTraceWire(wire: TraceWireT, highlighted: string): TraceReply {
  const message = wire.message.trim()
  // No highlight (a question about the screen): the code Claude copied from the screenshot.
  const code = highlighted.trim() ? highlighted : normalizeSnippet(wire.code)
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
        .map((u) => ({ entity: u.entity, value: { ...emptyValue(), ...u.value } })),
      say: s.say.trim()
    })
  }

  // Never celebrate a partial trace, an unsupported expectation, or a return that disagrees
  // with the assessment. "True" alone says nothing about whether a solution is correct.
  const assessment = wire.outcome
  const final = steps.at(-1)
  const expected = assessment.expected.trim()
  const actual = assessment.actual.trim()
  const evidence = assessment.evidence.trim()
  const supported = wire.steps.length <= MAX_STEPS && final?.kind === 'return' &&
    actual !== '' && final.result === actual && expected !== '' && evidence !== ''
  const status = supported && assessment.status === 'matched' && expected === actual ? 'matched'
    : supported && assessment.status === 'mismatch' && expected !== actual ? 'mismatch' : 'unknown'
  const outcome: z.infer<typeof TraceOutcome> = { status, expected, actual, evidence }
  const trace: CodeTrace | null =
    entities.length && steps.length && lines.some((l) => l.trim())
      ? withNarration({ intro: wire.intro.trim(), language: wire.language.trim(), code, entities, steps, outcome })
      : null
  return { message, trace }
}

/** Every step gets a sentence: Claude's when it wrote one, otherwise one made from the step itself. */
export function withNarration(trace: CodeTrace, says: string[] = [], intro = ''): CodeTrace {
  const steps = trace.steps.map((s, i) => ({ ...s, say: (says[i] ?? '').trim() || s.say.trim() }))
  const filled = { ...trace, steps }
  return {
    ...filled,
    intro: intro.trim() || trace.intro.trim() || 'Let’s run it, one step at a time.',
    steps: steps.map((s, i) => (s.say ? s : { ...s, say: narrateStep(filled, i).text }))
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo))
}

const KEYWORDS = new Set(
  ('and as assert async await break case catch char class const continue def default del do double elif else enum ' +
    'except extends false final finally float for from function global if implements import in instanceof int is ' +
    'lambda let long new none nonlocal not null or pass private protected public raise return self short static ' +
    'string struct super switch this throw true try typeof var void while with yield auto bool vector list dict set ' +
    'len range print').split(' ')
)

/** The names in some code worth listening for when the student talks about it: its variables and
 *  functions (no keywords), most used first. For Deepgram's keyterms. */
export function codeNames(code: string, max = 20): string[] {
  const counts = new Map<string, number>()
  for (const word of code.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    if (word.length < 2 || KEYWORDS.has(word.toLowerCase())) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w)
}
