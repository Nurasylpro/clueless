// ┌──────────────────────────────────────────────────────────────────────────────┐
// │ VISUALIZATION: owned by the visual-engine teammate.                          │
// │                                                                              │
// │ The tutor already sends `visual` on turns where a picture helps. Its shape   │
// │ is `Visual` / `Scene` in src/shared/schema.ts:                               │
// │   array, grid, hashmap, sets, plot, vectors, numberline, tree, graph         │
// │ `frames` is a list of scenes to step through (1 frame = a still picture).    │
// │ Empty values are "" (labels), -1 (flash, boxSize, surfaceAngleDeg), [].     │
// │                                                                              │
// │ Replace this placeholder with real drawings (SVG + Motion for data          │
// │ structures, Mafs for plots and vectors). Run `npm run ui` to work on it in a │
// │ browser with mock data: mock/fixtures.ts has a "sets" and a "grid" example.  │
// └──────────────────────────────────────────────────────────────────────────────┘
import type { Visual } from '../../../shared/contracts'
import { ChartIcon } from './icons'

export function VisualSlot({ visual }: { visual: Visual }) {
  const kinds = [...new Set(visual.frames.map((f) => f.type))].join(', ')
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-2.5 py-2 text-xs text-zinc-500 dark:border-white/15 dark:text-zinc-400">
      <ChartIcon size={14} />
      <span className="min-w-0 flex-1 truncate">
        {visual.caption || 'Visual'} · {kinds} · {visual.frames.length} frame{visual.frames.length === 1 ? '' : 's'}
      </span>
      <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-px text-[10px] uppercase tracking-wide dark:bg-white/10">
        coming soon
      </span>
    </div>
  )
}
