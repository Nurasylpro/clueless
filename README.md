# Clueless

A small study helper that sits on top of whatever you're working on.

When you're stuck on a problem, press `Cmd/Ctrl + Shift + Space`. Clueless looks at the problem on your
screen and helps you work through it with questions and small hints, one step at a time, instead of
giving you the answer.

It works with code, math, physics and most other problem sets, on macOS and Windows.

## What it does

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

**Shortcuts:**
- `Cmd/Ctrl + Shift + Space`: read the screen
- `Cmd/Ctrl + Shift + 2`: select just the problem
- `Esc`: hide the panel

## Commands

| Command | |
|---|---|
| `npm run dev` | run the app |
| `npm run ui` | just the interface, in a browser, with a sample session (no setup needed) |
| `npm run try -- "problem"` | talk to the tutor in the terminal (`--image file.png` for a screenshot) |
| `npm test` | unit tests |
| `npm run typecheck` | type checks |
| `npm run dist:mac` / `npm run dist:win` | build an installer |

## Code

```
app/src/
  main/       app shell: windows, hotkeys, screen capture, the tutoring loop
    tutor/    Claude calls and the tutor's instructions
    checker/  answer checking (math.js)
    stuck/    stuck detection
    memory/   recaps, flashcards, gaps
  renderer/   the interface (React)
  shared/     types shared by both
```

Built with Electron, React, TypeScript, Tailwind, Claude (on Amazon Bedrock or the Claude API),
math.js, KaTeX and ts-fsrs. [SPEC.md](SPEC.md) has the design notes and
[BUILD_PLAN.md](BUILD_PLAN.md) has what's left.

Made by Ali, Nuris, Rasim and Nurassyl at the Lehigh hackathon.
