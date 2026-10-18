// Browser mock mode (`npm run ui`): a fake LeetCode page with the island on top. Highlight some
// code or text with the mouse, click Ask. Ctrl+Shift+2 shows the island again after Hide.
import { useEffect, useState } from 'react'
import type { IslandMock } from './mock'
import { AskButton, IslandShell, useIslandView } from './IslandScreen'
import { DEMO_EXAMPLES } from './fixtures'
import { TraceOverlay } from './TraceOverlay'

export function MockPage({ mock }: { mock: IslandMock }) {
  const view = useIslandView()
  const [hidden, setHidden] = useState(false)
  const [ask, setAsk] = useState<{ x: number; y: number } | null>(null)
  const [exampleId, setExampleId] = useState<string>('correct')
  const example = DEMO_EXAMPLES.find((item) => item.id === exampleId) ?? DEMO_EXAMPLES[0]

  useEffect(() => {
    document.body.classList.add('mock-desktop')
    const offHidden = mock.onHidden(setHidden)
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '@') mock.show()
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Digit2') mock.show()
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
        const rects = selection.getRangeAt(0).getClientRects()
        const end = rects[rects.length - 1]
        mock.select(text)
        setAsk(end ? { x: end.right + 6, y: end.bottom + 8 } : null)
      }, 350)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('selectionchange', onSelection)
    return () => {
      offHidden()
      clearTimeout(settle)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('selectionchange', onSelection)
    }
  }, [mock])

  // The Ask button goes away after a few seconds, like the real one.
  useEffect(() => {
    if (!ask) return
    const t = setTimeout(() => setAsk(null), 4000)
    return () => clearTimeout(t)
  }, [ask])

  const playing = view?.phase === 'playing' && view.trace
  return (
    <div className="h-full overflow-hidden">
      <FakeLeetCode code={example.reply.trace.code} exampleId={exampleId} onExampleChange={(id) => {
        setExampleId(id)
        setAsk(null)
        window.getSelection()?.removeAllRanges()
        mock.closeCard()
      }} />
      {!hidden && view && !playing && (
        <div data-island className="fixed left-1/2 top-1.5 z-40 -translate-x-1/2">
          <IslandShell view={view} />
        </div>
      )}
      {hidden && (
        <div className="fixed left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-zinc-400">
          Hidden. Press Ctrl+Shift+2 to show the island.
        </div>
      )}
      {ask && !hidden && (
        <div data-island className="fixed z-50" style={{ left: ask.x, top: ask.y }}>
          <AskButton
            onAsk={() => {
              setAsk(null)
              mock.ask()
            }}
          />
        </div>
      )}
      {playing && <TraceOverlay trace={view.trace!} onClose={() => mock.finishAnimation()} />}
    </div>
  )
}

/** A LeetCode-like page: the problem on the left, the student's code on the right. Highlightable. */
function FakeLeetCode({ code, exampleId, onExampleChange }: { code: string; exampleId: string; onExampleChange: (id: string) => void }) {
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
        <pre className="mt-1 rounded bg-white/5 p-3 font-mono text-[13px]">{'Input: nums = [3,1,4,1]\nOutput: true'}</pre>
        <p className="mt-4 font-semibold text-white">Example 2:</p>
        <pre className="mt-1 rounded bg-white/5 p-3 font-mono text-[13px]">{'Input: nums = [1,2,3,4]\nOutput: false'}</pre>
      </div>
      <div className="overflow-hidden rounded-lg bg-[#1e1e1e] p-5">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
          <label className="flex items-center gap-2">
            Example
            <select value={exampleId} onChange={(event) => onExampleChange(event.target.value)} className="rounded-md border border-white/15 bg-zinc-900 px-2 py-1.5 text-zinc-200">
              {DEMO_EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.label}</option>)}
            </select>
          </label>
          <span>Python3</span>
        </div>
        <p className="mb-3 text-xs text-zinc-500">Select the whole code below, then click Ask to watch this example.</p>
        <pre className="font-mono text-[14px] leading-7 text-sky-200">{code}</pre>
      </div>
    </div>
  )
}
