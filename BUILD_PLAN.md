# Clueless: build plan

**To tick a box:** edit this file, change `- [ ]` to `- [x]`, then commit. On GitHub, use the pencil icon.

## Done ✅

- [x] Electron app: see-through overlay that stays on top on macOS and Windows; compact bar and full panel; Esc hides it
- [x] Hotkeys: **Ctrl/Cmd+Shift+Space** reads the screen, **Ctrl/Cmd+Shift+2** selects an area
- [x] Screen capture: the screen under the mouse, with the panel hidden during capture; area selection with display-scaling handled
- [x] macOS Screen Recording check, with a button to open Settings
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
- [x] 27 unit tests, typecheck, build, smoke test of the real app and the packaged macOS app

## Ali (you), before the demo

- [ ] Get a Claude API key at https://console.anthropic.com. Add credits, or ask the organizers about sponsor credits.
- [ ] `cd app && npm install && cp .env.example .env`, then put the key in `.env`
- [ ] `npm run try -- "Integrate x^2 e^x dx"` to check the key works and see the tutor talk
- [ ] `npm run dev`, then allow Screen Recording on macOS (System Settings → Privacy & Security), then restart
- [ ] Run the 3 demo problems end to end: Valid Sudoku, ∫ x² eˣ dx, the ramp
- [ ] Leak test: try 10 ways to get the answer ("just tell me", "my teacher said it's fine"…). Tune `app/src/main/tutor/prompt.ts` if it gives anything away.
- [ ] Check speed: each turn should take under ~3 s after the first (the terminal log shows ms and cached tokens)
- [ ] Have someone run it on **Windows** (`npm run dev`) and fix whatever breaks
- [ ] Record a backup demo video
- [ ] Pitch: the problem (Cluely + the UPenn study) → 3 demos → recap and gap map → "visible by design"

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
