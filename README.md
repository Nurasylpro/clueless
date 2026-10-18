# Clueless

| Keys | |
|---|---|
| `Cmd/Ctrl + Shift + Space` | read the screen |
| `Cmd/Ctrl + Shift + 2` | select just the problem |
| `Cmd/Ctrl + Shift + 1` | talk |
| `Cmd/Ctrl + Shift + 3` | show or hide the island |
| `Esc` | hide the panel |

A small study helper that sits on top of whatever you're working on. When you're stuck, it looks at
the problem on your screen and helps you work through it with questions and small hints, instead of
giving you the answer. Code, math, physics and most other problem sets, on macOS and Windows.

- **The panel** walks you through one step at a time:
  - hints that get a little more specific each time
  - checks math answers
  - can animate your code or the idea behind a question
  - can talk
  - ends with a short recap
- **The island** is for quick questions: highlight anything, click **Ask**, and the answer shows in the
  panel. With Animate on, highlighted code runs step by step right where it is on your screen.

## Setup

You'll need [Node.js](https://nodejs.org) and access to Claude through Amazon Bedrock or a Claude API key.

```bash
cd app
npm install
cp .env.example .env
```

In `app/.env`:
- **Bedrock:** set `AWS_REGION` and `AWS_BEARER_TOKEN_BEDROCK` (or `AWS_PROFILE`), and turn on access
  to Claude Sonnet 5.5 and Haiku 5.5 in the Bedrock console.
- **Or the Claude API:** set `ANTHROPIC_API_KEY`.
- **Optional:** `DEEPGRAM_API_KEY` for talking, and `ELEVENLABS_API_KEY` for a nicer reading voice.

Then:

```bash
npm run try -- "Integrate x^2 e^x dx"   # checks it can reach Claude
npm run dev
```

On macOS, Clueless lives in the menu bar. The first time, allow these in System Settings → Privacy &
Security, then restart it:
- **Screen Recording**
- **Microphone**
- **Accessibility**, for the island to notice highlights

To read a highlight, the island presses `Cmd/Ctrl + C` for you and then puts your clipboard back. In a
terminal that stops the running program, so hide the island there.

On Windows PowerShell, use `npm.cmd` if `npm` scripts are blocked.

## Commands

| Command | |
|---|---|
| `npm run dev` | run the app |
| `npm run ui` | the panel in a browser with a sample session; add `?island` for the island demo |
| `npm run try -- "problem"` | the tutor in the terminal |
| `npm run trace -- code.py` | an Ask with Animate on, in the terminal |
| `npm run eval` | the model test set (a few dollars of Claude calls) |
| `npm test` | tests |
| `npm run typecheck` | type checks |
| `npm run dist:mac` / `npm run dist:win` | build an installer |

[DESIGN.md](DESIGN.md) has how it works and who did what. [BUILD_PLAN.md](BUILD_PLAN.md) has what's next.

Made by Ali, Nurislam, Rasim and Nurassyl at the Lehigh hackathon.
