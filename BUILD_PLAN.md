# Clueless: build plan

**To tick a box:** edit this file, change `- [ ]` to `- [x]`, then commit. On GitHub, use the pencil icon.

## Done ✅

- [x] Voice: talk to Clueless (Deepgram), and it reads replies out loud (ElevenLabs, or the built-in voice) — Rasim
- [x] Panel fixes: "what's tripping you up" after a scan, shorter replies, resizable panel, clickable plan steps — Nurislam
- [x] Animate: "Animate my code / the problem / the question", drawn in the panel or right on your code, with renderers for every visual type — Nurassyl
- [x] Island (Cmd/Ctrl+Shift+3): highlight code anywhere, Ask, then a step-by-step trace — Nurassyl

- [x] Electron app: see-through overlay that stays on top on macOS and Windows; compact bar and full panel; Esc hides it
- [x] Hotkeys: **Ctrl/Cmd+Shift+Space** reads the screen, **Ctrl/Cmd+Shift+2** selects an area
- [x] Screen capture: the screen under the mouse, with the panel hidden during capture; area selection with display-scaling handled
- [x] macOS Screen Recording check, with a button to open Settings
- [x] Claude through **Amazon Bedrock** or the Claude API:
  - Bedrock replies through a `reply` tool, validated, with one retry
  - client-side refusal fallback on Bedrock, server-side on the Claude API
- [x] Works over **full-screen apps**: a macOS panel window, a menu-bar icon instead of the dock, and above F11 browsers on Windows
  - Tested 2026-10-17 on macOS with a full-screen app. The panel stays on top, ⌘⇧Space brings it up without leaving full screen, typing works, and launching Clueless while in full screen works.
- [x] Compact panel in Claude orange:
  - shows only the latest input and reply
  - the window sizes itself to the panel
- [x] Tutor brain (Claude Opus 5.5):
  - structured replies (only 3 union fields, under the 16 limit)
  - prompt caching, effort `medium` on the first turn and `low` after
  - refusal fallback
  - a hidden solution that never reaches the UI
- [x] System prompt: Pólya's 4-step loop, 5 hint levels, 4 gap types, subject packs (coding / math / physics / other)
- [x] Answer checker (math.js): equal expressions, antiderivatives (+ C is fine), units within 2%
- [x] Stuck detection: screen unchanged for 1–2 min, 3 wrong answers in a row, an answer site opened (ChatGPT, Chegg, Photomath…); an "I'm fine" snooze
- [x] Memory: gaps, flashcards (ts-fsrs spaced repetition), session help log, all in one JSON file
- [x] UI:
  - problem bar with a subject switcher
  - plan progress
  - conversation with Markdown + KaTeX
  - hint dots, gap tags, verdicts
  - quick actions: Hint / What next? / Check my work / Reveal / Finish
  - answer box with live math preview and a "How do I write…?" mode
  - "Stuck?" bubble, recap card, flashcards and gap map screen
  - glass transparency button (glass / clear / solid)
- [x] Browser mock mode (`npm run ui`) with a scripted Valid Sudoku session
- [x] Terminal tutor (`npm run try`)
- [x] 33 unit tests, typecheck, build, smoke test of the real app and the packaged macOS app

## The island + code animation ✅

- [x] Runs in the background; **Ctrl/Cmd+Shift+2** shows / hides a pill at the top of the screen (Animate On/Off · Mic (soon) · Hide)
- [x] Highlight text in any app → an **Ask** button appears next to the cursor (mouse hook while the island shows; clipboard restored)
- [x] Ask → Claude Opus 5.5 traces the highlighted code (effort picked by code size, `CLUELESS_TRACE_EFFORT` overrides, 150 s limit): every step, every variable value, which part of which line
- [x] Animate on: short text in the island → 4 s → full-screen dimmed overlay, variables as simple figures on the left, the code on the right with a bright box on the running part; changes light up; the last step freezes until a click
- [x] Animate off: text answer with a follow-up box; stays until closed
- [x] `npm run ui` runs the island on a fake LeetCode page; `npm run trace -- file.py` checks a trace in the terminal
- [ ] Try it on real LeetCode problems on Windows and tune the pace (`STEP_MS` in `TraceOverlay.tsx`)
- [ ] macOS: Accessibility permission for the mouse hook
- [ ] "Animate the problem" (later)

## Ali (you), before the demo

- [ ] Get Bedrock access:
  - In the AWS console → Amazon Bedrock, check you have access to Claude Opus 5.5 (otherwise use Opus 4.8, which every Bedrock account has).
  - Make a **Bedrock API key** (Bedrock → API keys), or use an AWS profile.
- [ ] `cd app && npm install && cp .env.example .env`, then fill in `AWS_REGION` and `AWS_BEARER_TOKEN_BEDROCK` (or `AWS_PROFILE`)
- [ ] `npm run try -- "Integrate x^2 e^x dx"` to check the credentials and see the tutor talk (the first line says Bedrock or the Claude API)
- [ ] `npm run dev`, then allow Screen Recording on macOS (System Settings → Privacy & Security), then restart
- [ ] Test over a **full-screen** browser (LeetCode in full screen → Ctrl/Cmd+Shift+Space)
- [ ] Run the 3 demo problems end to end: Valid Sudoku, ∫ x² eˣ dx, the ramp
- [ ] Leak test: try 10 ways to get the answer ("just tell me", "my teacher said it's fine"…). Tune `app/src/main/tutor/prompt.ts` if it gives anything away.
- [ ] Check speed: each turn should take under ~3 s after the first (the terminal log shows ms and cached tokens)
- [ ] Have someone run it on **Windows** (`npm run dev`) and fix whatever breaks
- [ ] Record a backup demo video
- [ ] Pitch: the problem (the UPenn study) → 3 demos → recap and gap map

## Rasim: visuals

The tutor already sends `visual` on turns where a picture helps. Make it draw.

- [ ] Read `app/src/shared/schema.ts` (`Scene`, `Visual`). Empty values are `""` and `-1`.
- [ ] `npm run ui` and work in `app/src/renderer/src/components/VisualSlot.tsx` (the mock has `sets` and `grid` examples)
- [ ] `array`, `grid` (Sudoku boxes via `boxSize`), `sets` (red flash on `flash`), `hashmap`: SVG + Motion (`npm i motion`)
- [ ] `plot` and `vectors` (ramp from `surfaceAngleDeg`): Mafs (`npm i mafs`, plus `import 'mafs/core.css'`)
- [ ] `numberline`, `tree`, `graph`
- [ ] Step through `frames` (prev/next, or autoplay)
- [ ] Test with real tutor output: `npm run try -- --debug "…"` prints which visuals Claude sends

## Nurassyl: voice

- [ ] Follow `app/src/main/voice/README.md` (MediaRecorder → IPC → Deepgram in the main process → transcript back)
- [ ] Get a Deepgram key and put `DEEPGRAM_API_KEY` in `app/.env`
- [ ] Mic button (`MicButton.tsx`) + hotkey Ctrl/Cmd+Shift+1; stops on its own when you pause
- [ ] Think-aloud mode: finished sentences go to the tutor as student messages
- [ ] Optional: read hints aloud (`speechSynthesis`, off by default)

## Nuris: Windows and demo (suggested)

- [ ] Run `npm run dev` on Windows: check the overlay, both hotkeys, area select on a scaled display (125%/150%), and capture
- [ ] `npm run dist:win` on Windows to build the installer
- [ ] Set up the demo laptop: keys, problems open in tabs, notifications off

## Stretch ideas

- [ ] Python code tracer with Pyodide (run their code line by line on the example input)
- [ ] Mock interview mode (voice)
- [ ] Paper mode: hold handwritten work up to the webcam
- [ ] Export the help log for a teacher
