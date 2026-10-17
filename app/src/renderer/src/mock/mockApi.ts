// A fake `window.clueless` for running the UI in a plain browser (`npm run ui`).
// Replays the scripted Valid Sudoku session from fixtures.ts. Add `?stuck` to the URL to see
// the "Stuck?" bubble right away.
import type {
  AppStatus,
  CardRating,
  CardView,
  CluelessApi,
  MemoryView,
  SessionView,
  StageShow,
  ThreadItem,
  TurnView
} from '../../../shared/contracts'
import { MOCK_AFTER_RECAP, MOCK_ANIMATIONS, MOCK_GAPS, MOCK_PROBLEM, MOCK_RECAP, MOCK_TURNS } from './fixtures'

const DELAY = 700

export function createMockApi(): CluelessApi {
  let view: SessionView | null = null
  let step = 0
  const listeners = new Set<(v: SessionView | null) => void>()
  const stageListeners = new Set<(s: StageShow | null) => void>()
  const showStage = (show: StageShow | null): void => stageListeners.forEach((cb) => cb(show))
  let cards: CardView[] = [
    { id: 'c1', subject: 'math', topic: 'integration by parts', front: 'What is the integration by parts formula?', back: '$\\int u\\,dv = uv - \\int v\\,du$', due: new Date().toISOString() },
    { id: 'c2', subject: 'coding', topic: 'Valid Sudoku', front: 'Python: make a list of 9 empty sets', back: '`[set() for _ in range(9)]`', due: new Date().toISOString() }
  ]

  const status: AppStatus = {
    platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32',
    provider: 'bedrock',
    model: 'mock',
    region: 'us-east-1',
    hasDeepgramKey: false,
    screenAccess: 'granted',
    hotkeys: { ask: 'CommandOrControl+Shift+Space', area: 'CommandOrControl+Shift+2' },
    hotkeyErrors: [],
    envFile: 'app/.env'
  }

  const emit = (): void => {
    const snapshot = view ? structuredClone(view) : null
    listeners.forEach((cb) => cb(snapshot))
  }

  const memory = (): MemoryView => ({ gaps: MOCK_GAPS, dueCards: cards, totalCards: cards.length + 3, sessions: 4 })

  const pushTutor = (turn: TurnView): void => {
    if (!view) return
    view.thread.push({ id: crypto.randomUUID(), role: 'tutor', turn, at: Date.now() })
    view.plan = turn.plan
    view.expects = turn.expects
    view.choices = turn.choices
    if (turn.verdict !== 'none') {
      view.attempts++
      view.wrongStreak = turn.verdict === 'correct' ? 0 : view.wrongStreak + 1
    }
    if (turn.hintLevel > 0) view.hintsUsed++
    view.revealAllowed = view.attempts >= 3
    if (turn.kind === 'solved') view.solved = true
  }

  const reply = (busy: string, fn: () => void): void => {
    if (!view) return
    view.busy = busy
    view.stuck = { level: 0, reason: null }
    emit()
    setTimeout(() => {
      if (!view) return
      view.busy = null
      fn()
      emit()
    }, DELAY)
  }

  const nextTurn = (): void => {
    if (view?.recap) return pushTutor(MOCK_AFTER_RECAP)
    step = Math.min(step + 1, MOCK_TURNS.length - 1)
    pushTutor(MOCK_TURNS[step])
  }

  const start = (): void => {
    step = 0
    view = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      problem: null,
      plan: [],
      thread: [] as ThreadItem[],
      expects: 'none',
      choices: [],
      attempts: 0,
      wrongStreak: 0,
      hintsUsed: 0,
      revealAllowed: false,
      revealed: false,
      solved: false,
      busy: null,
      error: null,
      stuck: { level: 0, reason: null },
      recap: null
    }
    reply('Reading your screen…', () => {
      if (!view) return
      view.problem = MOCK_PROBLEM
      pushTutor(MOCK_TURNS[0])
      if (new URLSearchParams(location.search).has('stuck')) {
        view.stuck = { level: 2, reason: "your screen hasn't changed in 2 min" }
      }
    })
  }

  return {
    getStatus: async () => status,
    getSession: async () => view,
    onSession: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    onStatus: () => () => {},
    ask: () => start(),
    askText: () => start(),
    send: ({ text, as }) => {
      if (!view) return
      view.thread.push({ id: crypto.randomUUID(), role: 'student', text, as, check: null, at: Date.now() })
      reply('Thinking…', nextTurn)
    },
    action: (action) => {
      if (action === 'new') {
        view = null
        return emit()
      }
      if (!view) return
      if (action === 'im_fine') {
        view.stuck = { level: 0, reason: null }
        return emit()
      }
      if (action === 'finish') {
        return reply('Writing your recap…', () => {
          if (!view) return
          pushTutor({ ...MOCK_TURNS[MOCK_TURNS.length - 1], message: 'Nice work today. Here’s your recap.', verdict: 'none' })
          const last = view.thread[view.thread.length - 1]
          view.recap = {
            ...MOCK_RECAP,
            hintsUsed: view.hintsUsed,
            attempts: view.attempts,
            solved: view.solved,
            revealed: view.revealed,
            cardsAdded: MOCK_RECAP.flashcards.length,
            afterItemId: last.id
          }
        })
      }
      if (action === 'animate_code' || action === 'animate_problem' || action === 'animate_question') {
        const target = action === 'animate_code' ? 'code' : action === 'animate_problem' ? 'problem' : 'question'
        return reply('Getting the animation ready…', () => pushTutor({ ...MOCK_ANIMATIONS[target], plan: MOCK_TURNS[step].plan }))
      }
      if (action === 'reveal') view.revealed = true
      reply(action === 'hint' ? 'Thinking of a hint…' : 'Thinking…', nextTurn)
    },
    setSubject: (subject) => {
      if (view?.problem) view.problem.subject = subject
      emit()
    },
    setWindowMode: () => {},
    hide: () => console.log('[mock] hide'),
    quit: () => console.log('[mock] quit'),
    openScreenSettings: () => {},
    getMemory: async () => memory(),
    rateCard: async (id: string, _rating: CardRating) => {
      cards = cards.filter((c) => c.id !== id)
      return memory()
    },
    areaDone: (rect) => console.log('[mock] area', rect),
    areaCancel: () => console.log('[mock] area cancelled'),
    playOnScreen: (play) => {
      // The panel, so the floating card stays out from under it (the real app gets this from the window).
      const panel = document.querySelector('.glass-panel')?.getBoundingClientRect()
      showStage({ ...play, avoid: panel ? { x: panel.x, y: panel.y, width: panel.width, height: panel.height } : null })
    },
    stopOnScreen: () => showStage(null),
    onStage: (cb) => {
      stageListeners.add(cb)
      return () => stageListeners.delete(cb)
    }
  }
}
