// The island: a dark pill at the top of the screen with two switches. "Ask" shows an Ask button
// after you highlight something; "Animate" makes code answers play step by step on the code
// itself. The answers show in the panel (AskCard), the animation on the code (TraceStage).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { IslandView } from '../../../shared/contracts'
import { ChevronDownIcon, Logo } from '../components/icons'
import { cx } from '../components/ui'
import { islandApi } from './api'

export function IslandScreen() {
  const view = useIslandView()
  return view ? <Pill view={view} /> : null
}

export function useIslandView(): IslandView | null {
  const [view, setView] = useState<IslandView | null>(null)
  useEffect(() => {
    void islandApi.getView().then(setView)
    return islandApi.onView(setView)
  }, [])
  return view
}

const DARK = 'border border-white/10 bg-zinc-900/90 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur'

/** The pill. Reports its size so the window fits it. */
export function Pill({ view }: { view: IslandView }) {
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

  return (
    <div ref={root} className="inline-flex p-2.5 text-zinc-100" data-app-ready>
      <div className={cx('flex h-12 items-center gap-1.5 rounded-full pl-1.5 pr-1.5', DARK)}>
        <div
          className={cx('flex h-9 w-9 items-center justify-center rounded-full bg-claude-500 text-white', view.phase === 'thinking' && 'animate-pulse')}
          title={view.phase === 'thinking' ? 'Thinking…' : 'Clueless'}
        >
          <Logo size={19} />
        </div>
        <Switch
          label="Ask"
          on={view.askOnHighlight}
          onChange={(on) => islandApi.setAskOnHighlight(on)}
          title={view.askOnHighlight ? 'Ask is on: highlight anything to get an Ask button' : 'Ask is off: highlighting does nothing'}
        />
        <Switch
          label="Animate"
          on={view.animate}
          onChange={(on) => islandApi.setAnimate(on)}
          title={view.animate ? 'Animate is on: highlighted code plays step by step, right on the code' : 'Animate is off: answers are text only'}
        />
        <button
          type="button"
          onClick={() => islandApi.hide()}
          title="Hide (Ctrl/⌘+Shift+3 brings it back)"
          className="flex h-9 items-center gap-1 rounded-full bg-white/[0.07] pl-2 pr-3 text-[13px] font-medium hover:bg-white/[0.12]"
        >
          <ChevronDownIcon size={15} /> Hide
        </button>
      </div>
    </div>
  )
}

function Switch({ label, on, onChange, title }: { label: string; on: boolean; onChange: (on: boolean) => void; title: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={title}
      className="flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-3 text-[13px] font-medium hover:bg-white/[0.12]"
    >
      {label}
      <span className={cx('relative h-[18px] w-8 rounded-full transition-colors', on ? 'bg-claude-500' : 'bg-zinc-600')}>
        <span className={cx('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left]', on ? 'left-[16px]' : 'left-[2px]')} />
      </span>
    </button>
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
