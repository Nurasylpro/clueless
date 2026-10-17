// A scripted Valid Sudoku session for `npm run ui` (browser mode, no Electron, no API key).
// The visual teammate can use the `visual` examples here to build the visual engine.
import type { GapRecord, ProblemView, Recap, TurnView } from '../../../shared/contracts'

const plan = (current: number): TurnView['plan'] =>
  [
    'Know the 3 rules',
    'Find a repeat in one row',
    'Track rows, columns and boxes',
    'Find which box a cell is in',
    'Put it together in one pass'
  ].map((text, i) => ({
    id: i + 1,
    text,
    status: i + 1 < current ? 'done' : i + 1 === current ? 'current' : 'locked'
  }))

const base = {
  hintLevel: 0,
  verdict: 'none',
  gap: null,
  expects: 'text',
  choices: [],
  visual: null,
  checkKind: null
} satisfies Partial<TurnView>

export const MOCK_PROBLEM: ProblemView = {
  subject: 'coding',
  title: 'Valid Sudoku',
  summary: 'Decide whether a partly filled 9×9 board breaks any Sudoku rule (only filled cells count).',
  language: 'python'
}

const emptyBins = Array.from({ length: 9 }, (_, i) => ({ label: `rows[${i}]`, items: [] as string[] }))

/** Tutor turns, in order. The mock moves to the next one on every answer or button press. */
export const MOCK_TURNS: TurnView[] = [
  {
    ...base,
    kind: 'question',
    message: 'Sudoku validator. What’s tripping you up?',
    expects: 'choice',
    choices: [
      'Don’t know where to start',
      'Not sure what makes a board valid',
      'Stuck on checking the 3×3 boxes',
      'Forgot how to make a list of sets',
      'My output is wrong'
    ],
    plan: plan(1)
  },
  {
    ...base,
    kind: 'feedback',
    verdict: 'partial',
    message: 'Rows and columns ✓. There’s one more region where a digit can’t repeat. Which one?',
    plan: plan(1)
  },
  {
    ...base,
    kind: 'question',
    verdict: 'correct',
    message: 'Yes, the 3×3 boxes. ✓\n\nNow step 2: how would you check **one row** for a repeated digit?',
    plan: plan(2)
  },
  {
    ...base,
    kind: 'side_lesson',
    gap: { type: 'concept_gap', topic: 'hashmaps (dict)' },
    expects: 'code',
    message:
      '**Hashmaps in 2 minutes.** A `dict` maps **keys → values** and finds a key instantly:\n```python\nages = {}\nages["sam"] = 20    # add or update\n"sam" in ages       # True\n```\n**Tiny exercise:** count the letters in `"aab"` so you get `{\'a\': 2, \'b\': 1}`.',
    plan: plan(2)
  },
  {
    ...base,
    kind: 'hint',
    hintLevel: 2,
    verdict: 'incorrect',
    gap: { type: 'careless_slip', topic: 'dict counting with .get' },
    expects: 'code',
    message: 'Close! Run it in your head: the very first time through, what is `count["a"]`?',
    plan: plan(2)
  },
  {
    ...base,
    kind: 'question',
    verdict: 'correct',
    message:
      'Exactly: `count.get(ch, 0) + 1` fixes it. ✓\n\nBack to Sudoku: do you need **how many times** you saw a digit, or just **whether** you saw it?',
    plan: plan(2)
  },
  {
    ...base,
    kind: 'recall_card',
    verdict: 'correct',
    gap: { type: 'recall_slip', topic: 'python list of sets' },
    expects: 'code',
    message:
      'Just whether, so a **set** is enough. **Quick syntax**, a list of N empty sets:\n```python\nseen = [set() for _ in range(N)]\n```\n⚠️ Not `[set()] * N`: that’s N references to the **same** set.',
    plan: plan(3),
    visual: {
      caption: 'rows = [set() for _ in range(9)]',
      frames: [
        { type: 'sets', name: 'rows', bins: emptyBins, flash: -1 },
        {
          type: 'sets',
          name: 'rows',
          bins: emptyBins.map((b, i) => (i === 0 ? { ...b, items: ['5', '3', '7'] } : b)),
          flash: -1
        },
        {
          type: 'sets',
          name: 'rows',
          bins: emptyBins.map((b, i) => (i === 0 ? { ...b, items: ['5', '3', '7', '5'] } : b)),
          flash: 0
        }
      ]
    }
  },
  {
    ...base,
    kind: 'hint',
    hintLevel: 2,
    gap: { type: 'strategy_gap', topic: 'sudoku box index' },
    message:
      'Which box is **row 4, column 7** in (boxes numbered 0–8)? Start with rows only: rows 0–2 are band 0, rows 3–5 are band 1. Which band is row 4?',
    plan: plan(4),
    visual: {
      caption: 'Cell (4, 7)',
      frames: [
        {
          type: 'grid',
          name: 'board',
          cells: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => '')),
          highlight: [{ r: 4, c: 7 }],
          boxSize: 3
        }
      ]
    }
  },
  {
    ...base,
    kind: 'feedback',
    verdict: 'correct',
    expects: 'code',
    message: 'Band 1 for rows, band 2 for columns → box **5**. ✓ Now write it for any cell `(r, c)`.',
    plan: plan(4)
  },
  {
    ...base,
    kind: 'solved',
    verdict: 'correct',
    message:
      '`(r // 3) * 3 + c // 3` ✓ You’ve got every piece. Self-check before you submit: trace a row with **two `"."` cells** by hand. What does your code do?',
    plan: plan(6)
  }
]

export const MOCK_AFTER_RECAP: TurnView = {
  ...base,
  kind: 'feedback',
  verdict: 'correct',
  message: 'That’s it: every cell belongs to exactly one row, one column and one box, so one pass checks all 27 groups. ✓',
  plan: plan(6)
}

export const MOCK_RECAP: Recap = {
  explainBack: 'Why is one pass over the board enough to check all 27 rows, columns and boxes?',
  gaps: [
    { type: 'concept_gap', topic: 'hashmaps (dict)' },
    { type: 'careless_slip', topic: 'dict counting with .get' },
    { type: 'recall_slip', topic: 'python list of sets' },
    { type: 'strategy_gap', topic: 'sudoku box index' }
  ],
  flashcards: [
    { front: 'Python: make a list of 9 empty sets', back: '`[set() for _ in range(9)]` (not `[set()] * 9`)' },
    { front: 'Which 3×3 box is cell `(r, c)` in?', back: '`(r // 3) * 3 + c // 3`' }
  ],
  similarProblem: 'LeetCode 217: Contains Duplicate'
}

export const MOCK_GAPS: GapRecord[] = [
  { id: 'g1', subject: 'coding', type: 'recall_slip', topic: 'python list of sets', timesSeen: 3, firstSeen: '2026-10-10T10:00:00Z', lastSeen: '2026-10-17T10:00:00Z' },
  { id: 'g2', subject: 'coding', type: 'concept_gap', topic: 'hashmaps (dict)', timesSeen: 2, firstSeen: '2026-10-12T10:00:00Z', lastSeen: '2026-10-17T10:00:00Z' },
  { id: 'g3', subject: 'math', type: 'strategy_gap', topic: 'integration by parts: choosing u', timesSeen: 2, firstSeen: '2026-10-11T10:00:00Z', lastSeen: '2026-10-16T10:00:00Z' },
  { id: 'g4', subject: 'math', type: 'careless_slip', topic: 'sign errors when distributing a minus', timesSeen: 1, firstSeen: '2026-10-16T10:00:00Z', lastSeen: '2026-10-16T10:00:00Z' },
  { id: 'g5', subject: 'physics', type: 'concept_gap', topic: 'components of gravity on a ramp', timesSeen: 1, firstSeen: '2026-10-15T10:00:00Z', lastSeen: '2026-10-15T10:00:00Z' }
]
