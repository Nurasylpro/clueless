// Draws one frame (a Scene) of a visual. Every frame is the whole picture at that moment; the
// same scene drawn again with new data animates the difference (things drop in, move, flash).
// Used by both modes: explain mode (in the panel) and code mode (floating over the code).
import { compile, type EvalFunction } from 'mathjs'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import type { Scene } from '../../../shared/contracts'
import { cx } from '../components/ui'

type Of<T extends Scene['type']> = Extract<Scene, { type: T }>

const SPRING = { type: 'spring', stiffness: 420, damping: 30 } as const
const DROP = { initial: { opacity: 0, y: -10, scale: 0.6 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, scale: 0.6 } }

export function SceneView({ scene }: { scene: Scene }) {
  switch (scene.type) {
    case 'array':
      return <ArrayScene s={scene} />
    case 'grid':
      return <GridScene s={scene} />
    case 'hashmap':
      return <HashmapScene s={scene} />
    case 'sets':
      return <SetsScene s={scene} />
    case 'plot':
      return <PlotScene s={scene} />
    case 'vectors':
      return <VectorsScene s={scene} />
    case 'numberline':
      return <NumberlineScene s={scene} />
    case 'tree':
      return <TreeScene s={scene} />
    case 'graph':
      return <GraphScene s={scene} />
  }
}

function Name({ children }: { children: string }) {
  if (!children) return null
  return <div className="mb-1.5 font-mono text-[12px] font-medium text-zinc-600 dark:text-zinc-300">{children}</div>
}

const CELL =
  'relative flex items-center justify-center rounded-md border font-mono text-[13px] tabular-nums transition-colors duration-300'
const CELL_PLAIN = 'border-zinc-300 bg-white/80 text-zinc-800 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100'
const CELL_HOT = 'border-amber-400 bg-amber-100 text-zinc-950 dark:bg-amber-400/25 dark:text-amber-100'

/** A value that pops in whenever it changes. */
function Value({ v }: { v: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={v} {...DROP} transition={SPRING}>
        {v}
      </motion.span>
    </AnimatePresence>
  )
}

// ---------- array ----------

function ArrayScene({ s }: { s: Of<'array'> }) {
  const hot = new Set(s.highlight)
  const size = s.items.length > 12 ? 26 : 34
  return (
    <div>
      <Name>{s.name}</Name>
      <div className="flex flex-wrap gap-1 pt-5">
        {s.items.map((v, i) => {
          const pointers = s.pointers.filter((p) => p.index === i)
          return (
            <div key={i} className="relative flex flex-col items-center">
              {pointers.length > 0 && (
                <motion.div
                  layoutId={`ptr-${pointers[0].name}`}
                  transition={SPRING}
                  className="absolute -top-5 whitespace-nowrap font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-300"
                >
                  {pointers.map((p) => p.name).join(',')} ↓
                </motion.div>
              )}
              <motion.div
                layout
                animate={{ scale: hot.has(i) ? 1.08 : 1 }}
                transition={SPRING}
                className={cx(CELL, hot.has(i) ? CELL_HOT : CELL_PLAIN)}
                style={{ width: size, height: size }}
              >
                <Value v={v} />
              </motion.div>
              <span className="mt-0.5 font-mono text-[9px] text-zinc-400">{i}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- grid ----------

function GridScene({ s }: { s: Of<'grid'> }) {
  const rows = s.cells.length
  const cols = Math.max(1, ...s.cells.map((r) => r.length))
  const hot = new Set(s.highlight.map((h) => `${h.r},${h.c}`))
  const size = Math.max(18, Math.min(34, Math.floor(340 / cols)))
  const box = s.boxSize > 1 ? s.boxSize : 0
  const edge = (i: number, n: number): boolean => box > 0 && (i + 1) % box === 0 && i < n - 1

  return (
    <div>
      <Name>{s.name}</Name>
      <div
        className="inline-grid rounded-md border-2 border-zinc-500 dark:border-zinc-400"
        style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}
      >
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const v = s.cells[r]?.[c] ?? ''
            const isHot = hot.has(`${r},${c}`)
            return (
              <div
                key={`${r},${c}`}
                className={cx(
                  'relative flex items-center justify-center border-zinc-300 font-mono text-[12.5px] dark:border-white/15',
                  c < cols - 1 && (edge(c, cols) ? 'border-r-2 border-r-zinc-500 dark:border-r-zinc-400' : 'border-r'),
                  r < rows - 1 && (edge(r, rows) ? 'border-b-2 border-b-zinc-500 dark:border-b-zinc-400' : 'border-b')
                )}
                style={{ width: size, height: size }}
              >
                <AnimatePresence>
                  {isHot && (
                    <motion.div
                      className="absolute inset-0 bg-amber-300/70 dark:bg-amber-400/40"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0.55, 1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.9 }}
                    />
                  )}
                </AnimatePresence>
                <span className="relative text-zinc-800 dark:text-zinc-100">
                  <Value v={v} />
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---------- hashmap ----------

function HashmapScene({ s }: { s: Of<'hashmap'> }) {
  const hot = new Set(s.highlight)
  return (
    <div>
      <Name>{s.name}</Name>
      <div className="inline-flex min-w-40 flex-col gap-1">
        <AnimatePresence initial={false}>
          {s.entries.map((e) => (
            <motion.div
              key={e.key}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
              className={cx('flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-[12.5px]', hot.has(e.key) ? CELL_HOT : CELL_PLAIN)}
            >
              <span className="font-semibold">{e.key}</span>
              <span className="text-zinc-400">→</span>
              <span>
                <Value v={e.value} />
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {s.entries.length === 0 && <div className="font-mono text-xs text-zinc-400">{'{ }'} empty</div>}
      </div>
    </div>
  )
}

// ---------- sets (bins) ----------

function SetsScene({ s }: { s: Of<'sets'> }) {
  const cols = s.bins.length > 4 ? 3 : Math.max(1, s.bins.length)
  return (
    <div>
      <Name>{s.name}</Name>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {s.bins.map((bin, i) => {
          const flashing = s.flash === i
          const seen = new Set<string>()
          return (
            <motion.div
              key={i}
              className={cx(
                'min-h-[3.25rem] rounded-lg border px-1.5 py-1',
                flashing ? 'border-rose-500 bg-rose-100 dark:bg-rose-500/20' : 'border-zinc-300 bg-white/70 dark:border-white/15 dark:bg-white/5'
              )}
              animate={flashing ? { scale: [1, 1.06, 1, 1.06, 1], x: [0, -3, 3, -2, 0] } : { scale: 1, x: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className={cx('mb-0.5 truncate font-mono text-[10px]', flashing ? 'font-semibold text-rose-600 dark:text-rose-300' : 'text-zinc-500 dark:text-zinc-400')}>
                {bin.label}
              </div>
              <div className="flex flex-wrap gap-0.5">
                <AnimatePresence initial={false}>
                  {bin.items.map((item, j) => {
                    const repeat = seen.has(item)
                    seen.add(item)
                    return (
                      <motion.span
                        key={`${j}:${item}`}
                        {...DROP}
                        transition={SPRING}
                        className={cx(
                          'rounded px-1 font-mono text-[11.5px] leading-[1.15rem]',
                          repeat ? 'bg-rose-500 font-bold text-white' : 'bg-amber-100 text-zinc-900 dark:bg-amber-400/25 dark:text-amber-50'
                        )}
                      >
                        {item}
                      </motion.span>
                    )
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- SVG helpers ----------

const STROKE = 'stroke-zinc-500 dark:stroke-zinc-400'
const LABEL = 'fill-zinc-700 text-[11px] dark:fill-zinc-200'

function Arrowhead({ id, className }: { id: string; className: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" className={className} />
    </marker>
  )
}

// ---------- plot ----------

function PlotScene({ s }: { s: Of<'plot'> }) {
  const W = 360
  const H = 220
  const xr = s.xMax - s.xMin || 1
  const yr = s.yMax - s.yMin || 1
  const X = (x: number): number => ((x - s.xMin) / xr) * W
  const Y = (y: number): number => H - ((y - s.yMin) / yr) * H

  const fns = useMemo(() => s.functions.map((f) => ({ ...f, fn: safeCompile(f.expr) })), [s.functions])
  const shadeFn = useMemo(() => (s.shade.expr ? safeCompile(s.shade.expr) : null), [s.shade.expr])

  const sample = (fn: EvalFunction, from: number, to: number): [number, number][] => {
    const out: [number, number][] = []
    for (let i = 0; i <= 160; i++) {
      const x = from + ((to - from) * i) / 160
      const y = evalAt(fn, x)
      if (y !== null) out.push([x, Math.max(s.yMin - yr, Math.min(s.yMax + yr, y))])
    }
    return out
  }
  const path = (pts: [number, number][]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('')
  const colors = ['stroke-amber-500', 'stroke-sky-500', 'stroke-emerald-500', 'stroke-violet-500']

  let shadePath = ''
  if (shadeFn) {
    const pts = sample(shadeFn, Math.max(s.xMin, s.shade.from), Math.min(s.xMax, s.shade.to))
    if (pts.length) shadePath = `${path(pts)}L${X(pts.at(-1)![0])} ${Y(0)}L${X(pts[0][0])} ${Y(0)}Z`
  }

  return (
    <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="w-full max-w-[380px] overflow-visible">
      <rect x={0} y={0} width={W} height={H} className="fill-white/60 dark:fill-white/5" rx={6} />
      {s.yMin <= 0 && s.yMax >= 0 && <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className={STROKE} strokeWidth={1} />}
      {s.xMin <= 0 && s.xMax >= 0 && <line y1={0} y2={H} x1={X(0)} x2={X(0)} className={STROKE} strokeWidth={1} />}
      {shadePath && (
        <motion.path d={shadePath} className="fill-amber-400/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
      )}
      {fns.map(
        (f, i) =>
          f.fn && (
            <motion.path
              key={`${i}:${f.expr}`}
              d={path(sample(f.fn, s.xMin, s.xMax))}
              className={colors[i % colors.length]}
              fill="none"
              strokeWidth={2.2}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />
          )
      )}
      {fns.map((f, i) => f.label && (
        <text key={`l${i}`} x={W - 4} y={14 + i * 14} textAnchor="end" className={LABEL}>
          {f.label}
        </text>
      ))}
      <AnimatePresence>
        {s.points.map((p) => (
          <motion.g key={`${p.x},${p.y},${p.label}`} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={4.5} className="fill-rose-500" />
            {p.label && (
              <text x={X(p.x) + 7} y={Y(p.y) - 7} className={LABEL}>
                {p.label}
              </text>
            )}
          </motion.g>
        ))}
      </AnimatePresence>
      <text x={0} y={H + 4} dy="0.9em" className="fill-zinc-400 text-[9px]">{s.xMin}</text>
      <text x={W} y={H + 4} dy="0.9em" textAnchor="end" className="fill-zinc-400 text-[9px]">{s.xMax}</text>
    </svg>
  )
}

function safeCompile(expr: string): EvalFunction | null {
  try {
    return compile(expr)
  } catch {
    return null
  }
}

function evalAt(fn: EvalFunction, x: number): number | null {
  try {
    const y = fn.evaluate({ x })
    return typeof y === 'number' && Number.isFinite(y) ? y : null
  } catch {
    return null
  }
}

// ---------- vectors (free-body diagrams) ----------

function VectorsScene({ s }: { s: Of<'vectors'> }) {
  const W = 300
  const H = 220
  const cx0 = W / 2
  const cy0 = H / 2
  const max = Math.max(1, ...s.vectors.map((v) => Math.hypot(v.x, v.y)))
  const k = 85 / max
  const ramp = s.surfaceAngleDeg >= 0
  const angle = (Math.max(0, s.surfaceAngleDeg) * Math.PI) / 180
  // Middle of the block's bottom edge, after rotating the block with the surface.
  const contact = { x: cx0 + 12 * Math.sin(angle), y: cy0 + 12 * Math.cos(angle) }
  const colors = ['stroke-amber-500', 'stroke-sky-500', 'stroke-emerald-500', 'stroke-violet-500', 'stroke-rose-500']
  const fills = ['fill-amber-500', 'fill-sky-500', 'fill-emerald-500', 'fill-violet-500', 'fill-rose-500']

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px]">
      <defs>
        {fills.map((f, i) => (
          <Arrowhead key={f} id={`vec-${i}`} className={f} />
        ))}
      </defs>
      {ramp && (
        <motion.line
          x1={contact.x - 140 * Math.cos(angle)}
          y1={contact.y + 140 * Math.sin(angle)}
          x2={contact.x + 140 * Math.cos(angle)}
          y2={contact.y - 140 * Math.sin(angle)}
          className={STROKE}
          strokeWidth={2}
          strokeDasharray="5 4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      {/* The block sits on the surface: rotated with it, its bottom edge touching it. */}
      <rect
        x={cx0 - 12}
        y={cy0 - 12}
        width={24}
        height={24}
        rx={3}
        className="fill-zinc-300 dark:fill-zinc-600"
        transform={ramp ? `rotate(${-s.surfaceAngleDeg} ${cx0} ${cy0})` : undefined}
      />
      {s.vectors.map((v, i) => {
        const x2 = cx0 + v.x * k
        const y2 = cy0 - v.y * k
        return (
          <g key={`${i}:${v.label}`}>
            <motion.line
              x1={cx0}
              y1={cy0}
              initial={{ x2: cx0, y2: cy0 }}
              animate={{ x2, y2 }}
              transition={SPRING}
              className={colors[i % colors.length]}
              strokeWidth={2.5}
              markerEnd={`url(#vec-${i % fills.length})`}
            />
            <motion.text
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: x2 + (v.x >= 0 ? 6 : -6), y: y2 + (v.y >= 0 ? -6 : 14) }}
              textAnchor={v.x >= 0 ? 'start' : 'end'}
              className={LABEL}
            >
              {v.label}
            </motion.text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------- number line ----------

function NumberlineScene({ s }: { s: Of<'numberline'> }) {
  const W = 360
  const span = s.max - s.min || 1
  const X = (x: number): number => 14 + ((x - s.min) / span) * (W - 28)
  return (
    <svg viewBox={`0 0 ${W} 70`} className="w-full max-w-[380px]">
      <line x1={8} x2={W - 8} y1={40} y2={40} className={STROKE} strokeWidth={1.5} />
      {[s.min, s.max].map((v) => (
        <g key={v}>
          <line x1={X(v)} x2={X(v)} y1={35} y2={45} className={STROKE} />
          <text x={X(v)} y={60} textAnchor="middle" className="fill-zinc-400 text-[10px]">
            {v}
          </text>
        </g>
      ))}
      {s.marks.map((m, i) => (
        <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1, x: X(m.x) }} transition={SPRING}>
          <circle cx={0} cy={40} r={5} className="fill-amber-500" />
          <text x={0} y={24} textAnchor="middle" className={LABEL}>
            {m.label || m.x}
          </text>
        </motion.g>
      ))}
    </svg>
  )
}

// ---------- tree ----------

function TreeScene({ s }: { s: Of<'tree'> }) {
  const hot = new Set(s.highlight)
  const pos = useMemo(() => layoutTree(s.nodes), [s.nodes])
  const W = 360
  const levels = Math.max(1, ...[...pos.values()].map((p) => p.depth + 1))
  const H = Math.max(80, levels * 56)
  const P = (id: string): { x: number; y: number } => {
    const p = pos.get(id)!
    return { x: 20 + p.x * (W - 40), y: 22 + p.depth * 56 }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[380px]">
      {s.nodes.map((n) =>
        n.parent && pos.has(n.parent) ? (
          <line key={`e-${n.id}`} x1={P(n.parent).x} y1={P(n.parent).y} x2={P(n.id).x} y2={P(n.id).y} className={STROKE} strokeWidth={1.5} />
        ) : null
      )}
      <AnimatePresence initial={false}>
        {s.nodes.map((n) => (
          <motion.g key={n.id} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1, x: P(n.id).x, y: P(n.id).y }} exit={{ opacity: 0 }} transition={SPRING}>
            <circle r={15} className={hot.has(n.id) ? 'fill-amber-300 stroke-amber-500' : 'fill-white stroke-zinc-400 dark:fill-zinc-800'} strokeWidth={1.5} />
            <text textAnchor="middle" dy="0.35em" className="fill-zinc-800 font-mono text-[11px] dark:fill-zinc-100">
              {n.label}
            </text>
          </motion.g>
        ))}
      </AnimatePresence>
    </svg>
  )
}

/** x in 0..1 (leaves spread evenly, parents centered over their children), depth from the root. */
function layoutTree(nodes: Of<'tree'>['nodes']): Map<string, { x: number; depth: number }> {
  const ids = new Set(nodes.map((n) => n.id))
  const kids = new Map<string, string[]>()
  const roots: string[] = []
  for (const n of nodes) {
    if (n.parent && ids.has(n.parent)) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.id])
    else roots.push(n.id)
  }
  const out = new Map<string, { x: number; depth: number }>()
  let leaf = 0
  const visit = (id: string, depth: number): number => {
    const children = kids.get(id) ?? []
    let x: number
    if (!children.length || out.has(id)) x = leaf++
    else {
      out.set(id, { x: 0, depth }) // guards against cycles
      const xs = children.map((c) => visit(c, depth + 1))
      x = (Math.min(...xs) + Math.max(...xs)) / 2
    }
    out.set(id, { x, depth })
    return x
  }
  roots.forEach((r) => visit(r, 0))
  const span = Math.max(1, leaf - 1)
  for (const [id, p] of out) out.set(id, { ...p, x: leaf <= 1 ? 0.5 : p.x / span })
  return out
}

// ---------- graph ----------

function GraphScene({ s }: { s: Of<'graph'> }) {
  const W = 320
  const H = 240
  const R = 88
  const pos = new Map(
    s.nodes.map((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, s.nodes.length) - Math.PI / 2
      return [n.id, { x: W / 2 + R * Math.cos(a), y: H / 2 + R * Math.sin(a) }] as const
    })
  )
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[340px]">
      <defs>
        <Arrowhead id="graph-arrow" className="fill-zinc-500 dark:fill-zinc-400" />
      </defs>
      <AnimatePresence initial={false}>
        {s.edges.map((e) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          if (!a || !b) return null
          // Stop short of the node circles so arrowheads stay visible.
          const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const ux = (b.x - a.x) / d
          const uy = (b.y - a.y) / d
          return (
            <motion.g key={`${e.from}>${e.to}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.line
                x1={a.x + ux * 16}
                y1={a.y + uy * 16}
                x2={b.x - ux * 18}
                y2={b.y - uy * 18}
                className={STROKE}
                strokeWidth={1.5}
                markerEnd={s.directed ? 'url(#graph-arrow)' : undefined}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
              />
              {e.label && (
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" className={LABEL}>
                  {e.label}
                </text>
              )}
            </motion.g>
          )
        })}
      </AnimatePresence>
      {s.nodes.map((n) => {
        const p = pos.get(n.id)!
        return (
          <g key={n.id} transform={`translate(${p.x} ${p.y})`}>
            <circle r={15} className="fill-white stroke-zinc-400 dark:fill-zinc-800" strokeWidth={1.5} />
            <text textAnchor="middle" dy="0.35em" className="fill-zinc-800 font-mono text-[11px] dark:fill-zinc-100">
              {n.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
