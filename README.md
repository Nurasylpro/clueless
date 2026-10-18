# Clueless

A small study helper that sits on top of whatever you're working on.

Clueless runs in the background and shows up as a small **island** at the top of the screen. Press
`Cmd/Ctrl + Shift + 2` to show it, **highlight some code** in any app (LeetCode, your editor), and click the
**Ask** button that appears next to the cursor.

- **Animate on:** a centered workspace opens with variables on the left, code on the right, and a
  caption for each step. Scroll inside either pane, zoom the variables, and drag variable names to
  arrange them. Back, Pause/Resume, and speed controls stay inside the workspace.
- **Animate off:** a short explanation in the island, with a box for follow-up questions.
- **Voice on:** Jessica reads replies and animation captions through ElevenLabs. Animation requests
  are queued and retried; a service failure shows a notice and keeps captions rather than changing voices.
- **Logo:** scan the current screen and start a coaching conversation, one question at a time.
- **Move:** drag the grip beside the logo. The island keeps its position when opening or closing its card.

It explains your code; it doesn't write your solution. Python runs in Pyodide for accurate traces;
Claude supplies the explanations. The original tutor's answer checker, memory, and flashcards are
still in the repo; screen coaching now lives in the island.

## What the tutor does (not shown in the island yet)

- Reads the problem from your screen, a selected area, or text you paste in
- Breaks it into steps and asks one question at a time
- Gives a hint when you ask, and each hint is a little more specific than the last
- Notices what kind of help you need:
  - forgot some syntax or a formula: it just tells you
  - don't get the idea yet: a short side explanation
  - not sure which approach: questions
  - small mistake: it asks you to check your work
- Checks math and physics answers with a math engine instead of guessing
- Notices if you've been stuck for a while
- Ends with a short recap, a few flashcards, and a list of the things that tend to trip you up

The panel stays small: only your last message and the latest reply. It also works over full-screen
apps.

Visuals (diagrams of arrays, graphs, plots and so on) and voice input are still in progress.

## Setup

You'll need [Node.js](https://nodejs.org) and access to Claude, through Amazon Bedrock or a Claude API key.

```bash
cd app
npm install
cp .env.example .env
```

Fill in `app/.env`. For Bedrock:

- `AWS_REGION`, for example `us-east-1`
- one way to sign in:
  - `AWS_BEARER_TOKEN_BEDROCK`: a Bedrock API key
  - `AWS_PROFILE`: an AWS CLI profile
  - access keys
- if your account doesn't have Opus 5.5 yet: `CLUELESS_MODEL=anthropic.claude-opus-4-8`

Or set `ANTHROPIC_API_KEY` to use the Claude API instead.

Check that it can reach Claude, then start the app:

```bash
npm run try -- "Integrate x^2 e^x dx"
npm run dev
```

**On macOS:**
- Clueless lives in the menu bar, not the dock.
- The first time you use it, allow Screen Recording in System Settings → Privacy & Security for the
  app you start it from, then restart it.

**Shortcut:** `Cmd/Ctrl + Shift + 2` shows or hides the island. While it shows, clueless presses
`Cmd/Ctrl + C` for you right after you highlight text, reads it, and puts your clipboard back. (In a terminal
that would stop a running program, so hide the island there.) On macOS, also allow Accessibility so it
can notice your highlights.

**Windows, PowerShell:** if `npm` says scripts are disabled, use `npm.cmd` (for example `npm.cmd run dev`).

## Commands

| Command | |
|---|---|
| `npm run dev` | run the app |
| `npm run ui` | the island in a browser, over a fake LeetCode page with a fake Claude (no setup needed) |
| `npm run trace -- code.py` | Claude traces a code file in the terminal, exactly what the animation plays (`--off`, `--json`, `--effort medium`) |
| `npm run try -- "problem"` | talk to the tutor in the terminal (`--image file.png` for a screenshot) |
| `npm test` | unit tests |
| `npm run typecheck` | type checks |
| `npm run dist:mac` / `npm run dist:win` | build an installer |

## Code

```
app/src/
  main/       app shell: the island, hotkey, windows, screen capture
    island/   noticing highlights, and Claude tracing the highlighted code
    tutor/    Claude calls and the tutor's instructions (the tutoring loop, parked)
    checker/  answer checking (math.js)
    stuck/    stuck detection
    memory/   recaps, flashcards, gaps
  renderer/   the interface (React); island/ is the pill, the card and the animation
  shared/     types shared by both, the code-trace format, the island's state machine
```

Built with Electron, React, TypeScript, Tailwind, Motion (animations), uiohook-napi (noticing highlights),
Claude (on Amazon Bedrock or the Claude API), math.js, KaTeX and ts-fsrs. [SPEC.md](SPEC.md) has the design notes and
[BUILD_PLAN.md](BUILD_PLAN.md) has what's left.

Made by Ali, Nuris, Rasim and Nurassyl at the Lehigh hackathon.
