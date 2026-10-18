# AGENTS.md: Clueless, explained for an AI that will change it

You are working on **Clueless**, an Electron app. This file explains what the product does, how the
code is laid out, how the animation and the voice work end to end, and exactly where to change things.
Read it fully before editing.

## 1. What the product is

Clueless is a study helper that runs in the background as a small **island** (a pill) at the top of the
screen. It explains and animates the student's code; it never writes their solution.

The pill, left to right: **Logo · Mic · Animate · Voice · Expand (⌄)**. There is no Hide button.

- **Ctrl/Cmd+Shift+2** shows or hides the island. **Ctrl/Cmd+Shift+1** starts (or stops) the mic.
- **Highlight code** in any app (LeetCode in Chrome, an editor...). When the mouse is released, an
  **Ask** button appears next to the cursor. Click it: the highlight + a screenshot go to Claude.
- **Expand** opens a card under the pill: the last answer (or the recap of the last animation, with
  **Watch again**), and a text box. A typed or spoken question is a follow-up about the current highlight;
  with nothing highlighted yet, it's about the screen (a screenshot is sent).
- **Mic**: the card opens and shows your words live as you speak (Deepgram). It sends when you pause.

What happens after asking:

|                 | Voice off | Voice on |
|-----------------|-----------|----------|
| **Animate on** (and it's code) | The full-screen animation starts **right away** (no text screen first). One short **line on top** says what each step does. | Same, and the voice **reads each line**; the next step waits until the line has been said. |
| **Animate off** (or not code) | The card opens with the text answer. | The card opens with the text answer and it is **read aloud**. |

- The animation: the screen dims; the line on top; the variables as simple figures on the left; the
  code redrawn on the right with a bright box on the part that runs; controls at the bottom
  (**Back · Pause · Slow / Normal / Fast**). It plays once, freezes on the last step, and a click
  anywhere (or Esc) closes it.
- The **recap** (under 60 words, "what the animation showed") only appears in the card, after the
  animation, when the student expands the island.
- Animate on but the highlight isn't code: text in the card (read aloud with Voice on); it closes by
  itself after a reading time, but not while hovered or being read.

The animation is a **code trace replay**: every executed line, which part of the line, every changed
value, and one spoken line per step. For **Python** the app **runs the code for real** (Pyodide) to get
exact steps and Claude writes the words; for other languages **Claude writes the whole trace**.
**Claude never draws anything; it only produces data. All drawing is in React code.**

## 2. Run it, test it

Work in `app/`. On Windows PowerShell use `npm.cmd` instead of `npm` (script policy blocks `npm`).
In a VS Code terminal run `$env:ELECTRON_RUN_AS_NODE = $null` before `npm run dev`.

| Command | What it does |
|---|---|
| `npm run ui` | The island in a browser (http://localhost:5199) over a fake LeetCode page with a **fake Claude** and a **fake mic** (it pretends you said a question). Pick an example, select the whole code, click Ask. Voice uses the browser's own voice. No keys, no Electron. |
| `npm run dev` | The real app. Needs `app/.env` (Claude: `AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION`, or `ANTHROPIC_API_KEY`; voice: `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE`). |
| `npm run trace -- file.py` | Real Claude traces a file in the terminal and prints every step **with its spoken line**. `--json`, `--effort medium`, `--off` (text only), `--no-run` (Python: Claude writes the trace instead of running it). |
| `npm run voice-check` | Checks the voice keys end to end: ElevenLabs speaks a sentence, Deepgram hears it back through the app's own mic code. |
| `npm run typecheck` / `npm test` | Must stay clean / green. |
| `CLUELESS_SMOKE=1 npm start` | Launches the built app hidden, checks the UI rendered, quits. Add `CLUELESS_SMOKE_VOICE=1` to also fetch a spoken line from inside the island. |

## 3. Stack

Electron 44 + electron-vite, React 19, TypeScript (strict), Tailwind 4, **Motion 12** (`motion/react`),
zod, Vitest, `uiohook-napi` (mouse hook for highlights), **Pyodide** (runs Python in a worker),
**Deepgram nova-3** (speech to text, streamed over a WebSocket from the main process),
**ElevenLabs** (text to speech, through the main process; falls back to the computer's voice),
Claude Opus 5.5 via `@anthropic-ai/sdk` or `@anthropic-ai/bedrock-sdk` (streaming, prompt caching).

## 4. Map of the code (the island path)

Everything else in `app/src` (the older tutor panel: hints, gaps, answer checker, memory, flashcards)
is **parked**: in the repo and tested, not shown. Don't delete it; don't route it back in unless asked.

```
app/src/
  shared/                     no Electron/Node imports (the app, the browser mock and tests all use them)
    trace.ts                  THE TRACE FORMAT: wire schema (+ intro, say, code, run), NarrationWire,
                              fromTraceWire (repairs replies), withNarration (fills missing lines), codeNames
    narrate.ts                makes a step's line from its data when Claude didn't write one
    islandController.ts       the island's state machine (see section 5)
    contracts.ts              IslandView, ISLAND_IPC, IslandApi at the bottom; voice types + IPC above
    speechText.ts             Markdown/code -> words a voice can say
  main/
    index.ts                  windows, hotkeys (+2 island, +1 mic), Ask button, IPC, Deepgram + ElevenLabs
    island/
      prompt.ts               TRACE_PROMPT and NARRATE_PROMPT: what Claude writes and how
      tracer.ts               the Claude calls (Conversation helper), Python run + narration, effort, timeouts
      selection.ts, gesture.ts  noticing a finished highlight, copying it, restoring the clipboard
    run/python.ts, pyTrace.ts Pyodide runner: runs Python in a worker and records every step
    voice/deepgram.ts         one streamed utterance at a time (keyterms = names from the code)
    voice/elevenlabs.ts       text -> mp3, voice chosen by name (ELEVENLABS_VOICE)
    windows/windows.ts        island window (pill / pill+card / full screen), Ask-button window
  preload/index.ts            window.island (island API) and window.clueless (voice: mic + tts)
  renderer/src/
    App.tsx                   #ask = Ask button; island in Electron; MockPage in a plain browser
    island/
      IslandScreen.tsx        the pill, the card, the mic UI, reading text answers aloud, the Ask button
      TraceOverlay.tsx        THE ANIMATION: caption on top, figures, code + spotlight, controls, speed
      tracePlayback.ts        THE CLOCK: holds per step, voice sync (Speaker), pause/back, speed
      narrator.ts             THE VOICE OF THE ANIMATION: ElevenLabs with prefetch, rate, fallback
      Figures.tsx             box / array / grid / set / map figures and their motion
      traceState.ts           values at a step, what changed, loop pass, pointers
      traceExpression.ts      meaningful moments, the finish message
      fixtures.ts             hand-written demo traces (with intro and lines) for the mock and tests
      mock.ts, MockPage.tsx, fakeVoice.ts, api.ts   the browser mock behind `npm run ui`
    voice/speech.ts, speaker.ts, useVoiceInput.ts   speaking replies; the mic recorder
```

## 5. How the data flows

```
highlight --selection.ts--> Ask --> IslandController.ask(snippet)
typed / spoken text ---------------> IslandController.askText(text)  (follow-up, or a [SCREEN] question)
   --> thinking (pill shows "Tracing 12s", or the card shows it if open)
   --> Tracer (main/island/tracer.ts):
         Python + Animate: [RUN] plan (low effort) -> Pyodide run -> [NARRATE] words (low effort)
         other + Animate:  Claude writes the trace with words (medium <=14 lines, else high)
         Animate off:      Claude answers in text (medium)
   <-- { message, trace } (fromTraceWire / withNarration: every step has a `say` line)
   --> trace: phase 'playing' (window goes full screen) ; recap = the message, kept for the card
   --> no trace: phase 'answer', the card opens (read aloud with Voice on)
finish (click / Esc) --> phase 'idle', card closed; Expand shows the recap + Watch again (replay)
```

`IslandView` = `{ animate, voice, expanded, phase, snippet, messages, trace, recapAt, playId, busySince,
error }`, phase `idle | thinking | answer | playing`. The main process sizes the one island window from
it: `playing` -> full display, `expanded` -> pill + card, else just the pill.

## 6. The trace format

`app/src/shared/trace.ts`. Claude returns (no nulls: `""` and `[]` mean nothing):

```jsonc
{
  "message": "Recap, under 60 words, shown in the card after the animation (or the text answer)",
  "intro": "Let's run it on nums = [3, 1, 4, 1] and watch seen fill up.",   // shown + said before step 1
  "language": "python",
  "code": "",                       // [SCREEN] only: the code Claude copied from the screenshot
  "outcome": { "status": "matched|mismatch|unknown", "expected": "", "actual": "", "evidence": "" },
  "entities": [ { "id": "seen", "name": "seen", "kind": "set", "indexOf": "" } ],
  "steps": [ {
      "line": 6, "endLine": 6, "focus": "n in seen", "kind": "condition", "result": "true",
      "reads": ["n", "seen"], "updates": [],
      "say": "Is 1 already in seen? Yes, we saw it before!"   // the line on top, read aloud
  } ],
  "run": { "setup": "", "call": "" }   // [RUN] only: how the app runs the Python itself
}
```

Kinds: `value` (scalar), `array`/`set` (items), `map` (entries), `grid` (rows). Updates carry **full
values, never diffs**; the app computes what changed (`traceState.ts`). `fromTraceWire` clamps lines,
drops focus not on its line and unknown entities, caps at 120 steps, and fills any empty `say` from
the step data (`narrate.ts`), so the UI can trust every field. For a Python run, `NarrationWire`
(`{ intro, message, says[] }`) supplies the words for the recorded steps.

## 7. How the animation plays

- **TraceOverlay.tsx**: caption on top (the intro at index -1, then each step's `say`; at the end the
  finish message, celebrating only an evidenced example match), figures left, code right, controls
  bottom. Space = pause/resume, ← = back one step (pauses), Esc = close, click closes when done.
- **tracePlayback.ts** (`TracePlayback`): each step is *held*:
  - silent: `holdMs` = max(`STEP_MS` 2400 ms (+1000 at a meaningful moment), time to read the line) / speed;
  - with voice: until the `Speaker` says the line is done, then `gapMs` (550 ms) / speed.
  Pause keeps the time left; with voice, resume says the current line again from the start; Back is
  silent until resumed. `setRate` changes the pace mid-step. Speeds: **Slow 0.8, Normal 1, Fast 1.2**
  (remembered in localStorage `clueless.speed`).
- **narrator.ts**: the `Speaker` for the animation. Downloads ElevenLabs audio for the next 3 lines
  while one plays (no gaps), plays it at the chosen speed with the pitch kept, and falls back to the
  computer's voice (then to a reading-time timer) so the animation never stalls.
- **Figures.tsx**: `changed` = white glow + amber pop/flash, `read` = thin outline, `idle` = dimmed,
  `rest` = nothing dims on the last step. Pointer chips (`↑ i`) under array cells.
- **The spotlight** (`CodePanel`): a white rounded box springs to the `focus` text (or the lines);
  other lines at 25% opacity. Badges: `✓ true` / `✗ false`, `↻ pass N`, `→ value`.

Design intent: **slow, smooth, one thing at a time; the simplest shapes; what changes is what's lit;
the words on top match the picture and the voice; never give away the answer.**

## 8. Where to change what

| I want to ... | Change this |
|---|---|
| Pace of the animation | `STEP_MS`, `INTRO_MS`, `GAP_MS`, `SPEEDS`, `holdMs` in `tracePlayback.ts`; extra holds in `traceExpression.ts` |
| What the voice / caption says | `say` rules in `TRACE_PROMPT` and `NARRATE_PROMPT` (`main/island/prompt.ts`); the fallback wording in `shared/narrate.ts` |
| The caption's look | `Caption` in `TraceOverlay.tsx` and `.caption-line` in `styles.css` |
| The voice itself | `ELEVENLABS_VOICE` / `ELEVENLABS_MODEL` in `.env`; settings in `main/voice/elevenlabs.ts`; prefetch depth `PREFETCH` in `narrator.ts` |
| When the mic stops listening | `DEEPGRAM_URL` (endpointing / utterance_end_ms) and `TIMEOUTS` in `main/voice/deepgram.ts` |
| Words Deepgram listens for | `codeNames()` in `shared/trace.ts` (keyterms) |
| The pill or the card | `IslandScreen.tsx` |
| Speed buttons, Back/Pause | `PlaybackControls` in `TraceOverlay.tsx` |
| Spotlight look/motion | the box `motion.div` with `BOX_SPRING` in `CodePanel` |
| A figure's look | `Figures.tsx` |
| A new figure kind (stack, queue, tree...) | `EntityKind`/`EntityValue` in `trace.ts` -> `diff()` in `traceState.ts` -> a component in `Figures.tsx` -> describe it in both prompts -> `narrate.ts` wording -> fixture + test |
| Claude effort / time limits | `traceEffort`, `TRACE_TIMEOUT_MS`, `NARRATE_TIMEOUT_MS` in `tracer.ts` (`CLUELESS_TRACE_EFFORT` in `.env` forces one) |
| Island placement / sizes | `placeIsland()` in `main/windows/windows.ts` |
| Test without Claude | `fixtures.ts` (demo traces with lines) + `npm run ui` |

## 9. Rules and gotchas

- **Never make Claude draw** (no coordinates, SVG, CSS). New visuals = new data + React drawing.
- **Schema changes are contract changes**: `TraceWire` changes must also update both prompts,
  `fromTraceWire`, `python.ts` (`toCodeTrace`), `fixtures.ts`, `mock.ts` and the tests. Keep the wire
  schema free of unions/nullables.
- **Both Claude transports must work**: structured outputs (Claude API) and a tool named like the reply
  (`reply` / `narrate`) on Bedrock. `Conversation` in `tracer.ts` handles both.
- **Keep `shared/` free of Electron and Node imports.**
- **Keys stay in the main process** (`.env`): the UI asks for audio through `window.clueless.tts` and
  streams mic audio through IPC; it never sees a key.
- **One speaker at a time**: text answers use `voice/speaker.ts`; the animation uses its own narrator;
  starting the mic stops both (half-duplex); hiding the island stops everything.
- **Don't steal focus**: the island is shown with `showInactive()`; it takes focus only when the
  animation goes full screen (so Space / ← / Esc work). The Ask button never takes focus.
- **Never call `setContentProtection(true)`**: visible on screen share by design.
- **Highlights are read by pressing Ctrl/Cmd+C for the student**, then the clipboard is restored. The
  mouse hook runs only while the island is visible. Careful in terminals.
- **Electron 44's clipboard is async.** Windows first; macOS needs Accessibility + Screen Recording.
- **Do not commit, push or open PRs unless the user asks.**

## 10. Product decisions already made (don't reopen without asking)

- Hotkeys: Ctrl/Cmd+Shift+2 island, Ctrl/Cmd+Shift+1 mic. Nothing else.
- Pill: Logo · Mic · Animate · Voice · Expand. No Hide button, no hint/finish/recap buttons.
- Animate on: no intro text screen; straight into the animation with a line on top; the recap
  (<60 words) only in the card afterwards. Text disappears from everywhere else.
- Voice on: every line on top is read aloud and the animation waits for it. Text answers are read aloud.
- Speed: Slow / Normal / Fast in words (0.8 / 1 / 1.2). Pause keeps your place; Back pauses silently.
- Claude writes the per-step lines; the app's own sentence is only a backup.
- Python is run for real for exact values; other languages are traced by Claude.
- The code is redrawn by Clueless (not spotlighted on the real screen), so the box is always exact.
- A screenshot is sent per question (no screen recording).
- "Animate the problem" is planned, not built.
