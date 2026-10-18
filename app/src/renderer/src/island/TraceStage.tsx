// The animation, drawn right on the student's code (a click-through window over the screen):
// a dashed outline around what they highlighted, a band on the line that runs with a tag for
// conditions, loops and returns, and the variables in a card beside the code, with an arrow from
// the line to them. The pace comes from the island controller (and the voice, when it's on).
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CodeSpot, IslandView, Rect } from '../../../shared/contracts'
import { narrateStep } from '../../../shared/narrate'
import type { CodeTrace, TraceStep } from '../../../shared/trace'
import { cx } from '../components/ui'
import { arrowPath, placeCard } from '../visuals/layout'
import { Figure, type FigureState } from './Figures'
import { changesAt, loopPass, pointersAt, valuesAt } from './traceState'

const SPRING = { type: 'spring', stiffness: 200, damping: 28 } as const

export function TraceStage({ view, avoid }: { view: IslandView; avoid: Rect | null }) {
  const { trace, spot, playback } = view
  if (!trace || !spot || !playback) return null
  return <Drawing key={playback.nonce} trace={trace} spot={spot} index={playback.index} done={!playback.playing && playback.index >= trace.steps.length - 1} avoid={avoid} />
}

function Drawing({ trace, spot, index, done, avoid }: { trace: CodeTrace; spot: CodeSpot; index: number; done: boolean; avoid: Rect | null }) {
  const step = index >= 0 ? trace.steps[index] : null
  const lh = spot.lineHeight
  const area: Rect = lh > 0 ? { x: spot.left, y: spot.top, width: spot.width, height: spot.lines * lh } : { x: spot.left, y: spot.top, width: 1, height: 1 }
  const band = step && lh > 0 ? { y: spot.top + (step.line - 1) * lh, height: (step.endLine - step.line + 1) * lh } : null

  const values = useMemo(() => valuesAt(trace, index), [trace, index])
  const changes = useMemo(() => changesAt(trace, index), [trace, index])
  const pointers = useMemo(() => pointersAt(trace, values), [trace, values])
  const reads = new Set(step?.reads ?? [])
  const shown = trace.entities.filter((e) => values[e.id])
  const said = step ? narrateStep(trace, index).text : 'Watch your code run, one line at a time.'
  const badge = step ? stepBadge(trace, step, index) : null

  const viewport = useViewport()
  const card = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 360, height: 220 })
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const measure = (): void => setSize((s) => (s.width === el.offsetWidth && s.height === el.offsetHeight ? s : { width: el.offsetWidth, height: el.offsetHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const anchorY = band ? band.y + band.height / 2 : area.y + Math.min(area.height, 40) / 2
  const place = placeCard(area, size, viewport, avoid, anchorY)

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" data-trace-stage>
      {lh > 0 && (
        <motion.div
          className="absolute rounded-md border-2 border-dashed border-claude-500/70"
          style={{ left: area.x - 4, top: area.y - 3, width: area.width + 8, height: area.height + 6 }}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
        />
      )}
      {band && (
        <motion.div
          className="absolute rounded-sm border-l-4 border-claude-500 bg-claude-500/25 shadow-[0_0_18px_rgba(217,119,87,0.35)]"
          style={{ left: area.x - 2, width: area.width + 4 }}
          initial={{ opacity: 0, top: band.y, height: band.height }}
          animate={{ opacity: 1, top: band.y, height: band.height }}
          transition={SPRING}
        >
          <AnimatePresence mode="wait">
            {badge && (
              <motion.span
                key={`${index}:${badge.text}`}
                initial={{ opacity: 0, x: -6, scale: 0.85 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
                className={cx('absolute right-1 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-px text-[12px] font-semibold shadow', badge.tone)}
              >
                {badge.text}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
      {place.arrow && band && (
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <marker id="trace-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="#d97757" />
            </marker>
          </defs>
          <motion.path
            fill="none"
            stroke="#d97757"
            strokeWidth={2.5}
            strokeLinecap="round"
            markerEnd="url(#trace-arrow)"
            style={{ filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.4))' }}
            initial={{ pathLength: 0, d: arrowPath(place.arrow.from, place.arrow.to, place.side) }}
            animate={{ pathLength: 1, d: arrowPath(place.arrow.from, place.arrow.to, place.side) }}
            transition={{ pathLength: { duration: 0.5 }, d: SPRING }}
          />
        </svg>
      )}
      {/* the variables, beside the code */}
      <motion.div
        ref={card}
        className="absolute w-max max-w-[560px] rounded-2xl border border-white/10 bg-zinc-950/92 p-3 text-zinc-100 shadow-[0_16px_50px_rgba(0,0,0,0.5)] backdrop-blur"
        initial={{ opacity: 0, left: place.card.x, top: place.card.y }}
        animate={{ opacity: 1, left: place.card.x, top: place.card.y }}
        transition={SPRING}
      >
        <div className="mb-2 flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-claude-500" />
          <span className="min-w-0 flex-1 truncate font-mono text-zinc-300">{step ? trace.code.split('\n')[step.line - 1]?.trim() : 'Your code, step by step'}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">
            {Math.max(0, index + 1)} / {trace.steps.length}
          </span>
        </div>
        {shown.length > 0 && (
          <div className="flex max-w-[540px] flex-wrap items-start gap-3" style={{ zoom: 0.72 }}>
            <AnimatePresence>
              {shown.map((e) => {
                const state: FigureState = changes[e.id] ? 'changed' : reads.has(e.id) ? 'read' : done ? 'rest' : 'idle'
                return <Figure key={e.id} entity={e} value={values[e.id]} change={changes[e.id]} state={state} pointers={pointers[e.id] ?? []} />
              })}
            </AnimatePresence>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cx('max-w-[520px] text-[13.5px] leading-snug text-zinc-200', shown.length > 0 && 'mt-2.5 border-t border-white/10 pt-2')}
          >
            {said}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/** A small tag on the line for steps whose meaning isn't a value change. */
export function stepBadge(trace: CodeTrace, step: TraceStep, index: number): { text: string; tone: string } | null {
  if (step.kind === 'condition' && /^(true|false)$/i.test(step.result)) {
    const yes = step.result.toLowerCase() === 'true'
    return { text: yes ? '✓ true' : '✗ false', tone: yes ? 'bg-emerald-400 text-zinc-950' : 'bg-rose-500 text-white' }
  }
  if (step.kind === 'loop') return { text: `↻ pass ${loopPass(trace, index)}`, tone: 'bg-claude-400 text-zinc-950' }
  if (step.kind === 'return') return { text: step.result ? `→ ${step.result}` : 'return', tone: 'bg-sky-400 text-zinc-950' }
  if (step.kind === 'other' && /Error|Exception/.test(step.result)) return { text: '✗ crash', tone: 'bg-rose-500 text-white' }
  return null
}

function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}
