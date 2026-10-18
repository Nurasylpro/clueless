// A scripted Valid Sudoku session for `npm run ui` (browser mode, no Electron, no API key).
// The visual teammate can use the `visual` examples here to build the visual engine.
import type { AnimateTarget, GapRecord, ProblemView, Recap, Rect, Scene, TurnView } from '../../../shared/contracts'

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
  checkKind: null,
  animation: null
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
      ],
      focus: []
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
      ],
      focus: []
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

// ---------- animations (the Animate button) ----------

/** Where MockDesktop's code sits in the browser page: 40px padding, 18 lines of 28px. */
export const MOCK_CODE_AREA: Rect = { x: 40, y: 40, width: 640, height: 18 * 28 }
const line = (from: number, to = from): { top: number; bottom: number } => ({ top: (from - 1) / 18, bottom: to / 18 })

// LeetCode 36, example 2: the top-left 8 repeats in box 0 (row 0 and row 2).
const BOARD = [
  ['8', '3', '', '', '7', '', '', '', ''],
  ['6', '', '', '1', '9', '5', '', '', ''],
  ['', '9', '8', '', '', '', '', '6', ''],
  ['8', '', '', '', '6', '', '', '', '3'],
  ['4', '', '', '8', '', '3', '', '', '1'],
  ['7', '', '', '', '2', '', '', '', '6'],
  ['', '6', '', '', '', '', '2', '8', ''],
  ['', '', '', '4', '1', '9', '', '', '5'],
  ['', '', '', '', '8', '', '', '7', '9']
]

/** The boxes bins after reading the board up to (row, col), skipping '.' cells. */
function boxesUpTo(row: number, col: number): Scene {
  const bins = Array.from({ length: 9 }, (_, i) => ({ label: `boxes[${i}]`, items: [] as string[] }))
  let flash = -1
  outer: for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (r > row || (r === row && c > col)) break outer
      const v = BOARD[r][c]
      if (!v) continue
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3)
      flash = bins[b].items.includes(v) ? b : -1
      bins[b].items.push(v)
    }
  }
  return { type: 'sets', name: 'boxes', bins, flash }
}

const boardUpTo = (rows: number, highlight: { r: number; c: number }[] = []): Scene => ({
  type: 'grid',
  name: 'board',
  cells: BOARD.map((r, i) => (i < rows ? r : r.map(() => ''))),
  highlight,
  boxSize: 3
})

const seenFrame = (i: number): Scene => {
  const row = ['5', '3', '7', '5']
  const seen = [...new Set(row.slice(0, i))]
  const repeat = seen.includes(row[i])
  return {
    type: 'array',
    name: repeat ? `seen = {${seen.join(', ')}} → ${row[i]} is already in it!` : `seen = {${seen.join(', ')}}`,
    items: row,
    highlight: repeat ? [row.indexOf(row[i]), i] : [i],
    pointers: [{ name: 'i', index: i }]
  }
}

/** What the mock tutor says for each Animate option (text first, then the student plays it). */
export const MOCK_ANIMATIONS: Record<AnimateTarget, Omit<TurnView, 'plan'>> = {
  code: {
    ...base,
    kind: 'hint',
    expects: 'code',
    message:
      'Here’s your loop running on **Example 2**. Watch `boxes`: every digit drops into the box its cell belongs to. Keep an eye on `boxes[0]` near the end. What should your code do at that moment?',
    visual: {
      caption: 'boxes, while reading Example 2',
      frames: [
        boxesUpTo(-1, 0),
        boxesUpTo(0, 0),
        boxesUpTo(0, 1),
        boxesUpTo(0, 4),
        boxesUpTo(1, 0),
        boxesUpTo(1, 5),
        boxesUpTo(2, 1),
        boxesUpTo(2, 2)
      ],
      focus: [line(5), line(9, 12), line(17), line(17), line(17), line(17), line(17), line(13, 14)]
    },
    animation: { target: 'code', area: { displayId: 0, rect: MOCK_CODE_AREA } }
  },
  problem: {
    ...base,
    kind: 'question',
    message:
      'This is **Example 2** from the problem, filled in row by row. It’s Example 1 with one change in the top-left. When it’s done, look at the top-left 3×3 box. Why is the expected output `false`?',
    visual: {
      caption: 'Example 2',
      frames: [boardUpTo(0), boardUpTo(3), boardUpTo(6), boardUpTo(9), boardUpTo(9, [{ r: 0, c: 0 }, { r: 2, c: 2 }])],
      focus: []
    },
    animation: { target: 'problem', area: null }
  },
  question: {
    ...base,
    kind: 'question',
    message:
      'A **set** only remembers *whether* it has seen something. Walk along the row and add each digit. Watch what happens when `5` comes back. So for Sudoku, do you need counts, or just seen-or-not?',
    visual: { caption: 'A set remembers what it has seen', frames: [0, 1, 2, 3].map(seenFrame), focus: [] },
    animation: { target: 'question', area: null }
  }
}
