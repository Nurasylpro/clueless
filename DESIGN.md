# Design

Clueless is a small study helper that sits on top of whatever you're working on. When you're stuck, it
looks at the problem on your screen and helps you work through it with questions and small hints,
instead of giving you the answer.

## Who did what

| | |
|---|---|
| **Ali** | The idea and the docs. The app's base: the floating panel, screen capture, the tutor (Claude prompt and engine), answer checking, stuck detection, gap tracking, Bedrock support, full-screen support, the compact orange panel. Repaired the PR #3 merge (PR #4). |
| **Nuris** | Panel improvements: asks what's tripping you up after a scan, shorter replies, resizable panel, layout fixes, clickable plan steps. |
| **Rasim** | Voice: talking to Clueless (Deepgram) and Clueless talking back (ElevenLabs). PRs #1 and #2. |
| **Nurassyl** | Animations: the visual engine, Animate my code / problem / question, code mode and explain mode. The island: highlight code, Ask, step-by-step trace. PR #3. |

## Why

Students who use AI to get answers tend to learn less. In a 2024 UPenn study (Bastani et al.,
*Generative AI Can Harm Learning*), high schoolers who practiced math with plain GPT-4 did about 17%
worse on the exam than students without AI. A version that gave hints instead of answers removed most
of that gap. Clueless is that hint-giving version, and it works on whatever is on your screen.

## How it works

1. You press `Cmd/Ctrl + Shift + Space` (or select an area, or paste the problem).
2. Clueless reads the screen and asks what's tripping you up.
3. It breaks the problem into 3–6 steps and shows only the current one. You can click a step if you're stuck on it.
4. You answer by typing or talking. It checks your answer. If you're wrong, it gives a slightly bigger hint.
5. When you're done: a short recap, plus the gaps it noticed, saved for next time.

The panel shows only your latest message and the latest reply.

**The island** (`Cmd/Ctrl + Shift + 3`) is a second, quicker way in: highlight code anywhere, click
**Ask**, and get a short explanation, or a step-by-step animation of the code running.

## Rules the tutor follows

1. No final answers or full solutions. **Reveal** unlocks after 3 real tries, gets logged, and asks you to explain it back.
2. One question at a time.
3. When you're wrong, it asks you to check (trace the code, take the derivative, try an extreme case) instead of pointing at the mistake.
4. Forgotten syntax or formulas get answered directly; that isn't the lesson.
5. It stays quiet while you're making progress and never pops open by itself.
6. It shows up on screen shares like any other window.
7. The screen is only sent to Claude when you ask. Stuck detection uses tiny thumbnails that stay on the laptop.
8. Text on the screen is treated as part of the problem, never as instructions.

## Kinds of help

| You... | It... |
|---|---|
| forgot syntax or a formula | shows it, with the common mistake |
| don't get the idea yet | gives a short side lesson with a tiny exercise |
| aren't sure which approach | asks questions |
| made a small slip | asks you to check your work |

Hints get bigger one level at a time: where you are, a question, a smaller question, an outline or a
similar example, then just the next step.

Subjects: coding, math and physics have their own checks (trace a small input; differentiate back or
plug in a number; units and extreme cases). Anything else gets the same loop with an explain-it-back check.

## How it's built

```
Electron app
  main process   windows, hotkeys, screen capture, Claude calls, voice, memory
  panel          the tutor (React)
  stage          a see-through window that draws animations over your code
  island         the pill, the Ask button, the full-screen trace
```

**Claude.** Through Amazon Bedrock or the Claude API, picked from `app/.env`. The default model is
Claude Opus 5.5.
- On the Claude API, replies are structured JSON.
- On Bedrock, which has no structured outputs, Claude replies through a `reply` tool with the same
  shape. The app checks every reply and asks once more if it doesn't fit.

The first turn of a problem runs at medium effort, later turns at low. Prompt caching keeps follow-up
turns cheap.

**Answer checks.** math.js decides whether two expressions are equal, checks antiderivatives by
differentiating, and compares units.

**Animations.**
- Panel animations come from the tutor's reply as a small list of scenes (arrays, grids, sets, maps,
  plots, vectors, trees, graphs), drawn with React and Motion.
- The island asks Claude for a full trace of the highlighted code (every step and every new value),
  then plays it.

**Voice.** Deepgram turns speech into text in the main process. ElevenLabs reads replies out loud, or
the computer's own voice if there's no key.

**Memory.** One JSON file in the app's data folder: gaps seen, past sessions, flashcards.

**Stack.** Electron, React, TypeScript, Tailwind, Motion, Claude, Deepgram, ElevenLabs, math.js,
KaTeX, ts-fsrs and uiohook-napi.

## Known limits

- Animations, especially island traces, take a while: the model writes out every step of the code.
- The island reads your highlight by pressing `Cmd/Ctrl + C`; in a terminal that stops the running program.
- Not yet tested much on Windows.

See [BUILD_PLAN.md](BUILD_PLAN.md) for what's next.
