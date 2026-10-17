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

  const changeGlass = (g: Glass): void => {
    setGlass(g)
    try {
      localStorage.setItem('clueless.glass', g)
    } catch {
      // storage unavailable: the setting just won't persist
    }
  }

  return (
    <div className={isMock ? 'flex h-full items-start justify-end p-6' : 'p-2'} data-app-ready>
      {isMock && <MockDesktop />}
      <div
        ref={panel}
        className={
          'glass-panel relative flex flex-col overflow-hidden rounded-2xl text-zinc-900 shadow-xl dark:text-zinc-100 ' +
          (glass === 'clear' ? 'glass-clear ' : '') +
          (isMock ? 'w-[400px]' : 'w-full')
        }
        style={{ '--glass': GLASS_ALPHA[glass], maxHeight: window.screen.availHeight - 64 } as React.CSSProperties}
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
    </div>
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
