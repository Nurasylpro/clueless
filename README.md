# Clueless

A small study helper that sits on top of whatever you're working on.

When you're stuck on a problem, press `Cmd/Ctrl + Shift + Space`. Clueless looks at the problem on your
screen and helps you work through it with questions and small hints, one step at a time, instead of
giving you the answer.

It works with code, math, physics and most other problem sets, on macOS and Windows.

## Two ways to use it

**The panel** (`Cmd/Ctrl + Shift + Space`) is the tutor:

- Reads the problem from your screen, a selected area, or text you paste in
- Breaks it into steps and asks one question at a time. Click a step if you're stuck on it.
- Gives a hint when you ask, and each hint is a little more specific than the last
- Notices what kind of help you need:
  - forgot some syntax or a formula: it just tells you
  - don't get the idea yet: a short side explanation
  - not sure which approach: questions
  - small mistake: it asks you to check your work
- Checks math and physics answers with a math engine instead of guessing
- Can animate things: your code, the problem's example, or the idea behind the current question
- Talks if you want (voice in and out)
- Notices if you've been stuck for a while
- Ends with a short recap, a few flashcards, and a list of the things that tend to trip you up

It stays small: only your last message and the latest reply. It also works over full-screen apps.

**The island** (`Cmd/Ctrl + Shift + 3`) is a small pill at the top of the screen for quick questions
about code:

- Highlight code in any app and click the **Ask** button that shows up next to it
- With **Animate** on, you get a short explanation, then the screen dims and your code runs step by step:
  variables on the left, the code on the right, the running part highlighted
- With **Animate** off, you get a short explanation and a box for follow-up questions

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

Optional:
- `DEEPGRAM_API_KEY`: talk to Clueless
- `ELEVENLABS_API_KEY`: a natural voice when it reads replies out loud (without it, your computer's built-in voice is used)

Check that it can reach Claude, then start the app:

```bash
npm run try -- "Integrate x^2 e^x dx"
npm run dev
```

**On macOS:**
- Clueless lives in the menu bar, not the dock. The menu there opens the panel or the island.
- The first time you use it, allow these in System Settings → Privacy & Security for the app you start it from, then restart it:
  - **Screen Recording**
  - **Microphone**, for voice
  - **Accessibility**, so the island can notice your highlights

**About the island and highlights:** to read what you highlighted, Clueless presses `Cmd/Ctrl + C`
right after you let go of the mouse, then puts your clipboard back. It only does this while the island is
showing. In a terminal, `Ctrl + C` stops the running program, so hide the island there.

**Windows, PowerShell:** if `npm` says scripts are disabled, use `npm.cmd` (for example `npm.cmd run dev`).

**Shortcuts:**
- `Cmd/Ctrl + Shift + Space`: read the screen (panel)
- `Cmd/Ctrl + Shift + 2`: select just the problem (panel)
- `Cmd/Ctrl + Shift + 1`: talk (panel)
- `Cmd/Ctrl + Shift + 3`: show or hide the island
- `Esc`: hide the panel

## Commands

| Command | |
|---|---|
| `npm run dev` | run the app |
| `npm run ui` | the panel in a browser with a sample session (no setup needed); add `?island` to the URL for the island over a fake LeetCode page |
| `npm run try -- "problem"` | talk to the tutor in the terminal (`--image file.png` for a screenshot) |
| `npm run trace -- code.py` | the island's code trace in the terminal (`--off`, `--json`, `--effort medium`) |
| `npm test` | unit tests |
| `npm run typecheck` | type checks |
| `npm run dist:mac` / `npm run dist:win` | build an installer |

## Code

```
app/src/
  main/       app shell: windows, hotkeys, screen capture, the tutoring loop
    tutor/    Claude calls and the tutor's instructions
    island/   noticing highlights, and Claude tracing the highlighted code
    voice/    speech to text (Deepgram) and text to speech (ElevenLabs)
    checker/  answer checking (math.js)
    stuck/    stuck detection
    memory/   recaps, flashcards, gaps
  renderer/   the interface (React)
    screens/  the panel        island/  the island        visuals/  the animations
  shared/     types shared by both, the code-trace format, the island's state machine
```

Built with Electron, React, TypeScript, Tailwind, Motion, Claude (on Amazon Bedrock or the Claude API),
Deepgram, ElevenLabs, math.js, KaTeX, ts-fsrs and uiohook-napi. [SPEC.md](SPEC.md) has the design notes
and [BUILD_PLAN.md](BUILD_PLAN.md) has what's left.

Made by Ali, Nuris, Rasim and Nurassyl at the Lehigh hackathon.
