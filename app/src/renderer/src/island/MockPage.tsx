// Browser mock mode (`npm run ui`): a fake LeetCode page with the island on top. Highlight some
// code or text with the mouse and click Ask: the answer shows in a stand-in panel and, with
// Animate on, the code runs step by step right on the page. Ctrl+Shift+3 shows the pill after Hide.
import { useEffect, useState } from 'react'
import type { CodeSpot } from '../../../shared/contracts'
import { normalizeSnippet } from '../../../shared/trace'
import type { IslandMock } from './mock'
import { AskCard } from './AskCard'
import { AskButton, Pill, useIslandView } from './IslandScreen'
import { MOCK_CODE } from './fixtures'
import { TraceStage } from './TraceStage'
import { useNarration } from './useNarration'

export function MockPage({ mock }: { mock: IslandMock }) {
  const view = useIslandView()
  useNarration(view)
  const [hidden, setHidden] = useState(false)
  const [ask, setAsk] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    document.body.classList.add('mock-desktop')
    const offHidden = mock.onHidden(setHidden)
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Digit3') mock.show()
      setAsk(null)
    }
    // Like the real app: once a highlight stops changing, show Ask where it ends.
    let settle: ReturnType<typeof setTimeout> | undefined
    const onSelection = (): void => {
      clearTimeout(settle)
      settle = setTimeout(() => {
        const selection = window.getSelection()
        const text = selection?.toString() ?? ''
        if (!selection || !text.trim() || selection.anchorNode?.parentElement?.closest('[data-island]')) return setAsk(null)
        const rects = [...selection.getRangeAt(0).getClientRects()].filter((r) => r.width > 0 && r.height > 0)
        const end = rects[rects.length - 1]
        mock.select(text, spotOf(rects, text))
        setAsk(end ? { x: end.right + 6, y: end.bottom + 8 } : null)
      }, 350)
    }
    const onWheel = (): void => mock.scrolled()
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    document.addEventListener('selectionchange', onSelection)
    return () => {
      offHidden()
      clearTimeout(settle)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      document.removeEventListener('selectionchange', onSelection)
    }
  }, [mock])

  // The Ask button goes away after a few seconds, like the real one.
  useEffect(() => {
    if (!ask) return
    const t = setTimeout(() => setAsk(null), 4000)
    return () => clearTimeout(t)
  }, [ask])

  return (
    <div className="h-full overflow-hidden">
      <FakeLeetCode />
      {!hidden && view && (
        <div data-island className="fixed left-1/2 top-1.5 z-40 -translate-x-1/2">
          <Pill view={view} />
        </div>
      )}
      {hidden && (
        <div className="fixed left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-zinc-400">
          Hidden. Press Ctrl+Shift+3 to show the pill.
        </div>
      )}
      {ask && !hidden && view?.askOnHighlight && (
        <div data-island className="fixed z-50" style={{ left: ask.x, top: ask.y }}>
          <AskButton
            onAsk={() => {
              setAsk(null)
              mock.ask()
            }}
          />
        </div>
      )}
      {/* a stand-in for the panel, where the answer shows */}
      {view && view.phase !== 'idle' && (
        <div data-island className="glass-panel fixed bottom-4 right-4 z-40 w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 text-zinc-100 shadow-2xl">
          <AskCard view={view} />
        </div>
      )}
      {view && <TraceStage view={view} avoid={panelRect()} />}
    </div>
  )
}

/** Where the highlighted lines are, from the browser's own selection boxes. */
function spotOf(rects: DOMRect[], text: string): CodeSpot | null {
  if (!rects.length) return null
  const lines = normalizeSnippet(text).split('\n').length
  // Text boxes are shorter than lines: the pitch comes from the first and last line's tops.
  const first = Math.min(...rects.map((r) => r.top))
  const last = Math.max(...rects.map((r) => r.top))
  const textHeight = rects[0].height
  const lineHeight = lines > 1 ? (last - first) / (lines - 1) : textHeight * 1.5
  const left = Math.min(...rects.map((r) => r.left))
  const right = Math.max(...rects.map((r) => r.right))
  return { displayId: 0, left: left - 6, width: right - left + 12, top: first - (lineHeight - textHeight) / 2, lineHeight, lines }
}

function panelRect() {
  const r = document.querySelector('.glass-panel')?.getBoundingClientRect()
  return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
}

/** A LeetCode-like page: the problem on the left, the student's code on the right. Highlightable. */
function FakeLeetCode() {
  return (
    <div className="selectable grid h-full grid-cols-[1fr_1.3fr] gap-3 p-3 pt-20 text-zinc-300">
      <div className="overflow-hidden rounded-lg bg-zinc-900/80 p-5 text-[14px] leading-relaxed">
        <div className="mb-3 text-lg font-semibold text-white">217. Contains Duplicate</div>
        <p>
          Given an integer array <code className="rounded bg-white/10 px-1">nums</code>, return{' '}
          <code className="rounded bg-white/10 px-1">true</code> if any value appears <b>at least twice</b> in the array, and
          return <code className="rounded bg-white/10 px-1">false</code> if every element is distinct.
        </p>
        <p className="mt-4 font-semibold text-white">Example 1:</p>
        <pre className="mt-1 rounded bg-white/5 p-3 font-mono text-[13px]">{'Input: nums = [1,2,3,1]\nOutput: true'}</pre>
        <p className="mt-4 font-semibold text-white">Example 2:</p>
        <pre className="mt-1 rounded bg-white/5 p-3 font-mono text-[13px]">{'Input: nums = [1,2,3,4]\nOutput: false'}</pre>
      </div>
      <div className="overflow-hidden rounded-lg bg-[#1e1e1e] p-5">
        <div className="mb-3 text-xs text-zinc-500">Python3 · Auto</div>
        <pre className="font-mono text-[14px] leading-7 text-sky-200">{MOCK_CODE}</pre>
      </div>
    </div>
  )
}
