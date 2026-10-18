# AGENTS.md: Clueless, explained for an AI that will change the animation

You are working on **Clueless**, an Electron app. This file explains what the product does, how the
code is laid out, how the animation works end to end, and exactly where to change things. Read it
fully before editing. The animation code is small and self-contained (see "Where to change what").

## 1. What the product is

Clueless is a study helper that runs in the background and shows up as a small **island** (a pill) at
the top of the screen. It never writes the student's solution; it explains and animates their code.

The flow a student sees:

1. They press **Ctrl/Cmd+Shift+2**. The island appears at the top center, on top of every app.
2. They **highlight code** with the mouse in any app (LeetCode in Chrome, an editor, ...).
3. When they let go, a small **Ask** button appears next to the cursor.
4. They click **Ask**. The app sends the highlighted text plus a screenshot of the screen to Claude.
5. The island has an **Animate On/Off** switch:
   - **On:** the island grows a card with a short text. After **4 seconds** (no button) the screen
     dims and the **animation** plays: the program's variables are simple figures on the left, the
     code is redrawn on the right, a bright box moves to the part of the code that runs, and whatever
     a step changes lights up. The last step freezes. **A click anywhere (or Esc) closes it.** The text
     is gone while the animation plays.
   - **Off:** text answer only, with a small follow-up box. It stays until closed.
6. Ctrl/Cmd+Shift+2 again hides the island.

The animation is a **code trace replay**: Claude reads the highlighted code and writes down every step
it runs (which line, which part of the line, the new value of each variable). The app then plays that
list back. **Claude never draws anything; it only produces data. All drawing is in React code.**

## 2. Run it, test it

Work in `app/`. On Windows PowerShell, use `npm.cmd` instead of `npm` (script policy blocks `npm`).

| Command | What it does |
|---|---|
| `npm run ui` | **Best way to work on the animation.** The island in a normal browser at http://localhost:5199, over a fake LeetCode page, with a **fake Claude** (no key, no Electron). Highlight the code on the right, click Ask, the real animation plays. |
| `npm run dev` | The real Electron app (needs `app/.env` with Claude credentials). On VS Code terminals run `$env:ELECTRON_RUN_AS_NODE = $null` first. |
| `npm run trace -- file.py` | Real Claude traces a file in the terminal and prints the steps. `--json` prints the raw trace, `--effort medium` forces an effort, `--off` is text-only. Use it to check what Claude really returns. |
| `npm run typecheck` | Both TypeScript projects. Must stay clean. |
| `npm test` | Vitest unit tests. Must stay green. |
| `npm run build` | Typecheck + production build. |

After any change: `npm run typecheck && npm test`. For visual changes also look at `npm run ui`.

## 3. Stack

Electron 44 + electron-vite, React 19, TypeScript (strict, `noUnusedLocals`), Tailwind 4 (utility
classes in JSX, a few CSS rules in `app/src/renderer/src/styles.css`), **Motion 12** (`motion/react`,
all animation), zod (the trace schema), Vitest, `uiohook-napi` (global mouse hook), Claude Opus 5.5
via `@anthropic-ai/sdk` or `@anthropic-ai/bedrock-sdk`.

## 4. Map of the code

Only the island/animation path is listed. Everything else in `app/src` (the older tutor: hints, gaps,
answer checker, memory, voice, the side panel) is **parked**: still in the repo and tested, but not
shown by the island. Do not delete it; do not route it back in unless asked.

```
app/src/
  shared/                     used by both the main process and the UI (no Electron imports)
    trace.ts                  THE TRACE FORMAT: zod wire schema + app types + cleaning. Start here.
    islandController.ts       the island's state machine (idle > thinking > reading > playing)
    contracts.ts              types + IPC channel names (the island part is at the bottom)
  main/                       Node side (Electron main process)
    index.ts                  windows, the one hotkey, the Ask button, IPC wiring
    island/
      prompt.ts               THE SYSTEM PROMPT that tells Claude how to trace code
      tracer.ts               the Claude call (effort, streaming, timeout, Bedrock/API)
      selection.ts            notices a finished highlight, copies it, restores the clipboard
      gesture.ts              "was that mouse drag a highlight?"
    windows/windows.ts        the island window, the Ask-button window
  preload/index.ts            exposes window.island to the UI
  renderer/src/
    App.tsx                   chooses what a window shows (#ask = Ask button, else the island)
    island/
      IslandScreen.tsx        the pill, the text card, the 4 s bar, the follow-up box, the Ask button
      TraceOverlay.tsx        THE FULL-SCREEN ANIMATION: controls, code panel, spotlight box, badges
      tracePlayback.ts       step timer, pause/resume, one-step back (always pauses)
      Figures.tsx             THE FIGURES: box / array / grid / set / map and their motion
      traceState.ts           pure functions: values at a step, what changed, loop pass, pointers
      fixtures.ts             a hand-written trace (Contains Duplicate) for the browser mock + tests
      mock.ts, MockPage.tsx, api.ts   the browser mock behind `npm run ui`
```

## 5. How the data flows

```
highlight (mouse) --selection.ts--> text copied --> Ask button --> main/index.ts
   --> IslandController.ask(snippet)        (shared/islandController.ts)
   --> capture screenshot (own windows hidden)
   --> Tracer.ask({snippet, image, animate})  (main/island/tracer.ts)  --> Claude (prompt.ts)
   <-- TraceWire JSON  --fromTraceWire()-->  { message, trace: CodeTrace | null }   (shared/trace.ts)
   --> phase 'reading' (text card, 4 s bar)  --4 s-->  phase 'playing'
   --> IslandView sent to the UI --> TraceOverlay plays trace.steps
```

`IslandView` (in `contracts.ts`) is the only thing the UI receives: `{ animate, phase, snippet,
messages, trace, busySince, error }`. `phase` is `idle | thinking | answer | reading | playing`.
The main process resizes the one island window to match: pill, pill + card, or the whole display
(`playing`). The window is transparent and shown without taking focus.

## 6. The trace format (the contract between Claude and the animation)

Defined in `app/src/shared/trace.ts`. Claude returns (wire format, no nulls, "" and [] for "nothing"):

```jsonc
{
  "message": "Watch `seen` fill up ...",        // the text shown before the animation
  "language": "python",
  "entities": [                                 // every variable, in order of first appearance
    { "id": "nums", "name": "nums", "kind": "array", "indexOf": "" },
    { "id": "seen", "name": "seen", "kind": "set",   "indexOf": "" },
    { "id": "i",    "name": "i",    "kind": "value", "indexOf": "nums" }   // i indexes nums
  ],
  "steps": [                                    // one per executed line, in execution order
    {
      "line": 4, "endLine": 4,                  // 1-based, in the highlighted code
      "focus": "for i in range(len(nums)):",    // exact part of the line to spotlight ("" = whole line)
      "kind": "loop",                           // declare|assign|loop|condition|call|return|other
      "result": "",                             // condition: "true"/"false"; return: the value
      "reads": ["nums"],                        // entity ids this step reads
      "updates": [                              // FULL new value of every entity that changed
        { "entity": "i", "value": { "scalar": "0", "items": [], "entries": [], "rows": [] } }
      ]
    }
  ]
}
```

Entity kinds and the `value` field each uses: `value` -> `scalar`; `array` and `set` -> `items`
(sets in insertion order); `map` -> `entries` (`{key, value}`); `grid` -> `rows` (array of rows).
All values are strings, written the way the language prints them.

`fromTraceWire()` turns it into `CodeTrace` and **repairs** it: lines clamped to the real code,
`focus` dropped if it isn't on that line, unknown entity ids removed, duplicate entities removed,
at most `MAX_STEPS` (120) steps, and `trace` is `null` when there are no entities or steps. So the UI
can assume a `CodeTrace` is always consistent.

Important rule: **updates carry full values, never diffs.** The app computes what changed itself
(`traceState.ts`), so a highlight can never be on the wrong cell because Claude miscounted.

`CodeTrace` = `{ language, code, entities, steps }` where `code` is the normalized snippet
(`normalizeSnippet`: LF line ends, tabs to 4 spaces, common indent removed, blank edges trimmed). Step
line numbers point into this `code`.

## 7. How the animation plays (TraceOverlay.tsx + Figures.tsx)

- **Layout:** full-screen dark overlay (`bg-black/85`). Two columns: figures on the left, the code panel
  on the right. A progress bar at the bottom; "Click anywhere to close" appears on the last step.
- **Step player** (`TracePlayback` in `tracePlayback.ts`): `index` starts at `-1` (`INTRO_MS` = 1100 ms),
  then advances every `STEP_MS` = **2400 ms**, with an extra 1000 ms for meaningful moments. The final
  step gets its full hold before `done`. Pause/Resume (Space) preserves the time remaining. Back
  (Left arrow) moves exactly one step back and pauses, including after completion. There is no
  forward skip or seeking. Esc closes at any time; a click outside the controls closes when done.
- **Values per step** come from `traceState.ts`: `valuesAt(trace, index)` replays `updates` up to
  `index`; `changesAt` diffs step `index` against the one before it (`added`, `scalar`, `indices`,
  `cells`, `items`, `keys`); `pointersAt` puts a yellow `↑ i` marker under the array cell an index
  variable points at (from `entity.indexOf`); `loopPass` counts how many times a loop header ran.
- **Figure states** (`FigureState`): `changed` (white glow ring: the step changed it), `read` (thin
  outline: the step only reads it), `idle` (dimmed to 38% opacity), `rest` (on the last step nothing
  dims). A figure only appears once it has a value (it pops in at the step that declares it).
- **Figure shapes** (`Figures.tsx`), deliberately the simplest possible: `ValueBox` (one box),
  `ArrayRow` (row of boxes with index numbers and the pointer chip), `Grid` (small cells),
  `SetBag` (a rounded bag; new items drop in as amber circles), `MapRows` (key -> value rows). A cell
  or item that changed **flashes amber** (`FLASH`), new values **pop in** (`POP`: scale 1.6 -> 1).
- **The spotlight** (`CodePanel`): the code is redrawn in the right panel with line numbers. For the
  current step the running part is measured with refs (the `focus` text if it was found on the line,
  otherwise the whole line range) and a white **rounded box moves there** with a spring (`BOX_SPRING`).
  Everything else is dark: other lines at 25% opacity, and on the focus line the text outside `focus`
  at 40%. This matches the product's reference image (bright box on the running part, rest darkened).
- **Badges** (`stepBadge`) on the spotlight: condition -> green `✓ true` / red `✗ false`;
  loop -> amber `↻ pass N`; return -> blue `→ value`.
- Code font size shrinks with line count (18/16/14/12 px at <=14/<=24/<=36/more lines).

Design intent to preserve: **slow, smooth, one thing at a time; the simplest shapes; the thing that
changes is always the thing that is highlighted; the animation never gives away the answer.**

## 8. Where to change what

| I want to ... | Change this |
|---|---|
| Speed up / slow down the animation | `STEP_MS`, `INTRO_MS` in `tracePlayback.ts`; extra holds in `traceExpression.ts` |
| Change how the spotlight box looks or moves | the `motion.div` with `BOX_SPRING` at the end of `CodePanel` in `TraceOverlay.tsx` (border, glow, `pad`, spring stiffness/damping) |
| Change how dark the non-running code is | the `opacity-25` and `opacity-40` classes in `CodePanel` |
| Change a figure's look or motion | the matching function in `Figures.tsx` (`ValueBox`, `ArrayRow`, `Grid`, `SetBag`, `MapRows`), plus `POP` / `FLASH` / `SPRING` at the top |
| Change the "this step changed it" glow | the `state === 'changed'` classes in `Figure` (top of `Figures.tsx`) |
| Add a new figure kind (e.g. stack, queue, linked list, tree) | (1) add it to `EntityKind` and, if it needs a new value shape, `EntityValue` in `shared/trace.ts`; (2) teach `diff()` in `traceState.ts` what changed; (3) add the component and a branch in `Figure`; (4) tell Claude in `main/island/prompt.ts` (the "entities" and "Values" paragraphs); (5) add a case to `fixtures.ts` and a test in `traceState.test.ts` |
| Add a new step badge | `stepBadge()` in `TraceOverlay.tsx` (add a `kind`/`result` case) |
| Change the 4-second wait before the animation | `READ_BEFORE_ANIMATION_MS` in `shared/islandController.ts` (and the CSS bar `island-fill` in `styles.css`, 4s) |
| Change what Claude traces / how it explains | `main/island/prompt.ts` (the whole system prompt). Keep it free of per-request data (it is cached). |
| Change how hard Claude thinks | `traceEffort()` and `CLUELESS_TRACE_EFFORT` in `main/island/tracer.ts` (default: medium for <=8 lines, high above; max is opt-in because it measured ~88 s vs ~16 s) |
| Change the trace time limit | `TRACE_TIMEOUT_MS` (150 s) in `tracer.ts` |
| Change when the Ask button disappears | `ASK_BUTTON_MS` in `main/index.ts` |
| Change the pill / text card | `IslandScreen.tsx` |
| Change where the island sits | `placeIsland()` in `main/windows/windows.ts` |
| Test an animation change without Claude | `fixtures.ts` has correct, wrong-condition, and early-return demos; select one in `npm run ui`. Only full known snippets replay; arbitrary code needs Electron. See `app/examples/README.md`. |

## 9. Rules and gotchas

- **Do not make Claude draw.** New visuals mean new *data* in the trace plus new React drawing. Never
  ask Claude for coordinates, SVG, CSS or pixel positions.
- **Schema changes are contract changes.** If you change `TraceWire` in `shared/trace.ts` you must also
  update `main/island/prompt.ts`, `fromTraceWire`, `fixtures.ts`, `renderer/src/island/mock.ts`, and
  the tests. Keep the wire schema **free of unions/nullables** (structured outputs allow few, and
  unions slow schema compilation): use `""`, `-1`, `[]` for "nothing".
- **Both transports must keep working.** The Claude API path uses structured outputs; the Bedrock path
  has no structured outputs, so Claude answers through a `reply` tool shaped like the schema. See
  `tracer.ts`. Both validate with the same zod schema.
- **Keep `shared/` free of Electron and Node imports.** `islandController.ts` and `trace.ts` are run by
  the real app *and* by the browser mock and tests.
- **Do not steal focus from the student's app.** The island window is shown with `showInactive()` so
  their app keeps focus (and their highlight). It only takes focus when it goes full-screen
  (`playing`), so Esc and clicks work there. The Ask-button window is `focusable: false`.
- **Never call `setContentProtection(true)`.** Clueless is visible on screen share by design.
- **Highlights are read by pressing Ctrl/Cmd+C for the student** (`selection.ts`), then restoring the
  clipboard. Do not widen when the mouse hook runs: it only runs while the island is visible.
- **Windows first.** Test display scaling and multiple monitors if you touch window placement. macOS
  needs Accessibility permission for the mouse hook.
- **Electron 44's clipboard is async** (`clipboard.readText()` returns a Promise).
- **Styling:** Tailwind classes in JSX; avoid new CSS files. The overlay is always dark; the figures use
  `white/..` and amber for "changed", emerald/rose for true/false, sky for return.
- **Tests:** pure logic lives in `shared/` and `traceState.ts` precisely so it can be unit tested.
  Add tests there when you change behavior. Animation *looks* are checked by eye in `npm run ui`.
- **Do not commit, push or open PRs unless the user asks.**

## 10. Product decisions already made (do not reopen without asking)

- One hotkey only: Ctrl/Cmd+Shift+2 (show/hide the island).
- The island has: Animate On/Off, Mic (greyed out placeholder, voice is built elsewhere in the repo
  but not wired into the island), Hide.
- Code is selected by **highlighting with the mouse**; the Ask button appears next to the cursor.
- Animate On: text -> 4 s -> full-screen animation (text disappears) -> click anywhere to close.
  Animate Off: text only; stays open; has a follow-up box. Text auto-closes only when Animate is On
  and there was nothing to animate (e.g. the highlight wasn't code).
- Claude **traces by reading** the code (not by running it); works for any language and for unfinished
  code. The app redraws the code itself (rather than spotlighting the real screen) so the spotlight is
  always exactly on the right text. This may be revisited.
- Slow and smooth first; pacing is tuned later (hence `STEP_MS` is easy to change). Playback supports
  Pause/Resume and Back; Back pauses, and forward skip is intentionally unavailable.
- "Animate the problem" (drawing the problem statement's example) is **planned, not built**.
- The screen is sent to Claude as a **screenshot per Ask** (no recording).

## 11. Quick examples of good tasks for you

- "Make the spotlight box pulse once when a condition is true" -> `TraceOverlay.tsx`, the box
  `motion.div`, keyed on `index`.
- "Show a stack (push/pop) for `stack.append` / `stack.pop`" -> new `stack` kind (see the table in
  section 8), draw it vertically in `Figures.tsx`.
- "Make loops show a progress dot row" -> use `loopPass` and the count of loop steps for that line in
  `stepBadge`.
- "Speed up long traces" -> adjust `stepDuration` using `trace.steps.length` in `traceExpression.ts`.
- "Trace came back with wrong values" -> run `npm run trace -- file --json`, then fix
  `main/island/prompt.ts`; the UI is not the problem.
