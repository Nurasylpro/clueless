// The gap map: what you keep getting stuck on, across all sessions.
import { useEffect, useState } from 'react'
import type { GapRecord, MemoryView, Subject } from '../../../shared/contracts'
import { api } from '../api'
import { BackIcon } from '../components/icons'
import { cx, IconButton } from '../components/ui'

const GAP_STYLE: Record<GapRecord['type'], [string, string]> = {
  recall_slip: ['Recall', 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300'],
  concept_gap: ['Concept', 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'],
  strategy_gap: ['Strategy', 'bg-claude-100 text-claude-800 dark:bg-claude-600/15 dark:text-claude-400'],
  careless_slip: ['Careless', 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300']
}

export function GapsScreen({ onBack }: { onBack: () => void }) {
  const [memory, setMemory] = useState<MemoryView | null>(null)

  useEffect(() => {
    void api.getMemory().then(setMemory)
  }, [])

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-900/10 px-3 py-2 dark:border-white/10">
        <IconButton title="Back" onClick={onBack}>
          <BackIcon size={15} />
        </IconButton>
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Your gaps</span>
        {memory && memory.sessions > 0 && (
          <span className="ml-auto text-xs text-zinc-400">
            from {memory.sessions} session{memory.sessions === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto px-3 py-3">{memory && <GapMap gaps={memory.gaps} />}</div>
    </div>
  )
}

function GapMap({ gaps }: { gaps: GapRecord[] }) {
  if (gaps.length === 0) {
    return <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">No gaps yet. They show up here after you finish a problem.</div>
  }
  const bySubject = new Map<Subject, GapRecord[]>()
  for (const g of gaps) bySubject.set(g.subject, [...(bySubject.get(g.subject) ?? []), g])
  const max = Math.max(...gaps.map((g) => g.timesSeen))

  return (
    <div className="space-y-4">
      {[...bySubject].map(([subject, list]) => (
        <div key={subject}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{subject}</div>
          <ul className="space-y-1.5">
            {list.map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-[13px]">
                <span className={cx('w-16 shrink-0 rounded-full px-1.5 py-px text-center text-[10px] font-medium', GAP_STYLE[g.type][1])}>
                  {GAP_STYLE[g.type][0]}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100" title={g.topic}>
                  {g.topic}
                </span>
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                  <span className="block h-full rounded-full bg-claude-500" style={{ width: `${(g.timesSeen / max) * 100}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right text-xs text-zinc-500">×{g.timesSeen}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
