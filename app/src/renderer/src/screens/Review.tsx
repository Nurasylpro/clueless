// Flashcards (spaced repetition) and the gap map across all sessions.
import { useEffect, useState } from 'react'
import type { CardRating, GapRecord, MemoryView, Subject } from '../../../shared/contracts'
import { api } from '../api'
import { BackIcon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { Button, cx, IconButton } from '../components/ui'

const GAP_STYLE: Record<GapRecord['type'], [string, string]> = {
  recall_slip: ['Recall', 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300'],
  concept_gap: ['Concept', 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'],
  strategy_gap: ['Strategy', 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'],
  careless_slip: ['Careless', 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300']
}

export function ReviewScreen({ onBack, onChange }: { onBack: () => void; onChange: (m: MemoryView) => void }) {
  const [memory, setMemory] = useState<MemoryView | null>(null)
  const [tab, setTab] = useState<'cards' | 'gaps'>('cards')

  useEffect(() => {
    void api.getMemory().then((m) => {
      setMemory(m)
      onChange(m)
    })
  }, [onChange])

  const rate = async (id: string, rating: CardRating): Promise<void> => {
    const m = await api.rateCard(id, rating)
    setMemory(m)
    onChange(m)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-900/10 px-3 py-2 dark:border-white/10">
        <IconButton title="Back" onClick={onBack}>
          <BackIcon size={15} />
        </IconButton>
        {(['cards', 'gaps'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              'no-drag rounded-full px-2.5 py-1 text-xs transition-colors',
              tab === t
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10'
            )}
          >
            {t === 'cards' ? `Flashcards${memory ? ` (${memory.dueCards.length} due)` : ''}` : 'Gap map'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!memory ? null : tab === 'cards' ? <Cards memory={memory} onRate={rate} /> : <GapMap gaps={memory.gaps} />}
      </div>
    </div>
  )
}

function Cards({ memory, onRate }: { memory: MemoryView; onRate: (id: string, r: CardRating) => void }) {
  const [shown, setShown] = useState(false)
  const card = memory.dueCards[0]
  useEffect(() => setShown(false), [card?.id])

  if (!card) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {memory.totalCards === 0
          ? 'No flashcards yet. Finish a problem to get some.'
          : `All caught up. ${memory.totalCards} card${memory.totalCards === 1 ? '' : 's'} scheduled for later.`}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-900/10 bg-white/70 p-4 dark:border-white/10 dark:bg-black/35">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-400">
          {card.subject} · {card.topic}
        </div>
        <div className="text-zinc-900 dark:text-zinc-50">
          <Markdown text={card.front} />
        </div>
        {shown && (
          <div className="mt-3 border-t border-zinc-900/10 pt-3 text-zinc-700 dark:border-white/10 dark:text-zinc-200">
            <Markdown text={card.back} />
          </div>
        )}
      </div>
      {!shown ? (
        <Button variant="primary" className="w-full" onClick={() => setShown(true)}>
          Show answer
        </Button>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              [1, 'Again'],
              [2, 'Hard'],
              [3, 'Good'],
              [4, 'Easy']
            ] as const
          ).map(([r, label]) => (
            <Button key={r} variant={r === 3 ? 'primary' : 'secondary'} onClick={() => onRate(card.id, r)}>
              {label}
            </Button>
          ))}
        </div>
      )}
      <div className="text-center text-xs text-zinc-400">{memory.dueCards.length - 1} more due after this one</div>
    </div>
  )
}

function GapMap({ gaps }: { gaps: GapRecord[] }) {
  if (gaps.length === 0) {
    return <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">No gaps recorded yet.</div>
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
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(g.timesSeen / max) * 100}%` }} />
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
