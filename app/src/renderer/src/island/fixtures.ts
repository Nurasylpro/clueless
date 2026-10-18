// Hand-written traces for the browser mock (`npm run ui`) and the tests: LeetCode 217,
// Contains Duplicate, plus two buggy versions. Same shape Claude sends, words included.
import { normalizeSnippet, type EntityValue, type TraceReply, type TraceStep } from '../../../shared/trace'

export const MOCK_CODE = `class Solution:
    def containsDuplicate(self, nums: List[int]) -> bool:
        seen = set()
        for i in range(len(nums)):
            n = nums[i]
            if n in seen:
                return True
            seen.add(n)
        return False`

const v = (over: Partial<EntityValue>): EntityValue => ({ scalar: '', items: [], entries: [], rows: [], ...over })
const step = (line: number, focus: string, kind: TraceStep['kind'], say: string, over: Partial<TraceStep> = {}): TraceStep => ({
  line,
  endLine: line,
  focus,
  kind,
  result: '',
  reads: [],
  updates: [],
  say,
  ...over
})

const NUMS = ['3', '1', '4', '1']
const ORDINAL = ['first', 'second', 'third', 'fourth']

function pass(i: number, seenBefore: string[]): TraceStep[] {
  const n = NUMS[i]
  const repeat = seenBefore.includes(n)
  const steps = [
    step(4, 'for i in range(len(nums)):', 'loop', i === 0 ? '`i` starts at 0, the first number.' : `\`i\` moves to ${i}, the ${ORDINAL[i]} number.`, {
      reads: ['nums'],
      updates: [{ entity: 'i', value: v({ scalar: String(i) }) }]
    }),
    step(5, 'n = nums[i]', 'assign', `\`n\` takes the number at that spot: ${n}.`, {
      reads: ['nums', 'i'],
      updates: [{ entity: 'n', value: v({ scalar: n }) }]
    }),
    step(6, 'n in seen', 'condition', repeat ? `Is ${n} already in \`seen\`? Yes, we saw it before!` : `Is ${n} already in \`seen\`? No.`, {
      result: repeat ? 'true' : 'false',
      reads: ['n', 'seen']
    })
  ]
  if (repeat) steps.push(step(7, 'return True', 'return', 'So we return True: a number appears twice.', { result: 'True' }))
  else
    steps.push(
      step(8, 'seen.add(n)', 'call', `So we remember it: ${n} goes into \`seen\`.`, {
        reads: ['n'],
        updates: [{ entity: 'seen', value: v({ items: [...seenBefore, n] }) }]
      })
    )
  return steps
}

export const CONTAINS_DUPLICATE: TraceReply & { trace: NonNullable<TraceReply['trace']> } = {
  message:
    'The loop walked through `nums = [3, 1, 4, 1]`, adding each new number to `seen`. 3, 1 and 4 were new. When the second **1** arrived, `n in seen` was true for the first time, so the function returned **True** right away.',
  trace: {
    intro: 'Let’s run it on nums = [3, 1, 4, 1] and watch `seen` fill up.',
    language: 'python',
    outcome: { status: 'matched', expected: 'True', actual: 'True', evidence: 'For nums = [3, 1, 4, 1], the value 1 appears twice.' },
    code: MOCK_CODE,
    entities: [
      { id: 'nums', name: 'nums', kind: 'array', indexOf: null },
      { id: 'seen', name: 'seen', kind: 'set', indexOf: null },
      { id: 'i', name: 'i', kind: 'value', indexOf: 'nums' },
      { id: 'n', name: 'n', kind: 'value', indexOf: null }
    ],
    steps: [
      step(2, 'nums: List[int]', 'call', 'We start with `nums` holding 3, 1, 4 and 1.', { updates: [{ entity: 'nums', value: v({ items: NUMS }) }] }),
      step(3, 'seen = set()', 'declare', '`seen` starts as an empty set.', { updates: [{ entity: 'seen', value: v({}) }] }),
      ...pass(0, []),
      ...pass(1, ['3']),
      ...pass(2, ['3', '1']),
      ...pass(3, ['3', '1', '4'])
    ]
  }
}

type DemoReply = typeof CONTAINS_DUPLICATE

export const WRONG_CONDITION: DemoReply = {
  message:
    'On `nums = [1, 2, 3, 4]` there are no duplicates, but the very first check `n not in seen` was true, because `seen` was still empty. So the function returned **True** after one number. Which way round should that check be?',
  trace: {
    ...CONTAINS_DUPLICATE.trace,
    intro: 'Let’s run it on nums = [1, 2, 3, 4], which has no duplicates.',
    code: MOCK_CODE.replace('if n in seen:', 'if n not in seen:'),
    outcome: { status: 'mismatch', expected: 'False', actual: 'True', evidence: 'Example 2: nums = [1, 2, 3, 4] has no duplicate.' },
    steps: [
      step(2, 'nums: List[int]', 'call', 'We start with `nums` holding 1, 2, 3 and 4.', { updates: [{ entity: 'nums', value: v({ items: ['1', '2', '3', '4'] }) }] }),
      step(3, 'seen = set()', 'declare', '`seen` starts as an empty set.', { updates: [{ entity: 'seen', value: v({}) }] }),
      step(4, 'for i in range(len(nums)):', 'loop', '`i` starts at 0, the first number.', { reads: ['nums'], updates: [{ entity: 'i', value: v({ scalar: '0' }) }] }),
      step(5, 'n = nums[i]', 'assign', '`n` takes the first number: 1.', { reads: ['nums', 'i'], updates: [{ entity: 'n', value: v({ scalar: '1' }) }] }),
      step(6, 'n not in seen', 'condition', 'Is 1 not in `seen`? True, seen is still empty.', { result: 'true', reads: ['n', 'seen'] }),
      step(7, 'return True', 'return', 'So it returns True after just one number.', { result: 'True' })
    ]
  }
}

export const EARLY_RETURN: DemoReply = {
  message:
    'On `nums = [3, 1, 4, 1]`, only 3 reached `seen`. The `return False` sits inside the loop, so the function stopped after the first pass and never saw the second **1**. Where should that line be?',
  trace: {
    ...CONTAINS_DUPLICATE.trace,
    intro: 'Let’s run it on nums = [3, 1, 4, 1] and count how many numbers get checked.',
    code: MOCK_CODE.replace('        return False', '            return False'),
    outcome: { status: 'mismatch', expected: 'True', actual: 'False', evidence: 'Example 1: nums = [3, 1, 4, 1] contains a duplicate.' },
    steps: [
      ...CONTAINS_DUPLICATE.trace.steps.slice(0, 6),
      step(9, 'return False', 'return', 'And it returns False already, inside the loop.', { result: 'False' })
    ]
  }
}

export const DEMO_EXAMPLES = [
  { id: 'correct', label: 'Correct code', reply: CONTAINS_DUPLICATE },
  { id: 'wrong-condition', label: 'Wrong condition', reply: WRONG_CONDITION },
  { id: 'early-return', label: 'Early return', reply: EARLY_RETURN }
] as const

/** Mock replays apply only to the complete, known snippet, never to unrelated selected code. */
export function demoReplyFor(snippet: string): DemoReply | undefined {
  const code = normalizeSnippet(snippet)
  return DEMO_EXAMPLES.find((example) => normalizeSnippet(example.reply.trace.code) === code)?.reply
}
