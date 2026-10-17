# Clueless

> Cluely gives you answers. **Clueless gives you clues.**

A study buddy that floats over any app. Stuck on a problem (code, math, physics, anything)? Press
**Ctrl/Cmd+Shift+Space**. Clueless reads your screen and coaches you through it with questions, small
steps, live visuals and voice. It never just hands you the answer.

- Works in **any app**, on **macOS and Windows**
- **Any subject:** coding, math, physics and more
- **Hints that get bigger only when you need them**, plus gap detection (forgot the syntax? didn't get the concept?)
- **Live visuals** of what you're building: arrays, grids, hashmaps, function plots, free-body diagrams
- **Notices when you're stuck**, without being asked
- **Visible by design:** it shows up on screen share and doesn't hide like Cluely

## Status

Planning stage for the Lehigh hackathon (Education track). The app code goes into `app/` at the event.

| Doc | What's inside |
|---|---|
| [SPEC.md](SPEC.md) | The idea, rules, features, demo sessions, architecture, shared contracts, stack and why |
| [BUILD_PLAN.md](BUILD_PLAN.md) | Who builds what, phase by phase, with checkboxes |

## Team

| Person | Area |
|---|---|
| Ali | Tutor brain (AI), contracts, pitch |
| Nuris | Desktop shell: overlay, hotkeys, capture, stuck detection, answer checker, builds |
| Rasim | UI and visuals |
| Nurassyl | Voice, memory (flashcards, gap map, recap), demo content |

## Run it (once `app/` exists)

```bash
cd app
cp .env.example .env    # add ANTHROPIC_API_KEY and DEEPGRAM_API_KEY
npm install
npm run dev
```
