// The simplest figures for a program's variables: a box for a value, a row of boxes for an array,
// a grid, a bag for a set, key → value rows for a map. What the current step changed lights up
// (white glow, new values pop in amber); what it only reads gets a thin outline; the rest dims.
import { AnimatePresence, motion } from 'motion/react'
import type { EntityValue, TraceEntity } from '../../../shared/trace'
import { cx } from '../components/ui'
import type { Change } from './traceState'

export type FigureState = 'changed' | 'read' | 'rest' | 'idle'

const SPRING = { type: 'spring', stiffness: 170, damping: 24 } as const
const POP = {
  initial: { opacity: 0, scale: 1.6, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.6 },
  transition: { type: 'spring', stiffness: 220, damping: 18 }
} as const
/** A cell that just changed: flashes amber, then settles back. */
const FLASH = { backgroundColor: ['rgba(251,191,36,0.85)', 'rgba(251,191,36,0.85)', 'rgba(255,255,255,0.06)'] }

export function Figure({
  entity,
  value,
  change,
  state,
  pointers
}: {
  entity: TraceEntity
  value: EntityValue
  change: Change | undefined
  state: FigureState
  pointers: { name: string; index: number }[]
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: state === 'idle' ? 0.38 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ opacity: { duration: 0.5 }, default: SPRING }}
      className={cx(
        'rounded-2xl px-4 pb-3.5 pt-2.5 transition-shadow duration-500',
        state === 'changed'
          ? 'bg-white/[0.07] shadow-[0_0_0_2px_rgba(255,255,255,0.95),0_0_32px_rgba(255,255,255,0.28)]'
          : state === 'read'
            ? 'bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.45)]'
            : 'bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
      )}
    >
      <div className="mb-2 font-mono text-[14px] text-zinc-400">{entity.name}</div>
      {entity.kind === 'value' && <ValueBox value={value.scalar} changed={Boolean(change?.added || change?.scalar)} />}
      {entity.kind === 'array' && <ArrayRow items={value.items} changed={change} pointers={pointers} />}
      {entity.kind === 'grid' && <Grid rows={value.rows} changed={change} />}
      {entity.kind === 'set' && <SetBag items={value.items} fresh={change?.added ? [] : (change?.items ?? [])} />}
      {entity.kind === 'map' && <MapRows entries={value.entries} changed={change?.added ? [] : (change?.keys ?? [])} />}
    </motion.div>
  )
}

const BOX = 'flex items-center justify-center rounded-xl border-2 border-white/25 font-mono text-zinc-50'

function ValueBox({ value, changed }: { value: string; changed: boolean }) {
  return (
    <div className={cx(BOX, 'h-16 min-w-16 overflow-hidden px-3 text-[26px]', changed && 'border-amber-300')}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} {...POP} className={changed ? 'text-amber-200' : undefined}>
          {value || ' '}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

function ArrayRow({ items, changed, pointers }: { items: string[]; changed: Change | undefined; pointers: { name: string; index: number }[] }) {
  const size = items.length > 12 ? 40 : 54
  const hot = new Set(changed && !changed.added ? changed.indices : [])
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.length === 0 && <div className="font-mono text-sm text-zinc-500">[ ]</div>}
      {items.map((item, i) => {
        const here = pointers.filter((p) => p.index === i)
        return (
          <div key={i} className="flex flex-col items-center">
            <motion.div
              key={hot.has(i) ? `${i}:${item}` : i}
              className={cx(BOX, 'text-[20px]')}
              style={{ width: size, height: size }}
              initial={hot.has(i) ? FLASH : false}
              animate={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              transition={{ duration: 1.4, times: [0, 0.5, 1] }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={item} {...POP}>
                  {item}
                </motion.span>
              </AnimatePresence>
            </motion.div>
            <span className="mt-1 font-mono text-[11px] text-zinc-500">{i}</span>
            <div className="h-6">
              {here.length > 0 && (
                <motion.div
                  layoutId={`ptr-${here.map((p) => p.name).join(',')}`}
                  transition={SPRING}
                  className="whitespace-nowrap rounded-full bg-amber-300 px-2 font-mono text-[12px] font-semibold leading-5 text-zinc-950"
                >
                  ↑ {here.map((p) => p.name).join(', ')}
                </motion.div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Grid({ rows, changed }: { rows: string[][]; changed: Change | undefined }) {
  const cols = Math.max(1, ...rows.map((r) => r.length))
  const size = Math.max(22, Math.min(44, Math.floor(400 / cols)))
  const hot = new Set(changed && !changed.added ? changed.cells : [])
  return (
    <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}>
      {rows.flatMap((row, r) =>
        Array.from({ length: cols }, (_, c) => {
          const v = row[c] ?? ''
          const isHot = hot.has(`${r},${c}`)
          return (
            <motion.div
              key={isHot ? `${r},${c}:${v}` : `${r},${c}`}
              className={cx(BOX, 'rounded-md border text-[15px]')}
              style={{ width: size, height: size }}
              initial={isHot ? FLASH : false}
              animate={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              transition={{ duration: 1.4, times: [0, 0.5, 1] }}
            >
              {v}
            </motion.div>
          )
        })
      )}
    </div>
  )
}

function SetBag({ items, fresh }: { items: string[]; fresh: string[] }) {
  const isFresh = new Set(fresh)
  return (
    <div className="flex min-h-16 min-w-36 max-w-80 flex-wrap content-center items-center justify-center gap-2 rounded-[32px] border-2 border-white/25 px-4 py-3">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.span
            key={item}
            layout
            initial={{ opacity: 0, y: -28, scale: 0.4 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 160, damping: 16 }}
            className={cx(
              'flex h-10 min-w-10 items-center justify-center rounded-full px-2 font-mono text-[18px]',
              isFresh.has(item) ? 'bg-amber-300 text-zinc-950' : 'bg-white/10 text-zinc-50'
            )}
          >
            {item}
          </motion.span>
        ))}
      </AnimatePresence>
      {items.length === 0 && <span className="font-mono text-sm text-zinc-500">empty</span>}
    </div>
  )
}

function MapRows({ entries, changed }: { entries: { key: string; value: string }[]; changed: string[] }) {
  const hot = new Set(changed)
  return (
    <div className="flex min-w-40 flex-col gap-1.5 rounded-xl border-2 border-white/25 p-2">
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <motion.div
            key={e.key}
            layout
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className={cx(
              'flex items-center gap-3 rounded-lg px-2.5 py-1 font-mono text-[17px] transition-colors duration-700',
              hot.has(e.key) ? 'bg-amber-300 text-zinc-950' : 'bg-white/[0.06] text-zinc-50'
            )}
          >
            <span className="font-semibold">{e.key}</span>
            <span className="opacity-50">→</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={e.value} {...POP}>
                {e.value}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>
      {entries.length === 0 && <span className="px-1 font-mono text-sm text-zinc-500">{'{ }'}</span>}
    </div>
  )
}
