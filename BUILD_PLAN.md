# Build plan

Tick a box by changing `- [ ]` to `- [x]`.

## Done

**The panel (the tutor)**
- [x] Floating panel over any app, macOS and Windows, including full-screen apps — Ali
- [x] Reads the screen, a selected area, or pasted text — Ali
- [x] Tutor on Claude (Amazon Bedrock or the Claude API): steps, hints that grow, gap types, recap — Ali
- [x] Answer checks for math and physics (math.js) — Ali
- [x] Stuck detection: idle screen, repeated wrong answers, answer sites — Ali
- [x] Gap tracking across sessions — Ali
- [x] Compact, Claude-orange panel that sizes itself to its content — Ali
- [x] "What's tripping you up?" after a scan, shorter replies, resizable panel, clickable plan steps — Nuris

**Voice**
- [x] Talk to Clueless (Deepgram) — Rasim
- [x] Replies read out loud (ElevenLabs, or the computer's own voice) — Rasim

**Animations**
- [x] Animate my code / the problem / the question, with a renderer for every visual type — Nurassyl
- [x] Code mode (drawn over your code) and explain mode (next to the conversation) — Nurassyl
- [x] Island: highlight code, Ask, watch a step-by-step trace (Cmd/Ctrl+Shift+3) — Nurassyl

**Housekeeping**
- [x] Restored work lost in the PR #3 merge, island as its own mode (PR #4) — Ali
- [x] Tests (98), typecheck, smoke test of the panel and the island

## Next

- [ ] Voice and animation in sync: each step is spoken while it's shown
- [ ] Animations drawn on the real screen (browser, PDF, editor) instead of the separate island
- [ ] Faster animations: run the code to get the trace instead of having the model write it
- [ ] Cheaper, faster models per task (Sonnet 5.5 / Haiku 5.5 instead of Opus everywhere), checked on a small test set
- [ ] Remove flashcards (keep the recap and the gap list)

## Before the demo

- [ ] Run it with the team's Bedrock key: the 3 demo problems end to end
- [ ] Try to get it to give the answer away; tighten `app/src/main/tutor/prompt.ts` if it does
- [ ] Run it on Windows
- [ ] Record a backup video
- [ ] Pitch: the problem → coding, math and physics demos → the recap
