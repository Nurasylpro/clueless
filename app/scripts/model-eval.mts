// A small test set for picking models: 5 LeetCode medium/hard, 5 Calc 2, 5 CS concepts.
// Each model gets every problem as a fresh tutor session: the first turn (hidden solution + first
// nudge) and one "what next?" turn. Then:
//   - LeetCode: the hidden solution is run against test cases (Pyodide).
//   - Calc 2 and CS: a judge model checks the hidden solution against a reference.
//   - Every problem: the judge checks the two turns didn't give the answer away, and rates them.
//
//   npm run eval                          # sonnet, haiku and opus
//   npm run eval -- --models sonnet,haiku --judge opus --only lc --out results.json
//   (--only takes a kind: lc, calc, cs, or part of a title)
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { loadEnvFiles } from '../src/main/env'
import { PythonRunner } from '../src/main/run/python'
import { createTransport, detectProvider } from '../src/main/tutor/provider'
import { Tutor, type ClaudeClient, type TutorTransport } from '../src/main/tutor/tutor'

loadEnvFiles([join(process.cwd(), '.env')])
const provider = detectProvider()
if (!provider) {
  console.error('No Claude credentials in .env')
  process.exit(1)
}

const args = process.argv.slice(2)
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const MODELS = flag('models', 'sonnet,haiku,opus').split(',')
const JUDGE = flag('judge', 'opus')
const ONLY = flag('only', '')
const OUT = flag('out', '')

const idFor = (short: string): string => {
  const id = short.startsWith('claude-') || short.startsWith('anthropic.') ? short : `claude-${short}-5-5`
  return provider === 'bedrock' && !id.startsWith('anthropic.') ? `anthropic.${id}` : id
}

// $ per million tokens: input, output. Cache writes cost 1.25x input, cache reads 0.1x.
const PRICES: Record<string, [number, number]> = { opus: [4, 20], sonnet: [2, 10], haiku: [0.1, 0.5] }
const priceOf = (model: string): [number, number] => PRICES[Object.keys(PRICES).find((k) => model.includes(k)) ?? 'opus']

interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}
const costOf = (model: string, u: Usage): number => {
  const [pin, pout] = priceOf(model)
  const input = u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0)
  return (input * pin + u.output_tokens * pout) / 1e6
}

/** The same transport, but every response's usage is written down. */
function recording(transport: TutorTransport, sink: Usage[]): TutorTransport {
  const wrap = (c: ClaudeClient): ClaudeClient => ({
    beta: {
      messages: {
        create: async (p, o) => {
          const r = await c.beta.messages.create(p, o)
          sink.push(r.usage as Usage)
          return r
        }
      }
    }
  })
  return { ...transport, client: wrap(transport.client), plainClient: transport.plainClient && wrap(transport.plainClient) }
}

// ---------- the test set ----------

interface LcCase {
  kind: 'lc'
  title: string
  text: string
  method: string
  tests: string // Python list of (args tuple, expected)
}
interface JudgedCase {
  kind: 'calc' | 'cs'
  title: string
  text: string
  reference: string
}
type Case = LcCase | JudgedCase

const BOARD = `[["5","3",".",".","7",".",".",".","."],["6",".",".","1","9","5",".",".","."],[".","9","8",".",".",".",".","6","."],["8",".",".",".","6",".",".",".","3"],["4",".",".","8",".","3",".",".","1"],["7",".",".",".","2",".",".",".","6"],[".","6",".",".",".",".","2","8","."],[".",".",".","4","1","9",".",".","5"],[".",".",".",".","8",".",".","7","9"]]`

const CASES: Case[] = [
  {
    kind: 'lc',
    title: 'Valid Sudoku',
    text: 'LeetCode 36 Valid Sudoku (medium). Determine if a 9x9 Sudoku board is valid. Only the filled cells need to be validated: each row, each column and each of the nine 3x3 boxes must contain the digits 1-9 without repetition. Empty cells are ".". I\'m writing it in Python: class Solution: def isValidSudoku(self, board: List[List[str]]) -> bool',
    method: 'isValidSudoku',
    tests: `[((${BOARD},), True), (([["8"] + r[1:] if i == 0 else r for i, r in enumerate(${BOARD})],), False), (([r[:8] + ["5"] if i == 0 else r for i, r in enumerate(${BOARD})],), False)]`
  },
  {
    kind: 'lc',
    title: 'Coin Change',
    text: 'LeetCode 322 Coin Change (medium). You are given an integer array coins of different denominations and an integer amount. Return the fewest number of coins needed to make up that amount, or -1 if it can\'t be made. You have an infinite number of each coin. I\'m writing it in Python: class Solution: def coinChange(self, coins: List[int], amount: int) -> int',
    method: 'coinChange',
    tests: '[(([1, 2, 5], 11), 3), (([2], 3), -1), (([1], 0), 0), (([186, 419, 83, 408], 6249), 20)]'
  },
  {
    kind: 'lc',
    title: 'Course Schedule',
    text: 'LeetCode 207 Course Schedule (medium). There are numCourses courses labeled 0 to numCourses - 1. prerequisites[i] = [a, b] means you must take course b before course a. Return true if you can finish all courses, otherwise false. I\'m writing it in Python: class Solution: def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool',
    method: 'canFinish',
    tests: '[((2, [[1, 0]]), True), ((2, [[1, 0], [0, 1]]), False), ((3, [[1, 0], [2, 1]]), True), ((4, [[1, 0], [2, 1], [3, 2], [1, 3]]), False)]'
  },
  {
    kind: 'lc',
    title: 'Trapping Rain Water',
    text: 'LeetCode 42 Trapping Rain Water (hard). Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining. I\'m writing it in Python: class Solution: def trap(self, height: List[int]) -> int',
    method: 'trap',
    tests: '[(([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1],), 6), (([4, 2, 0, 3, 2, 5],), 9), (([5],), 0)]'
  },
  {
    kind: 'lc',
    title: 'Minimum Window Substring',
    text: 'LeetCode 76 Minimum Window Substring (hard). Given strings s and t, return the minimum window substring of s such that every character in t (including duplicates) is in the window. If there is no such substring, return "". I\'m writing it in Python: class Solution: def minWindow(self, s: str, t: str) -> str',
    method: 'minWindow',
    tests: '[(("ADOBECODEBANC", "ABC"), "BANC"), (("a", "a"), "a"), (("a", "aa"), "")]'
  },
  { kind: 'calc', title: 'Integration by parts', text: 'Calc 2 homework: evaluate the integral of x^2 e^x dx.', reference: 'e^x (x^2 - 2x + 2) + C' },
  { kind: 'calc', title: 'Partial fractions', text: 'Calc 2: find the integral of (3x + 5) / ((x + 1)(x + 2)) dx.', reference: '2 ln|x + 1| + ln|x + 2| + C' },
  { kind: 'calc', title: 'Series convergence', text: 'Calc 2: does the series sum from n = 1 to infinity of n / (n^2 + 1) converge or diverge? Justify.', reference: 'Diverges, e.g. by limit comparison with the harmonic series 1/n (limit 1).' },
  { kind: 'calc', title: 'Maclaurin series', text: 'Calc 2: find the Maclaurin series of ln(1 + x) and its interval of convergence.', reference: 'sum_{n>=1} (-1)^(n+1) x^n / n, interval of convergence (-1, 1].' },
  { kind: 'calc', title: 'Volume of revolution', text: 'Calc 2: the region under y = sqrt(x) from x = 0 to x = 4 is rotated about the x-axis. Find the volume.', reference: 'V = integral from 0 to 4 of pi x dx = 8 pi.' },
  { kind: 'cs', title: 'Hash map collisions', text: 'Explain how a hash map handles collisions and why lookups are O(1) on average.', reference: 'Hash function maps keys to buckets; collisions handled by chaining or open addressing (probing); a load factor bound plus resizing/rehashing keeps buckets short so expected lookup is O(1); worst case O(n) when many keys collide.' },
  { kind: 'cs', title: 'Heap build vs heap sort', text: 'Why does building a heap take O(n) time, but heap sort takes O(n log n)?', reference: 'Bottom-up heapify sifts down; most nodes are near the bottom and move little, the sum of heights is O(n). Heap sort does n extract-max operations, each O(log n) sift-down, so O(n log n).' },
  { kind: 'cs', title: 'Processes vs threads', text: 'What is the difference between a process and a thread?', reference: 'A process has its own address space and resources; threads are units of execution inside a process that share its memory and resources but have their own stack and registers. Threads are cheaper to create and switch; sharing needs synchronization; a crash or memory bug in one thread affects the whole process.' },
  { kind: 'cs', title: 'BFS vs DFS', text: 'When should I use BFS instead of DFS, and why does BFS find shortest paths in an unweighted graph?', reference: 'BFS explores in order of distance using a queue, so the first time it reaches a node is along a path with the fewest edges; use it for shortest paths in unweighted graphs / level order. DFS uses a stack/recursion, good for exhaustive search, cycle detection, topological sort, less memory on wide graphs.' },
  { kind: 'cs', title: 'Dynamic programming', text: 'Explain dynamic programming. What are overlapping subproblems and optimal substructure?', reference: 'DP solves problems by combining solutions to subproblems; optimal substructure = an optimal solution is built from optimal sub-solutions; overlapping subproblems = the same subproblems recur, so store their results (memoization top-down or tabulation bottom-up), e.g. Fibonacci goes from exponential to O(n).' }
]

// ---------- grading ----------

const runner = new PythonRunner(join(process.cwd(), 'node_modules', 'pyodide'))

function extractCode(solution: string): string {
  const blocks = [...solution.matchAll(/```(?:python|py)?\s*\n([\s\S]*?)```/g)].map((m) => m[1])
  return blocks.find((b) => /\bdef\b/.test(b)) ?? solution
}

async function runTests(c: LcCase, solution: string): Promise<{ passed: number; total: number; error: string }> {
  const harness = `
import copy
_cases = ${c.tests}
_fn = getattr(Solution(), ${JSON.stringify(c.method)}) if 'Solution' in globals() else globals()[${JSON.stringify(c.method)}]
_ok = 0
for _args, _want in _cases:
    try:
        _ok += _fn(*copy.deepcopy(_args)) == _want
    except Exception:
        pass
print(f"{_ok}/{len(_cases)}")`
  const r = await runner.run(`${extractCode(solution)}\n${harness}`, 10_000)
  const m = r.stdout.trim().split('\n').at(-1)?.match(/^(\d+)\/(\d+)$/)
  return m ? { passed: Number(m[1]), total: Number(m[2]), error: '' } : { passed: 0, total: 0, error: r.error ?? 'no result' }
}

interface Verdict {
  correct: boolean
  leak: boolean
  teaching: number
  note: string
}

const judgeTransport = createTransport({ ...process.env, CLUELESS_MODEL: idFor(JUDGE) })!
const judgeUsage: Usage[] = []

async function judge(c: Case, solution: string, turns: string[]): Promise<Verdict> {
  const reference = c.kind === 'lc' ? '(graded by tests; mark correct true)' : c.reference
  const prompt = `You grade an AI tutor that must guide a student without giving away the answer.

Problem the student brought:
${c.text}

Reference answer / key points:
${reference}

The tutor's private worked solution (never shown to the student):
${solution}

The tutor's messages to the student, in order:
${turns.map((t, i) => `--- message ${i + 1} ---\n${t}`).join('\n')}

Answer with JSON only, no other text:
{"correct": true or false (the private solution is right and reaches the reference answer or covers its key points),
 "leak": true or false (a message to the student states the final answer, or spells out the full method so nothing is left for them),
 "teaching": 1 to 5 (are the messages a good start: short, clear, a hint or question that moves this student forward),
 "note": "one short sentence"}`
  const r = (await judgeTransport.client.beta.messages.create({
    model: judgeTransport.model,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: prompt }]
  })) as BetaMessage
  judgeUsage.push(r.usage as Usage)
  const text = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const json = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}'
  try {
    const v = JSON.parse(json) as Partial<Verdict>
    return { correct: Boolean(v.correct), leak: Boolean(v.leak), teaching: Number(v.teaching) || 0, note: String(v.note ?? '') }
  } catch {
    return { correct: false, leak: false, teaching: 0, note: `judge gave no JSON: ${text.slice(0, 80)}` }
  }
}

// ---------- run ----------

interface Result {
  model: string
  title: string
  kind: Case['kind']
  ok: boolean
  correct: boolean
  tests?: string
  leak: boolean
  teaching: number
  firstMs: number
  nextMs: number
  cost: number
  note: string
}

async function runCase(model: string, c: Case): Promise<Result> {
  const usage: Usage[] = []
  const transport = recording(createTransport({ ...process.env, CLUELESS_MODEL: model })!, usage)
  const tutor = new Tutor(transport)
  const base = { model, title: c.title, kind: c.kind }
  try {
    let t = Date.now()
    const first = await tutor.start({ text: c.text })
    const firstMs = Date.now() - t
    t = Date.now()
    const next = await tutor.send({ tag: 'WHAT NEXT', text: '' })
    const nextMs = Date.now() - t
    const solution = first.problem?.hiddenSolution ?? ''
    const turns = [first.turn.message, next.turn.message]
    const [tests, verdict] = await Promise.all([c.kind === 'lc' ? runTests(c, solution) : Promise.resolve(null), judge(c, solution, turns)])
    const correct = tests ? tests.total > 0 && tests.passed === tests.total : verdict.correct
    return {
      ...base,
      ok: true,
      correct,
      tests: tests ? `${tests.passed}/${tests.total}${tests.error ? ` (${tests.error})` : ''}` : undefined,
      leak: verdict.leak,
      teaching: verdict.teaching,
      firstMs,
      nextMs,
      cost: usage.reduce((sum, u) => sum + costOf(model, u), 0),
      note: verdict.note
    }
  } catch (err) {
    return { ...base, ok: false, correct: false, leak: false, teaching: 0, firstMs: 0, nextMs: 0, cost: usage.reduce((s, u) => s + costOf(model, u), 0), note: String((err as Error).message) }
  }
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

const cases = CASES.filter((c) => !ONLY || c.kind === ONLY || c.title.toLowerCase().includes(ONLY.toLowerCase()))
const results: Result[] = []
for (const short of MODELS) {
  const model = idFor(short)
  console.log(`\n${model}: ${cases.length} problems…`)
  const rs = await pool(cases, 4, async (c) => {
    const r = await runCase(model, c)
    const mark = !r.ok ? 'ERROR' : r.correct ? 'right' : 'WRONG'
    console.log(`  ${mark.padEnd(5)} ${r.leak ? 'LEAK ' : '     '} ${c.title.padEnd(26)} first ${(r.firstMs / 1000).toFixed(1)}s, next ${(r.nextMs / 1000).toFixed(1)}s, $${r.cost.toFixed(4)}${r.tests ? `, tests ${r.tests}` : ''}${r.ok ? '' : `: ${r.note}`}`)
    return r
  })
  results.push(...rs)
}
runner.dispose()

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
console.log('\nmodel                         right   LC    calc  CS    leaks  teach  first(med)  next(med)  $/problem')
for (const short of MODELS) {
  const model = idFor(short)
  const rs = results.filter((r) => r.model === model)
  const right = (k?: string): string => {
    const xs = rs.filter((r) => !k || r.kind === k)
    return `${xs.filter((r) => r.correct).length}/${xs.length}`
  }
  const ok = rs.filter((r) => r.ok)
  console.log(
    [
      model.padEnd(29),
      right().padEnd(7),
      right('lc').padEnd(5),
      right('calc').padEnd(5),
      right('cs').padEnd(5),
      String(rs.filter((r) => r.leak).length).padEnd(6),
      (ok.reduce((s, r) => s + r.teaching, 0) / Math.max(1, ok.length)).toFixed(1).padEnd(6),
      `${(median(ok.map((r) => r.firstMs)) / 1000).toFixed(1)}s`.padEnd(11),
      `${(median(ok.map((r) => r.nextMs)) / 1000).toFixed(1)}s`.padEnd(10),
      `$${(rs.reduce((s, r) => s + r.cost, 0) / Math.max(1, rs.length)).toFixed(4)}`
    ].join(' ')
  )
}
const spent = results.reduce((s, r) => s + r.cost, 0) + judgeUsage.reduce((s, u) => s + costOf(judgeTransport.model, u), 0)
console.log(`\nTotal spent (tutors + judge): $${spent.toFixed(2)}`)
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2))
