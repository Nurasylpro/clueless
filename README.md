# Clueless

> Cluely gives you answers. **Clueless gives you clues.**

A see-through study panel that floats over any app. Stuck on a problem (code, math, physics, anything)?
Press **Ctrl/Cmd+Shift+Space**. Clueless reads your screen and coaches you through the problem with
questions and small steps. It never just hands you the answer.

- Works in **any app**, on **macOS and Windows**
- **Any subject:** coding, math, physics and more
- **Hints that get bigger only when you need them** (5 levels). Reveal unlocks only after 3 real tries.
- **Gap detection:**
  - forgot the syntax → it shows you right away
  - don't get the concept → a 2-minute side lesson
  - wrong approach → questions
  - careless slip → "check your work"
- **A math engine checks answers** (math.js), so a right answer is never marked wrong by an AI arithmetic slip
- **Notices when you're stuck:** the screen hasn't changed, 3 wrong answers in a row, or you opened ChatGPT or Chegg
- **Memory:** a recap after each problem, flashcards (spaced repetition) and a gap map
- **Visible by design:** it shows up on screen share and doesn't hide the way Cluely does

## Status

| Part | Status |
|---|---|
| Overlay, hotkeys, screen and area capture, glass UI | ✅ built |
| Tutor brain (Claude), hints, gaps, recap | ✅ built |
| Answer checker, stuck detection, memory and flashcards | ✅ built, 27 tests |
| **Visuals** (arrays, grids, plots, force diagrams…) | 🔜 Rasim: the tutor already sends the data; see `app/src/renderer/src/components/VisualSlot.tsx` |
| **Voice** (talk to answer, think-aloud) | 🔜 Nurassyl: see `app/src/main/voice/README.md` |

Docs: [SPEC.md](SPEC.md) has the idea and specs. [BUILD_PLAN.md](BUILD_PLAN.md) has what's done and what's left.

## Run it

You need [Node.js](https://nodejs.org) (current LTS) and access to Claude through **Amazon Bedrock** (or a Claude API key).

```bash
cd app
npm install
cp .env.example .env      # then fill in the Bedrock lines (or ANTHROPIC_API_KEY)
npm run try -- "Integrate x^2 e^x dx"     # checks your credentials in the terminal
npm run dev
```

**Bedrock setup** (in `app/.env`):
- `AWS_REGION`: for example `us-east-1`
- Sign in with **one** of:
  - `AWS_BEARER_TOKEN_BEDROCK`: a Bedrock API key from AWS console → Amazon Bedrock → API keys
  - `AWS_PROFILE`: after `aws configure sso`
  - access keys
- The default model is `anthropic.claude-opus-5-5`. If your account doesn't have access to it, set `CLUELESS_MODEL=anthropic.claude-opus-4-8`.

Press **Ctrl/Cmd+Shift+Space** on any problem, or **Ctrl/Cmd+Shift+2** to select just the problem. It also
works over **full-screen apps** (a full-screen browser, for example).

**macOS:**
- Clueless lives in the **menu bar** (magnifier icon), not the dock. Use that icon to show it, ask, or quit.
- The first time, allow **Screen Recording** in System Settings → Privacy & Security, for the app you run it from (Terminal, VS Code…). Then restart it.

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with live reload |
| `npm run ui` | Just the UI, in a browser at http://localhost:5199, with a fake Valid Sudoku session. No Electron or key needed. Good for building the visuals. |
| `npm run try -- "your problem"` | Talk to the tutor in the terminal (add `--image shot.png` to use a screenshot, `--debug` to see the hidden solution) |
| `npm test` | Unit tests (checker, stuck detection, memory, tutor, session) |
| `npm run typecheck` | TypeScript checks |
| `npm run dist:mac` / `npm run dist:win` | Build an installer (.dmg / .exe). Build the Windows one on Windows. |

`CLUELESS_SMOKE=1 npm start` launches the real app hidden, checks that the UI rendered, then quits.

## How it's built

```
app/src/
  shared/      contracts.ts (types + IPC), schema.ts (Claude's reply format), mathText.ts
  main/        index.ts (windows, hotkeys, IPC) · session.ts (the tutoring loop)
    tutor/     Claude calls + system prompt
    checker/   math.js answer checks
    stuck/     stuck detection
    memory/    gaps, flashcards, sessions (a JSON file in the app's data folder)
    capture/   screen capture · windows/  overlay + area selector
    voice/     🔜
  preload/     the safe bridge the UI talks through (window.clueless)
  renderer/    React UI (Tailwind) · mock/ = fake data for `npm run ui`
```

Built with Electron, React, TypeScript, Tailwind, Claude Opus 5.5 on Amazon Bedrock or the Claude API (prompt caching), math.js, KaTeX and ts-fsrs.

On Bedrock, Claude replies through a `reply` tool shaped like the schema, because Claude in Amazon Bedrock has no structured outputs. The app validates each reply and asks once more if it doesn't fit. On the Claude API it uses structured outputs. See `app/src/main/tutor/provider.ts`.

## Team

| Person | Area |
|---|---|
| Ali | Everything built so far, pitch |
| Rasim | Visuals |
| Nurassyl | Voice |
| Nuris | Suggested: Windows testing and the demo video |
