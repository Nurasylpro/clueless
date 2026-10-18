import { MotionConfig } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppStatus, SessionView, StageShow, WindowMode } from '../../shared/contracts'
import { api, isMock } from './api'
import { mock as islandMock } from './island/api'
import { AskCard } from './island/AskCard'
import { useNarration } from './island/useNarration'
import { AskButton, IslandScreen, useIslandView } from './island/IslandScreen'
import { MockPage } from './island/MockPage'
import { AreaSelector } from './screens/AreaSelector'
import { Banners, EmptyState, GLASS_ALPHA, Header, type Glass } from './screens/Home'
import { GapsScreen } from './screens/Gaps'
import { SessionScreen } from './screens/Session'
import { AnimationPane } from './visuals/AnimationPane'
import { CodeOverlay, StageScreen } from './visuals/CodeOverlay'
import { PlaybackContext, playsOnCode, type Playback, type Playing } from './visuals/playback'
import { speech } from './voice/speaker'
import { toSpeech } from '../../shared/speechText'

// One renderer, several windows, picked by the URL hash:
//   (none)   the tutor panel        #select  drag a box around the problem
//   #stage   animations drawn over the student's code (the tutor's, and Ask's step-by-step runs)
//   #island  the island's pill   #ask  the Ask button next to the cursor
// In a plain browser (`npm run ui`) the panel runs on mock data; add `?island` for the island demo.
export function App() {
  const hash = window.location.hash
  if (hash === '#select') return <AreaSelector />
  if (hash === '#ask') {
    return (
      <div className="flex h-full items-start p-1.5">
        <AskButton />
      </div>
    )
  }
  const islandDemo = new URLSearchParams(window.location.search).has('island') ? islandMock : null
  return (
    <MotionConfig reducedMotion="user">
      {hash === '#stage' ? (
        <StageScreen />
      ) : hash === '#island' ? (
        <IslandScreen />
      ) : islandDemo ? (
        <MockPage mock={islandDemo} />
      ) : (
        <Overlay />
      )}
    </MotionConfig>
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
  const [screen, setScreen] = useState<'main' | 'gaps'>('main')
  const [compact, setCompact] = useState(false)
  const [glass, setGlass] = useState<Glass>(loadGlass)
  const [size, setSize] = useState<PanelSize>(loadSize)
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [mockStage, setMockStage] = useState<StageShow | null>(null)
  const islandView = useIslandView()
  const asking = Boolean(islandView && islandView.phase !== 'idle')
  useNarration(islandView)

  useEffect(() => {
    if (isMock) document.body.classList.add('mock-desktop')
    void api.getStatus().then(setStatus)
    void api.getSession().then(setSession)
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
  const playingRef = useRef(playing)
  playingRef.current = playing

  // A new problem (or none): close any animation, back to the main screen, full size.
  useEffect(() => {
    stopPlayback.current()
    if (!session?.id) return
    setScreen('main')
    setCompact(false)
  }, [session?.id])

  // A new Ask: its answer shows here, so open the panel up.
  useEffect(() => {
    if (!asking) return
    setScreen('main')
    setCompact(false)
    api.setWindowMode(windowMode(false, playingRef.current))
  }, [asking])

  const toggleCompact = (): void => {
    const next = !compact
    setCompact(next)
    api.setWindowMode(windowMode(next, playing))
  }

  // The window is exactly as tall as the panel: small when there's little to show.
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = panel.current
    if (!el || isMock) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => api.fitHeight(Math.ceil(el.getBoundingClientRect().height)))
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  // A saved width from last time: apply it once the window exists.
  useEffect(() => {
    if (!isMock && size.width) api.resizeWidth(size.width, 'right')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeSize = (next: PanelSize): void => {
    setSize(next)
    try {
      localStorage.setItem('clueless.size', JSON.stringify(next))
    } catch {
      // storage unavailable: the size just won't persist
    }
  }

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
    <div className={isMock ? 'flex h-full items-start justify-end p-6' : 'relative p-2'} data-app-ready>
      {isMock && <MockDesktop />}
      <div
        ref={panel}
        className={
          // overflow-clip, not overflow-hidden: a hidden box can still be scrolled (focusing the
          // answer box did that), which pushed the header out of the top of a short panel.
          'glass-panel relative flex flex-col overflow-clip rounded-2xl text-zinc-900 shadow-xl dark:text-zinc-100 ' +
          (glass === 'clear' ? 'glass-clear ' : '') +
          // Code mode: the panel turns see-through so the animation on the code is the focus.
          (onCode ? 'opacity-40 transition-opacity duration-300 hover:opacity-100 ' : '') +
          (isMock ? (explain && !compact ? 'w-[844px]' : 'w-[400px]') : 'w-full')
        }
        style={
          {
            '--glass': GLASS_ALPHA[glass],
            maxHeight: window.screen.availHeight - 64,
            // The dragged height is a minimum: a longer reply grows the panel (up to maxHeight).
            minHeight: size.height && !compact ? Math.min(size.height, window.screen.availHeight - 64) : undefined
          } as React.CSSProperties
        }
      >
        <Header
          compact={compact}
          stuck={session?.stuck ?? null}
          glass={glass}
          onGlass={changeGlass}
          onToggleCompact={toggleCompact}
          onOpenGaps={() => {
            if (compact) toggleCompact()
            setScreen('gaps')
          }}
        />
        {!compact && (
          <>
            <Banners status={status} />
            {/* Explain mode: the animation pane sits to the left of the conversation. */}
            <div className="panel-body">
              {explain && <AnimationPane playing={explain} onReplay={playback.replay} onClose={playback.stop} />}
              <div className="panel-main">
                {screen === 'gaps' ? (
                  <GapsScreen onBack={() => setScreen('main')} />
                ) : asking ? (
                  <AskCard view={islandView!} onReadAloud={(markdown) => speech.speak(toSpeech(markdown))} />
                ) : session ? (
                  <SessionScreen session={session} onOpenGaps={() => setScreen('gaps')} />
                ) : (
                  <EmptyState status={status} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {!isMock && !compact && <ResizeGrips panel={panel} size={size} onSize={changeSize} />}
      {isMock && mockStage && <CodeOverlay show={mockStage} />}
    </div>
    </PlaybackContext.Provider>
  )
}

/** User-chosen panel size. null = default (416px wide, as tall as its content). */
interface PanelSize {
  width: number | null
  height: number | null
}

function loadSize(): PanelSize {
  try {
    const saved = JSON.parse(localStorage.getItem('clueless.size') ?? 'null')
    if (saved && typeof saved === 'object') {
      return {
        width: typeof saved.width === 'number' ? saved.width : null,
        height: typeof saved.height === 'number' ? saved.height : null
      }
    }
  } catch {
    // storage unavailable or garbled: use the default
  }
  return { width: null, height: null }
}

type Edge = 'left' | 'right' | 'bottom' | 'bottom-left' | 'bottom-right'

const GRIPS: { edge: Edge; className: string }[] = [
  { edge: 'left', className: 'left-0 top-3 bottom-3 w-2.5 cursor-ew-resize' },
  { edge: 'right', className: 'right-0 top-3 bottom-3 w-2.5 cursor-ew-resize' },
  { edge: 'bottom', className: 'bottom-0 left-3 right-3 h-2.5 cursor-ns-resize' },
  { edge: 'bottom-left', className: 'bottom-0 left-0 h-4 w-4 cursor-nesw-resize' },
  { edge: 'bottom-right', className: 'bottom-0 right-0 h-4 w-4 cursor-nwse-resize' }
]

/**
 * Drag handles on the panel's edges. Transparent windows can't be resized natively, so the
 * width goes to the main process and the height becomes the panel's own (the window follows it).
 * Double-click a handle to go back to the default size.
 */
function ResizeGrips({
  panel,
  size,
  onSize
}: {
  panel: React.RefObject<HTMLDivElement | null>
  size: PanelSize
  onSize: (s: PanelSize) => void
}) {
  const start = (edge: Edge) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const x0 = e.screenX
    const y0 = e.screenY
    const w0 = window.innerWidth
    const h0 = panel.current?.getBoundingClientRect().height ?? 300
    const maxH = window.screen.availHeight - 64
    let next = { ...size }
    const move = (ev: PointerEvent): void => {
      const dx = ev.screenX - x0
      const dy = ev.screenY - y0
      if (edge !== 'bottom') {
        const left = edge === 'left' || edge === 'bottom-left'
        const width = Math.round(left ? w0 - dx : w0 + dx)
        api.resizeWidth(width, left ? 'right' : 'left')
        next = { ...next, width: Math.max(320, Math.min(width, 960)) }
      }
      if (edge.startsWith('bottom')) {
        next = { ...next, height: Math.round(Math.max(160, Math.min(h0 + dy, maxH))) }
        onSize(next)
      }
    }
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      onSize(next)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const reset = (): void => {
    api.resizeWidth(416, 'right')
    onSize({ width: null, height: null })
  }

  return (
    <>
      {GRIPS.map((g) => (
        <div
          key={g.edge}
          className={'no-drag absolute z-50 ' + g.className}
          onPointerDown={start(g.edge)}
          onDoubleClick={reset}
          title="Drag to resize · double-click to reset"
        />
      ))}
    </>
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

/** Browser mock mode only: a fake code editor behind the panel, to show the glass effect. */
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
