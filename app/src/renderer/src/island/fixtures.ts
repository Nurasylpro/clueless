// A hand-written trace for the browser mock (`npm run ui`) and the tests: LeetCode 217,
// Contains Duplicate, run on nums = [3, 1, 4, 1]. Same shape Claude sends.
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
const step = (line: number, focus: string, kind: TraceStep['kind'], over: Partial<TraceStep> = {}): TraceStep => ({
  line,
  endLine: line,
  focus,
  kind,
  result: '',
  reads: [],
  updates: [],
  ...over
})

const NUMS = ['3', '1', '4', '1']

function pass(i: number, seenBefore: string[]): TraceStep[] {
  const n = NUMS[i]
  const repeat = seenBefore.includes(n)
  const steps = [
    step(4, 'for i in range(len(nums)):', 'loop', { reads: ['nums'], updates: [{ entity: 'i', value: v({ scalar: String(i) }) }] }),
    step(5, 'n = nums[i]', 'assign', { reads: ['nums', 'i'], updates: [{ entity: 'n', value: v({ scalar: n }) }] }),
    step(6, 'n in seen', 'condition', { result: repeat ? 'true' : 'false', reads: ['n', 'seen'] })
  ]
  if (repeat) steps.push(step(7, 'return True', 'return', { result: 'True' }))
  else steps.push(step(8, 'seen.add(n)', 'call', { reads: ['n'], updates: [{ entity: 'seen', value: v({ items: [...seenBefore, n] }) }] }))
  return steps
}

export const CONTAINS_DUPLICATE: TraceReply & { trace: NonNullable<TraceReply['trace']> } = {
  message:
    'Watch `seen` fill up as the loop walks through `nums = [3, 1, 4, 1]`. Keep an eye on the moment a number shows up that is already inside `seen`.',
  trace: {
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
      step(2, 'nums: List[int]', 'call', { updates: [{ entity: 'nums', value: v({ items: NUMS }) }] }),
      step(3, 'seen = set()', 'declare', { updates: [{ entity: 'seen', value: v({}) }] }),
      ...pass(0, []),
      ...pass(1, ['3']),
      ...pass(2, ['3', '1']),
      ...pass(3, ['3', '1', '4'])
    ]
  }
}

type DemoReply = typeof CONTAINS_DUPLICATE

export const WRONG_CONDITION: DemoReply = {
  message: 'Watch what happens when the first number is checked against an empty `seen`. This input has no duplicates. Which branch does the code take?',
  trace: {
    ...CONTAINS_DUPLICATE.trace,
    code: MOCK_CODE.replace('if n in seen:', 'if n not in seen:'),
    outcome: { status: 'mismatch', expected: 'False', actual: 'True', evidence: 'Example 2: nums = [1, 2, 3, 4] has no duplicate.' },
    steps: [
      step(2, 'nums: List[int]', 'call', { updates: [{ entity: 'nums', value: v({ items: ['1', '2', '3', '4'] }) }] }),
      step(3, 'seen = set()', 'declare', { updates: [{ entity: 'seen', value: v({}) }] }),
      step(4, 'for i in range(len(nums)):', 'loop', { reads: ['nums'], updates: [{ entity: 'i', value: v({ scalar: '0' }) }] }),
      step(5, 'n = nums[i]', 'assign', { reads: ['nums', 'i'], updates: [{ entity: 'n', value: v({ scalar: '1' }) }] }),
      step(6, 'n not in seen', 'condition', { result: 'true', reads: ['n', 'seen'] }),
      step(7, 'return True', 'return', { result: 'True' })
    ]
  }
}

export const EARLY_RETURN: DemoReply = {
  message: 'Watch how many numbers reach `seen` before the function returns. Does the loop ever reach the second `1`?',
  trace: {
    ...CONTAINS_DUPLICATE.trace,
    code: MOCK_CODE.replace('        return False', '            return False'),
    outcome: { status: 'mismatch', expected: 'True', actual: 'False', evidence: 'Example 1: nums = [3, 1, 4, 1] contains a duplicate.' },
    steps: [
      ...CONTAINS_DUPLICATE.trace.steps.slice(0, 6),
      step(9, 'return False', 'return', { result: 'False' })
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
