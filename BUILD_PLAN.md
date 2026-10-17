# Clueless: build plan

**How to use this file**
- **Ticking boxes:** edit the file and change `- [ ]` to `- [x]`, then commit. On GitHub, use the
  pencil icon.
- **Your section:** each person works only in their own section and their own folders (see
  [SPEC.md §7.5](SPEC.md#75-folders-the-app-is-created-at-the-event-with-the-electron-vite-react-ts-template)).
- **Checkpoints (✅):** everyone stops, merges and tests together on **both macOS and Windows**.
- **Timing:** hours assume a **24-hour** event. If it's 36 hours, stretch each phase and pull in
  stretch goals after Checkpoint B.
- **Stuck rule:** blocked for 30 minutes? Ask in the team chat. Don't sit on it.

## Who owns what

| Person | Owns | Folders |
|---|---|---|
| **Ali** (lead) | Tutor brain: contracts, Claude calls, prompts, subject packs, gap logic. Also merging, the pitch and the demo script. | `src/shared/`, `src/main/tutor/` |
| **Nuris** | Desktop shell: overlay window, hotkeys, screen capture, area select, stuck detection, answer checker, builds for both OSes | `src/main/` (windows, capture, stuck, checker), `src/preload/` |
| **Rasim** | Everything the user sees: overlay UI, math display and input, visual engine, animations | `src/renderer/` |
| **Nurassyl** | Voice, memory (database, flashcards, gap map, recap screen), demo problems, mock data, backup video | `src/main/voice/`, `src/main/memory/`, `src/renderer/screens/recap/`, `fixtures/` |

**Git rules**
- One branch per task: `name/short-thing` (e.g. `rasim/hint-ladder`).
- Open small PRs into `main`. Ali merges them.
- Pull `main` before starting each task.
- Never commit `.env`.

---

## Before the event (no app code)

**Everyone**
- [ ] Read [SPEC.md](SPEC.md) start to finish
- [ ] Install Git, the current Node.js LTS and an editor; clone this repo
- [ ] Post your laptop's OS in the team chat (we need at least one Windows tester)
- [ ] Check the event rules on what can be prepared before the event

**Ali**
- [ ] Anthropic API key; check credits; ask the organizers about sponsor credits
- [ ] Read the Claude docs: vision (images), structured outputs, prompt caching, effort
- [ ] Draft the first 20 seconds of the pitch (the problem + the UPenn finding)

**Nuris**
- [ ] Read the Electron docs: `BrowserWindow` (transparent, always on top), `globalShortcut`, `desktopCapturer`, `systemPreferences`, `screen`
- [ ] Read the electron-builder docs (mac + win targets)
- [ ] Read the math.js docs: `parse`, `derivative`, `evaluate`, units

**Rasim**
- [ ] Sketch the overlay on paper or in Figma: panel, plan steps, hint level, message card, input, quick buttons, "Stuck?" bubble
- [ ] Read the docs: Mafs, Motion, KaTeX, MathLive, Tailwind

**Nurassyl**
- [ ] Deepgram account + key (ElevenLabs only if we do the stretch goal)
- [ ] Read the docs: Deepgram live streaming, ts-fsrs, better-sqlite3
- [ ] Gather the demo problems (Valid Sudoku, ∫ x² eˣ dx, block on a ramp) plus 2 backups per subject; screenshot each one

---

## Phase 0: Kickoff (hours 0–2)

**Together**
- [ ] Ali writes `src/shared/contracts.ts` from SPEC §7.3; everyone reviews it (30 minutes max)
- [ ] Nuris creates the app: electron-vite `react-ts` template in `app/`; adds `.gitignore` and `.env.example`; pushes
- [ ] Everyone runs `npm install` and `npm run dev` on their own laptop (macOS **and** Windows)
- [ ] Rasim adds Tailwind; Nurassyl adds `fixtures/` with 2 mock `TutorTurn`s so the UI has data from minute one

---

## Phase 1: Core loop (hours 2–8)

**Ali: tutor brain**
- [ ] Claude client in the main process, key read from `.env`
- [ ] `analyze(screenshot)` → `ProblemState` using structured outputs
- [ ] `respond(state, history, message)` → `TutorTurn`, with hint levels 1–5
- [ ] Base system prompt (SPEC §3 and §7.2) + the coding pack
- [ ] Remove `hiddenSolution` before anything goes over IPC
- [ ] A test script that runs `analyze` on the fixture screenshots (no UI needed)

**Nuris: desktop shell**
- [ ] Overlay window: transparent, frameless, always on top, draggable, visible on all workspaces
- [ ] Ctrl/Cmd+Shift+Space: show the panel and capture the active window
- [ ] macOS Screen Recording check, with a friendly "how to allow" message
- [ ] Preload script exposes the `IPC` channels from the contracts
- [ ] Connect capture → Ali's `analyze` → `tutor:turn` to the UI

**Rasim: UI**
- [ ] Panel layout: subject chip, plan steps (done/current/locked), message card, input, quick buttons
- [ ] Render Markdown + KaTeX in messages
- [ ] Hint-level indicator (1–5) and a "Reveal" button (locked until 3 attempts)
- [ ] Busy/loading state (`tutor:busy`)
- [ ] Run everything on fixture data until the real IPC is ready

**Nurassyl: voice + memory + fixtures**
- [ ] `fixtures/`: 5 `TutorTurn` JSONs per demo problem (question, hint, recall card, side lesson, solved)
- [ ] SQLite: create the tables from SPEC §7.4; save sessions and turns
- [ ] Mic in the UI → MediaRecorder chunks over IPC → Deepgram in the main process → `voice:transcript`
- [ ] Transcript fills the input box

### ✅ Checkpoint A (hour 8)
- [ ] On LeetCode: hotkey → a real question appears → you type an answer → the next hint appears
- [ ] Works on macOS
- [ ] Works on Windows

---

## Phase 2: Features (hours 8–16)

**Ali**
- [ ] Gap detection: recall / concept / strategy / careless, including the "what do you want it to do?" check
- [ ] Side-lesson detour with a "Back to the problem" button; the plan stays pinned
- [ ] `quick()` for recall questions (effort `low`)
- [ ] Math pack + physics pack prompts, including the `check` field (`AnswerCheck`)
- [ ] `visual` output for each pack (Valid Sudoku `sets`, the calc `plot`, the ramp `vectors`)
- [ ] "Check my work": takes a new screenshot → feedback, without pointing at the mistake

**Nuris**
- [ ] Area select (Ctrl/Cmd+Shift+2): dim the screen and drag a box (handle Windows display scaling)
- [ ] Stuck detector: thumbnail every 15 s + `pixelmatch`; no change for 2 min → `stuck:level`
- [ ] Answer-site detection with `get-windows` (ChatGPT, Chegg, Photomath, Symbolab, Course Hero, Brainly)
- [ ] 3 wrong answers in a row (from the tutor state) → `stuck:level`
- [ ] Checker: `equivalent` (compare at 5 random points), `antiderivative` (differentiate, then compare), `units`

**Rasim**
- [ ] Visual engine: `array`, `grid`, `sets`, `hashmap` (SVG + Motion)
- [ ] `plot` and `vectors` with Mafs (ramp drawn from `surfaceAngleDeg`)
- [ ] Step through frames (prev/next) + animations (the red flash on a repeated number)
- [ ] MathLive input when `expects === 'math'`; code font when `expects === 'code'`
- [ ] Stuck dot (glow) + "Stuck?" bubble with [How do I write…] [What next?] [I'm fine]

**Nurassyl**
- [ ] Voice hotkey Ctrl/Cmd+Shift+1 + mic button; stops on its own when you pause
- [ ] Think-aloud mode: transcript chunks go to the tutor, which only speaks up when something's off (with Ali)
- [ ] `gaps` table + flashcards with ts-fsrs; 3rd recall slip on the same topic → "guess first"
- [ ] Recap screen: explain-back question, gaps found, hints used, next practice

### ✅ Checkpoint B (hour 16)
- [ ] Coding demo (Valid Sudoku) works end to end
- [ ] Math demo (∫ x² eˣ dx) works end to end
- [ ] Physics demo (ramp) works end to end
- [ ] All three work on macOS **and** Windows

---

## Phase 3: Polish + demo (hours 16–24)

**Ali**
- [ ] Run each demo problem 5 times and fix any answer leaks (the leak test in SPEC §7.2)
- [ ] Speed pass: effort levels, screenshot size, prompt caching. Target: under 3 s per turn
- [ ] Pitch slides + script (SPEC §10); rehearse 3 times with the team

**Nuris**
- [ ] Package the .dmg and .exe with electron-builder
- [ ] Fresh-install test on both OSes, including the permission flow
- [ ] Error states: no internet, no permission, API error, empty screen
- [ ] Optional: frosted-glass panel (macOS `vibrancy`, Windows 11 `backgroundMaterial: 'acrylic'`)

**Rasim**
- [ ] Polish: light/dark, spacing, transitions, empty and loading states
- [ ] Gap map screen visuals (with Nurassyl)
- [ ] Screenshots for the README and Devpost

**Nurassyl**
- [ ] Record a backup video of each demo flow
- [ ] Set up the demo laptop: keys, problems open in tabs, mic tested, notifications off
- [ ] Devpost write-up

### ✅ Checkpoint C (hour 20): feature freeze
- [ ] After this, bug fixes only

---

## Stretch (only after Checkpoint B is all green)

- [ ] Python code tracer with Pyodide, plus a step slider (Ali + Rasim)
- [ ] Mock interview mode by voice (Nurassyl + Ali)
- [ ] Read hints aloud (Nurassyl)
- [ ] Tree / graph / number line visuals (Rasim)
- [ ] Paper mode via webcam (Nuris)
- [ ] "Try a similar problem" generator (Ali)
- [ ] Help-log export (Nurassyl)

---

## Ready to demo when

- [ ] All 3 demo flows work 3 times in a row on the demo laptop
- [ ] No final answer is ever shown without Reveal
- [ ] 10 seconds of it running on Windows is ready to show
- [ ] Backup video is on the laptop **and** a phone
- [ ] README has screenshots and "how to run"
