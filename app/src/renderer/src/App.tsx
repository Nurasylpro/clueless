import { MotionConfig } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppStatus, MemoryView, SessionView, StageShow, WindowMode } from '../../shared/contracts'
import { api, isMock } from './api'
import { AreaSelector } from './screens/AreaSelector'
import { Banners, EmptyState, GLASS_ALPHA, Header, type Glass } from './screens/Home'
import { ReviewScreen } from './screens/Review'
import { SessionScreen } from './screens/Session'
import { AnimationPane } from './visuals/AnimationPane'
import { CodeOverlay, StageScreen } from './visuals/CodeOverlay'
import { PlaybackContext, playsOnCode, type Playback, type Playing } from './visuals/playback'

export function App() {
  if (window.location.hash === '#select') return <AreaSelector />
  return (
    <MotionConfig reducedMotion="user">{window.location.hash === '#stage' ? <StageScreen /> : <Overlay />}</MotionConfig>
  )
}

/** The window size for this state: wide while an explain-mode animation is open. */
function windowMode(compact: boolean, playing: Playing | null): WindowMode {
  if (compact) return 'compact'
  return playing && !playsOnCode(playing.animation) ? 'wide' : 'expanded'
}

function Overlay() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [session, setSession] = useState<SessionView | null>(null)
  const [screen, setScreen] = useState<'main' | 'review'>('main')
  const [compact, setCompact] = useState(false)
  const [dueCards, setDueCards] = useState(0)
  const [glass, setGlass] = useState<Glass>(loadGlass)
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [mockStage, setMockStage] = useState<StageShow | null>(null)

  useEffect(() => {
    if (isMock) document.body.classList.add('mock-desktop')
    void api.getStatus().then(setStatus)
    void api.getSession().then(setSession)
    void api.getMemory().then((m) => setDueCards(m.dueCards.length))
    const offSession = api.onSession(setSession)
    const offStatus = api.onStatus(setStatus)
    // Browser mock mode has no stage window: draw code-mode animations in this page instead.
    const offStage = isMock ? api.onStage(setMockStage) : () => {}
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') api.hide()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offSession()
      offStatus()
      offStage()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const playback = useMemo<Playback>(
    () => ({
      playing,
      play(itemId, turn) {
        if (!turn.visual) return
        const next: Playing = { itemId, visual: turn.visual, message: turn.message, animation: turn.animation, nonce: Date.now() }
        if (playsOnCode(next.animation)) api.playOnScreen({ visual: next.visual, area: next.animation!.area!, nonce: next.nonce })
        else if (playing && playsOnCode(playing.animation)) api.stopOnScreen()
        api.setWindowMode(windowMode(compact, next))
        setPlaying(next)
      },
      replay() {
        if (!playing) return
        const next = { ...playing, nonce: playing.nonce + 1 }
        if (playsOnCode(next.animation)) api.playOnScreen({ visual: next.visual, area: next.animation!.area!, nonce: next.nonce })
        setPlaying(next)
      },
      stop() {
        if (!playing) return
        if (playsOnCode(playing.animation)) api.stopOnScreen()
        api.setWindowMode(windowMode(compact, null))
        setPlaying(null)
      }
    }),
    [playing, compact]
  )
  const stopPlayback = useRef(playback.stop)
  stopPlayback.current = playback.stop

  // A new problem (or none): close any animation, back to the main screen, full size.
  useEffect(() => {
    stopPlayback.current()
    if (!session?.id) return
    setScreen('main')
    setCompact(false)
  }, [session?.id])

  // New flashcards after a recap.
  useEffect(() => {
    if (session?.recap) void api.getMemory().then((m) => setDueCards(m.dueCards.length))
  }, [session?.recap])

  const toggleCompact = (): void => {
    const next = !compact
    setCompact(next)
    api.setWindowMode(windowMode(next, playing))
  }

  const onMemory = useCallback((m: MemoryView) => setDueCards(m.dueCards.length), [])

  const changeGlass = (g: Glass): void => {
    setGlass(g)
    try {
      localStorage.setItem('clueless.glass', g)
    } catch {
      // storage unavailable: the setting just won't persist
    }
  }

  const explain = playing && !playsOnCode(playing.animation) ? playing : null
  const onCode = Boolean(playing && playsOnCode(playing.animation))

  return (
    <PlaybackContext.Provider value={playback}>
      <div className={isMock ? 'flex h-full items-start justify-end p-6' : 'h-full p-2'} data-app-ready>
        {isMock && <MockDesktop />}
        <div
          className={
            'glass-panel relative flex flex-col overflow-hidden rounded-2xl text-zinc-900 shadow-2xl transition-opacity duration-300 dark:text-zinc-100 ' +
            (glass === 'clear' ? 'glass-clear ' : '') +
            // Code mode: the panel turns see-through so the animation on the code is the focus.
            (onCode ? 'opacity-40 hover:opacity-100 ' : '') +
            (isMock ? (explain && !compact ? 'w-[844px] ' : 'w-[424px] ') + (compact ? 'h-[68px]' : 'h-[704px] max-h-full') : 'h-full')
          }
          style={{ '--glass': GLASS_ALPHA[glass] } as React.CSSProperties}
        >
          <Header
            compact={compact}
            dueCards={dueCards}
            stuck={session?.stuck ?? null}
            glass={glass}
            onGlass={changeGlass}
            onToggleCompact={toggleCompact}
            onOpenReview={() => {
              if (compact) toggleCompact()
              setScreen('review')
            }}
          />
          {!compact && (
            <>
              <Banners status={status} />
              <div className="flex min-h-0 flex-1">
                {explain && <AnimationPane playing={explain} onReplay={playback.replay} onClose={playback.stop} />}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {screen === 'review' ? (
                    <ReviewScreen onBack={() => setScreen('main')} onChange={onMemory} />
                  ) : session ? (
                    <SessionScreen session={session} onOpenReview={() => setScreen('review')} />
                  ) : (
                    <EmptyState status={status} />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {isMock && mockStage && <CodeOverlay show={mockStage} />}
      </div>
    </PlaybackContext.Provider>
  )
}

function loadGlass(): Glass {
  try {
    const saved = localStorage.getItem('clueless.glass')
    if (saved === 'glass' || saved === 'clear' || saved === 'solid') return saved
  } catch {
    // storage unavailable: use the default
  }
  return 'glass'
}

/** Browser mock mode only: a fake code editor behind the panel, to show the glass effect.
 *  Its layout matches MOCK_CODE_AREA in mock/fixtures.ts (40px padding, 28px lines). */
function MockDesktop() {
  return (
    <pre className="pointer-events-none fixed inset-0 overflow-hidden p-10 font-mono text-[15px] leading-7 text-sky-200/80">
      {`class Solution:
    def isValidSudoku(self, board: List[List[str]]) -> bool:
        rows = [set() for _ in range(9)]
        cols = [set() for _ in range(9)]
        boxes = [set() for _ in range(9)]

        for r in range(9):
            for c in range(9):
                val = board[r][c]
                if val == '.':
                    continue
                b = (r // 3) * 3 + c // 3
                if val in rows[r] or val in cols[c] or val in boxes[b]:
                    return False
                rows[r].add(val)
                cols[c].add(val)
                boxes[b].add(val)
        return True

# 36. Valid Sudoku (Medium)
# Determine if a 9 x 9 Sudoku board is valid. Only the filled cells need to be
# validated: each row, each column and each 3 x 3 sub-box must contain the
# digits 1-9 without repetition.`}
    </pre>
  )
}
