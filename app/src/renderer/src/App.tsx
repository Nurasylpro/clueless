import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppStatus, MemoryView, SessionView } from '../../shared/contracts'
import { api, isMock } from './api'
import { AreaSelector } from './screens/AreaSelector'
import { Banners, EmptyState, GLASS_ALPHA, Header, type Glass } from './screens/Home'
import { ReviewScreen } from './screens/Review'
import { SessionScreen } from './screens/Session'

export function App() {
  if (window.location.hash === '#select') return <AreaSelector />
  return <Overlay />
}

function Overlay() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [session, setSession] = useState<SessionView | null>(null)
  const [screen, setScreen] = useState<'main' | 'review'>('main')
  const [compact, setCompact] = useState(false)
  const [dueCards, setDueCards] = useState(0)
  const [glass, setGlass] = useState<Glass>(loadGlass)
  const [size, setSize] = useState<PanelSize>(loadSize)

  useEffect(() => {
    if (isMock) document.body.classList.add('mock-desktop')
    void api.getStatus().then(setStatus)
    void api.getSession().then(setSession)
    void api.getMemory().then((m) => setDueCards(m.dueCards.length))
    const offSession = api.onSession(setSession)
    const offStatus = api.onStatus(setStatus)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') api.hide()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offSession()
      offStatus()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // A new problem: back to the main screen, full size.
  useEffect(() => {
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
    api.setWindowMode(next ? 'compact' : 'expanded')
  }

  const onMemory = useCallback((m: MemoryView) => setDueCards(m.dueCards.length), [])

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

  return (
    <div className={isMock ? 'flex h-full items-start justify-end p-6' : 'relative p-2'} data-app-ready>
      {isMock && <MockDesktop />}
      <div
        ref={panel}
        className={
          // overflow-clip, not overflow-hidden: a hidden box can still be scrolled (focusing the
          // answer box did that), which pushed the header out of the top of a short panel.
          'glass-panel relative flex flex-col overflow-clip rounded-2xl text-zinc-900 shadow-xl dark:text-zinc-100 ' +
          (glass === 'clear' ? 'glass-clear ' : '') +
          (isMock ? 'w-[400px]' : 'w-full')
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
            {screen === 'review' ? (
              <ReviewScreen onBack={() => setScreen('main')} onChange={onMemory} />
            ) : session ? (
              <SessionScreen session={session} onOpenReview={() => setScreen('review')} />
            ) : (
              <EmptyState status={status} />
            )}
          </>
        )}
      </div>
      {!isMock && !compact && <ResizeGrips panel={panel} size={size} onSize={changeSize} />}
    </div>
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
