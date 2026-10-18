// The island: a dark pill at the top of the screen (Animate On/Off, Mic, Hide). After Ask it grows
// a small card with the answer; with Animate on, the card shows the short text for 4 s and then
// the whole screen becomes the animation.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { IslandView } from '../../../shared/contracts'
import { ChevronDownIcon, CloseIcon, Logo, MicIcon, SendIcon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { cx } from '../components/ui'
import { islandApi } from './api'
import { TraceOverlay } from './TraceOverlay'

export function IslandScreen() {
  const view = useIslandView()
  if (!view) return null
  if (view.phase === 'playing' && view.trace) {
    return <TraceOverlay trace={view.trace} onClose={() => islandApi.finishAnimation()} />
  }
  return <IslandShell view={view} />
}

export function useIslandView(): IslandView | null {
  const [view, setView] = useState<IslandView | null>(null)
  useEffect(() => {
    void islandApi.getView().then(setView)
    return islandApi.onView(setView)
  }, [])
  return view
}

/** The pill, plus the card when there's something to read. Reports its size so the window fits it. */
export function IslandShell({ view }: { view: IslandView }) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const report = (): void => {
      const r = el.getBoundingClientRect()
      islandApi.resize({ width: Math.ceil(r.width), height: Math.ceil(r.height) })
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const card = view.phase !== 'idle'
  return (
    <div ref={root} className="inline-flex flex-col items-center gap-2 p-2.5 text-zinc-100" data-app-ready>
      <Pill view={view} />
      {card && <Card view={view} />}
    </div>
  )
}

const DARK = 'border border-white/10 bg-zinc-900/90 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur'

function Pill({ view }: { view: IslandView }) {
  return (
    <div className={cx('flex h-12 items-center gap-1.5 rounded-full pl-1.5 pr-1.5', DARK)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-claude-500 text-white" title="Clueless">
        <Logo size={19} />
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={view.animate}
        onClick={() => islandApi.setAnimate(!view.animate)}
        title={view.animate ? 'Animate is on: Ask shows a short text, then animates your code' : 'Animate is off: Ask answers with text only'}
        className="flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-3 text-[13px] font-medium hover:bg-white/[0.12]"
      >
        Animate
        <span className={cx('relative h-[18px] w-8 rounded-full transition-colors', view.animate ? 'bg-claude-500' : 'bg-zinc-600')}>
          <span
            className={cx(
              'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left]',
              view.animate ? 'left-[16px]' : 'left-[2px]'
            )}
          />
        </span>
      </button>
      <button
        type="button"
        disabled
        title="Voice is coming soon"
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 disabled:cursor-not-allowed"
      >
        <MicIcon size={16} />
      </button>
      <button
        type="button"
        onClick={() => islandApi.hide()}
        title="Hide (Ctrl+Shift+2 brings it back)"
        className="flex h-9 items-center gap-1 rounded-full bg-white/[0.07] pl-2 pr-3 text-[13px] font-medium hover:bg-white/[0.12]"
      >
        <ChevronDownIcon size={15} /> Hide
      </button>
    </div>
  )
}

function Card({ view }: { view: IslandView }) {
  const thinking = view.phase === 'thinking'
  return (
    <div
      className={cx('w-[540px] rounded-2xl p-4', DARK)}
      onMouseEnter={() => islandApi.holdCard(true)}
      onMouseLeave={() => islandApi.holdCard(false)}
    >
      <div className="mb-2 flex items-start gap-2">
        {view.snippet && <SnippetPreview text={view.snippet} />}
        <button
          type="button"
          onClick={() => islandApi.closeCard()}
          title="Close"
          className="-mr-1 -mt-1 ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="max-h-[50vh] space-y-2.5 overflow-y-auto text-[14.5px] leading-relaxed">
        {view.messages.map((m, i) =>
          m.role === 'clueless' ? (
            <div key={i} className="selectable">
              <Markdown text={m.text} />
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="selectable max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 px-3 py-1.5">{m.text}</div>
            </div>
          )
        )}
        {view.error && <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-[13.5px] text-rose-200">{view.error}</div>}
        {thinking && <Thinking since={view.busySince} animate={view.animate} />}
      </div>
      {view.phase === 'reading' && <StartingBar />}
      {view.phase === 'answer' && !view.error && <FollowUp />}
    </div>
  )
}

function SnippetPreview({ text }: { text: string }) {
  const lines = text.trim().split('\n')
  return (
    <div className="min-w-0 flex-1 truncate rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-400">
      {lines[0].trim()}
      {lines.length > 1 && <span className="text-zinc-500"> · {lines.length} lines</span>}
    </div>
  )
}

function Thinking({ since, animate }: { since: number | null; animate: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const seconds = since ? Math.max(0, Math.round((now - since) / 1000)) : 0
  return (
    <div className="flex items-center gap-2 text-[13.5px] text-zinc-400">
      <span className="flex gap-1">
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
      </span>
      {animate ? 'Tracing your code step by step…' : 'Reading what you highlighted…'}
      <span className="tabular-nums text-zinc-500">{seconds}s</span>
    </div>
  )
}

/** The 4 s before the animation: a bar that fills up, so the switch never comes as a surprise. */
function StartingBar() {
  return (
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
      <div className="island-fill h-full rounded-full bg-claude-500" />
    </div>
  )
}

function FollowUp() {
  const [text, setText] = useState('')
  const send = (): void => {
    if (!text.trim()) return
    islandApi.followUp(text.trim())
    setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }
  return (
    <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] py-1 pl-3 pr-1 focus-within:border-claude-500/70">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask a follow-up…"
        className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-500"
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim()}
        title="Send"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-claude-500 text-white disabled:opacity-40"
      >
        <SendIcon size={14} />
      </button>
    </div>
  )
}

/** The "Ask" button window that appears next to the cursor after a highlight. */
export function AskButton({ onAsk = () => islandApi.ask() }: { onAsk?: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the highlight in the browser mock
      onClick={onAsk}
      className="flex h-9 items-center gap-1.5 rounded-full bg-claude-500 pl-2 pr-4 text-[14px] font-semibold text-zinc-950 shadow-[0_6px_20px_rgba(0,0,0,0.35)] ring-1 ring-black/10 hover:bg-claude-400"
    >
      <Logo size={17} /> Ask
    </button>
  )
}
