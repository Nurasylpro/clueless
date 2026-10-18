// The full-screen animation (Animate on). The screen dims; the program's variables stand on the
// left as simple figures, the highlighted code sits on the right. Each step, a bright box moves to
// the part of the code that runs, everything else stays dark, and the figures it changes light up.
// Plays once, slowly, then freezes on the last step until the student clicks anywhere (or Esc).
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CodeTrace, TraceStep } from '../../../shared/trace'
import { cx } from '../components/ui'
import { Figure, type FigureState } from './Figures'
import { changesAt, loopPass, pointersAt, valuesAt } from './traceState'
import { finishMessage, momentAt } from './traceExpression'
import { TracePlayback } from './tracePlayback'

const BOX_SPRING = { type: 'spring', stiffness: 120, damping: 22 } as const

export function TraceOverlay({ trace, onClose }: { trace: CodeTrace; onClose: () => void }) {
  const player = useMemo(() => new TracePlayback(trace), [trace])
  const { index, paused, done } = useSyncExternalStore(player.subscribe, player.getSnapshot)
  const step = index >= 0 ? trace.steps[index] : null
  const moment = momentAt(trace, index)
  const reducedMotion = useReducedMotion()
  const finish = finishMessage(trace)
  const atLast = index === trace.steps.length - 1

  useEffect(() => {
    player.start()
    return player.dispose
  }, [player])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.repeat || (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]'))) return
      if (e.code === 'Space') {
        // A focused button already handles Space; don't trigger its action twice.
        if (e.target instanceof Element && e.target.closest('button')) return
        e.preventDefault()
        player.togglePause()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        player.back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, player])

  const values = useMemo(() => valuesAt(trace, index), [trace, index])
  const changes = useMemo(() => changesAt(trace, index), [trace, index])
  const pointers = useMemo(() => pointersAt(trace, values), [trace, values])
  const reads = new Set(step?.reads ?? [])
  const shown = trace.entities.filter((e) => values[e.id])

  return (
    <motion.div
      className={cx('fixed inset-0 z-50 flex select-none items-center justify-center bg-black/85', done && 'cursor-pointer')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      onClick={() => done && onClose()}
      data-app-ready
    >
      <div className="grid h-full max-h-[900px] w-full max-w-[1600px] grid-cols-2 items-center gap-12 px-[5vw] py-[7vh]">
        {/* the variables */}
        <div className="flex flex-wrap content-center items-start justify-center gap-6">
          <AnimatePresence>
            {shown.map((e) => {
              // On the last step nothing dims: the final state stays fully visible.
              const state: FigureState = changes[e.id] ? 'changed' : reads.has(e.id) ? 'read' : atLast ? 'rest' : 'idle'
              return (
                <Figure
                  key={e.id}
                  entity={e}
                  value={values[e.id]}
                  change={changes[e.id]}
                  state={state}
                  pointers={pointers[e.id] ?? []}
                  emphasis={moment && (reads.has(e.id) || Boolean(changes[e.id])) ? index : undefined}
                  celebrate={done && finish.celebrate}
                />
              )
            })}
          </AnimatePresence>
        </div>
        {/* the code */}
        <CodePanel trace={trace} step={step} index={index} />
      </div>
      <AnimatePresence mode="wait">
        {(done || moment) && (
          <motion.div
            key={done ? 'finish' : index}
            role="status"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-x-6 top-5 flex justify-center"
          >
            <div className={cx('relative max-w-xl rounded-2xl border px-5 py-3 text-center',
              done && finish.celebrate ? 'border-emerald-300/40 bg-emerald-950/95 text-emerald-100'
                : moment?.tone === 'amber' && !done ? 'border-amber-300/30 bg-zinc-950/95 text-amber-100'
                  : 'border-sky-300/25 bg-zinc-950/95 text-sky-100')}>
              {done && finish.celebrate && (
                <div className="mb-1 text-emerald-300" aria-hidden="true">
                  <svg className="mx-auto h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <motion.path d="M5 12l4 4L19 6" initial={{ pathLength: reducedMotion ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.15 }} />
                  </svg>
                </div>
              )}
              <div className="text-sm font-semibold">{done ? finish.title : moment?.title}</div>
              <div className="mt-1 break-words text-xs opacity-75">{done ? finish.detail : moment?.detail}</div>
              {done && finish.celebrate && !reducedMotion && (
                <motion.div aria-hidden="true" className="absolute inset-0 rounded-2xl border border-emerald-300"
                  initial={{ opacity: 0.7, scale: 1 }} animate={{ opacity: 0, scale: 1.15 }} transition={{ duration: 1.1 }} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <PlaybackControls index={index} total={trace.steps.length} paused={paused} done={done}
        onBack={player.back} onTogglePause={player.togglePause} />
    </motion.div>
  )
}

// ---------- the code, with the spotlight ----------

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function CodePanel({ trace, step, index }: { trace: CodeTrace; step: TraceStep | null; index: number }) {
  const lines = useMemo(() => trace.code.split('\n'), [trace.code])
  const fontSize = lines.length <= 14 ? 18 : lines.length <= 24 ? 16 : lines.length <= 36 ? 14 : 12
  const panel = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([])
  const focusRef = useRef<HTMLSpanElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  // Measure where the running part of the code is, and move the bright box there.
  useLayoutEffect(() => {
    const root = panel.current
    if (!root || !step) return setBox(null)
    const origin = root.getBoundingClientRect()
    const rects: DOMRect[] = []
    if (focusRef.current) rects.push(focusRef.current.getBoundingClientRect())
    else for (let l = step.line; l <= step.endLine; l++) {
      const el = lineRefs.current[l - 1]
      if (el) rects.push(el.getBoundingClientRect())
    }
    if (!rects.length) return setBox(null)
    const pad = 7
    const left = Math.min(...rects.map((r) => r.left)) - origin.left - pad
    const top = Math.min(...rects.map((r) => r.top)) - origin.top - pad / 1.5
    const right = Math.max(...rects.map((r) => r.right)) - origin.left + pad
    const bottom = Math.max(...rects.map((r) => r.bottom)) - origin.top + pad / 1.5
    setBox({ x: left, y: top, width: Math.max(right - left, 24), height: bottom - top })
  }, [step, fontSize])

  const badge = step ? stepBadge(trace, step, index) : null

  return (
    <motion.div
      ref={panel}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="relative overflow-visible rounded-2xl border border-white/10 bg-zinc-950/90 px-6 py-5 font-mono"
      style={{ fontSize, lineHeight: 1.75 }}
    >
      {lines.map((text, i) => {
        const n = i + 1
        const on = step != null && n >= step.line && n <= step.endLine
        const focus = on && step.focus && n === step.line ? step.focus : ''
        const at = focus ? text.indexOf(focus) : -1
        return (
          <div key={i} className="flex whitespace-pre">
            <span className="w-9 shrink-0 select-none pr-3 text-right text-zinc-600" style={{ fontSize: fontSize * 0.75 }}>
              {n}
            </span>
            <span
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              className={cx(
                'transition-[opacity,color] duration-500',
                on ? 'text-white' : 'text-zinc-300',
                !on && step && 'opacity-25'
              )}
            >
              {at >= 0 ? (
                <>
                  <span className="opacity-40 transition-opacity duration-500">{text.slice(0, at)}</span>
                  <span ref={focusRef}>{focus}</span>
                  <span className="opacity-40 transition-opacity duration-500">{text.slice(at + focus.length)}</span>
                </>
              ) : (
                text || ' '
              )}
            </span>
          </div>
        )
      })}
      {/* the bright box, like a spotlight on the part that runs */}
      {box && (
        <motion.div
          className="pointer-events-none absolute left-0 top-0 rounded-lg border-2 border-white shadow-[0_0_24px_rgba(255,255,255,0.45),inset_0_0_14px_rgba(255,255,255,0.12)]"
          initial={{ opacity: 0, ...box }}
          animate={{ opacity: 1, ...box }}
          transition={BOX_SPRING}
        >
          <AnimatePresence mode="wait">
            {badge && (
              <motion.span
                key={`${index}:${badge.text}`}
                initial={{ opacity: 0, x: -6, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 20 }}
                className={cx(
                  'absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 font-sans text-[13px] font-semibold',
                  badge.tone
                )}
              >
                {badge.text}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  )
}

/** A small tag on the spotlight for steps whose meaning isn't a value change. */
function stepBadge(trace: CodeTrace, step: TraceStep, index: number): { text: string; tone: string } | null {
  if (step.kind === 'condition' && /^(true|false)$/i.test(step.result)) {
    const yes = step.result.toLowerCase() === 'true'
    return { text: yes ? '✓ true' : '✗ false', tone: yes ? 'bg-emerald-400 text-zinc-950' : 'bg-rose-500 text-white' }
  }
  if (step.kind === 'loop') return { text: `↻ pass ${loopPass(trace, index)}`, tone: 'bg-amber-300 text-zinc-950' }
  if (step.kind === 'return') return { text: step.result ? `→ ${step.result}` : 'return', tone: 'bg-sky-400 text-zinc-950' }
  return null
}

function PlaybackControls({ index, total, paused, done, onBack, onTogglePause }: {
  index: number
  total: number
  paused: boolean
  done: boolean
  onBack: () => void
  onTogglePause: () => void
}) {
  const button = 'rounded-lg border border-white/15 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-zinc-900'
  return (
    <div className="absolute inset-x-0 bottom-5 flex flex-col items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/95 p-2" role="group" aria-label="Animation controls">
        <button type="button" className={button} onClick={onBack} disabled={index <= 0} title="Go back one step and pause (Left arrow)">
          ← Back
        </button>
        <button type="button" className={button} onClick={onTogglePause} disabled={done || total === 0} title="Pause or resume (Space)">
          {done ? 'Finished' : paused ? 'Resume' : 'Pause'}
        </button>
        <span className="min-w-28 px-2 text-center text-xs tabular-nums text-zinc-400" aria-live="polite">
          {index < 0 ? 'Getting ready' : `Step ${index + 1} of ${total}`}{paused ? ' · Paused' : ''}
        </span>
      </div>
      <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Trace progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1}>
        <motion.div
          className="h-full rounded-full bg-white/70"
          animate={{ width: `${total ? ((index + 1) / total) * 100 : 0}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="text-xs text-zinc-400">{done ? 'Click outside the controls to close · Esc to close' : 'Space to pause or resume · ← to go back · Esc to close'}</div>
    </div>
  )
}
