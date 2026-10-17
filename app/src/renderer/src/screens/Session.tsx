// The problem session: problem bar, plan, conversation, quick actions and the answer box.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  CheckResult,
  InputKind,
  PlanStep,
  ProblemView,
  RecapView,
  SessionView,
  Subject,
  ThreadItem,
  TurnView
} from '../../../shared/contracts'
import { api } from '../api'
import {
  BackIcon,
  BulbIcon,
  CheckIcon,
  EyeIcon,
  FlagIcon,
  LockIcon,
  NextIcon,
  PlusIcon,
  RetryIcon,
  SendIcon
} from '../components/icons'
import { Markdown, MathText, mathToHtml } from '../components/Markdown'
import { MicButton } from '../components/MicButton'
import { Button, cx, IconButton } from '../components/ui'
import { VisualSlot } from '../components/VisualSlot'

type ComposerMode = 'answer' | 'recall'

export function SessionScreen({ session, onOpenReview }: { session: SessionView; onOpenReview: () => void }) {
  const [mode, setMode] = useState<ComposerMode>('answer')
  const ready = Boolean(session.problem) && !session.busy

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {session.problem && <ProblemBar problem={session.problem} />}
      {session.plan.length > 0 && <PlanList plan={session.plan} />}
      <Thread session={session} onOpenReview={onOpenReview} />
      {session.stuck.level === 2 && !session.busy && !session.recap && (
        <StuckBubble reason={session.stuck.reason} onRecall={() => setMode('recall')} />
      )}
      {session.error && <ErrorBox message={session.error} canRetry={Boolean(session.problem) || !session.busy} />}
      {session.problem && !session.recap && <QuickActions session={session} disabled={!ready} />}
      {session.problem && <Composer session={session} mode={mode} setMode={setMode} disabled={!ready} />}
    </div>
  )
}

// ---------- problem + plan ----------

const SUBJECTS: Subject[] = ['coding', 'math', 'physics', 'other']

function ProblemBar({ problem }: { problem: ProblemView }) {
  return (
    <div className="flex items-start gap-2 border-b border-zinc-900/10 px-3 py-2.5 dark:border-white/10">
      <select
        value={problem.subject}
        onChange={(e) => api.setSubject(e.target.value as Subject)}
        title="Wrong subject? Change it"
        className="no-drag mt-0.5 h-6 shrink-0 cursor-pointer rounded-md border-0 bg-amber-100 px-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-900 outline-none dark:bg-amber-400/15 dark:text-amber-300"
      >
        {SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{problem.title}</div>
        <div className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{problem.summary}</div>
      </div>
      <IconButton title="New problem" onClick={() => api.action('new')}>
        <PlusIcon size={15} />
      </IconButton>
    </div>
  )
}

function PlanList({ plan }: { plan: PlanStep[] }) {
  const [open, setOpen] = useState(false)
  const current = plan.findIndex((s) => s.status === 'current')
  const done = plan.filter((s) => s.status === 'done').length
  const shown = open ? plan : plan.filter((s) => s.status === 'current')

  return (
    <div className="border-b border-zinc-900/10 px-3 py-2 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="no-drag mb-1 flex w-full items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400"
      >
        <span>Plan</span>
        <span className="flex flex-1 gap-0.5">
          {plan.map((s) => (
            <span
              key={s.id}
              className={cx(
                'h-1 flex-1 rounded-full',
                s.status === 'done' ? 'bg-emerald-500' : s.status === 'current' ? 'bg-amber-400' : 'bg-zinc-200 dark:bg-zinc-700'
              )}
            />
          ))}
        </span>
        <span className="normal-case tracking-normal">
          {current >= 0 ? `step ${current + 1} of ${plan.length}` : `${done} of ${plan.length} done`} · {open ? 'hide' : 'all'}
        </span>
      </button>
      <ol className="space-y-0.5">
        {shown.map((s) => (
          <li
            key={s.id}
            className={cx(
              'flex items-start gap-2 text-[13px]',
              s.status === 'current' && 'font-medium text-zinc-900 dark:text-zinc-50',
              s.status === 'done' && 'text-zinc-400 line-through decoration-zinc-300 dark:decoration-zinc-600',
              s.status === 'locked' && 'text-zinc-400 dark:text-zinc-500'
            )}
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {s.status === 'done' ? (
                <CheckIcon size={13} className="text-emerald-500" />
              ) : s.status === 'locked' ? (
                <LockIcon size={11} />
              ) : (
                <span className="h-2 w-2 rounded-full bg-amber-400" />
              )}
            </span>
            {s.text}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------- conversation ----------

function Thread({ session, onOpenReview }: { session: SessionView; onOpenReview: () => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [session.thread.length, session.busy, session.recap])

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {session.thread.map((item) => (
        <div key={item.id}>
          <ThreadRow item={item} />
          {session.recap && session.recap.afterItemId === item.id && (
            <RecapCard recap={session.recap} onOpenReview={onOpenReview} />
          )}
        </div>
      ))}
      {session.busy && <BusyRow label={session.busy} />}
      <div ref={end} />
    </div>
  )
}

function ThreadRow({ item }: { item: ThreadItem }) {
  if (item.role === 'tutor') return <TutorBubble turn={item.turn} />
  if (item.role === 'student') return <StudentBubble text={item.text} as={item.as} check={item.check} />
  return <div className="text-center text-xs text-zinc-400">{item.text}</div>
}

const KIND_LABEL: Partial<Record<TurnView['kind'], string>> = {
  hint: 'Hint',
  recall_card: 'Quick syntax',
  side_lesson: 'Side lesson',
  solved: 'Solved'
}

const GAP_LABEL = {
  recall_slip: 'Recall slip',
  concept_gap: 'Concept gap',
  strategy_gap: 'Strategy gap',
  careless_slip: 'Careless slip'
} as const

function TutorBubble({ turn }: { turn: TurnView }) {
  const label = KIND_LABEL[turn.kind]
  const tone =
    turn.kind === 'recall_card'
      ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/40'
      : turn.kind === 'side_lesson'
        ? 'border-violet-200 bg-violet-50/70 dark:border-violet-900 dark:bg-violet-950/40'
        : turn.kind === 'solved'
          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40'
          : 'border-zinc-900/10 bg-white/70 dark:border-white/10 dark:bg-black/35'

  return (
    <div className="flex gap-2">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-zinc-950">
        ?
      </div>
      <div className={cx('min-w-0 flex-1 rounded-xl rounded-tl-sm border px-3 py-2 text-zinc-800 dark:text-zinc-100', tone)}>
        {(label || turn.hintLevel > 0 || turn.gap || turn.verdict !== 'none') && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Verdict verdict={turn.verdict} />
            {label && <span className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>}
            {turn.hintLevel > 0 && <HintDots level={turn.hintLevel} />}
            {turn.gap && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-px text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {GAP_LABEL[turn.gap.type]} · {turn.gap.topic}
              </span>
            )}
          </div>
        )}
        <Markdown text={turn.message} />
        {turn.visual && turn.visual.frames.length > 0 && <VisualSlot visual={turn.visual} />}
      </div>
    </div>
  )
}

function Verdict({ verdict }: { verdict: TurnView['verdict'] }) {
  if (verdict === 'none') return null
  const map = {
    correct: ['Correct', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'],
    partial: ['Partly', 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'],
    incorrect: ['Not quite', 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300']
  } as const
  const [text, cls] = map[verdict]
  return <span className={cx('rounded-full px-1.5 py-px font-medium', cls)}>{text}</span>
}

function HintDots({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" title={`Hint level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cx('h-1.5 w-1.5 rounded-full', n <= level ? 'bg-amber-400' : 'bg-zinc-200 dark:bg-zinc-700')} />
      ))}
    </span>
  )
}

const CHECK_LABEL: Record<CheckResult['status'], [string, string]> = {
  match: ['Math engine: matches', 'text-emerald-600 dark:text-emerald-400'],
  mismatch: ["Math engine: doesn't match", 'text-rose-600 dark:text-rose-400'],
  missing_units: ['Math engine: add units', 'text-amber-600 dark:text-amber-400'],
  wrong_units: ["Math engine: units don't match", 'text-rose-600 dark:text-rose-400'],
  unparseable: ["Math engine: couldn't read this as math", 'text-zinc-400']
}

function StudentBubble({ text, as, check }: { text: string; as: InputKind; check: CheckResult | null }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-zinc-900 px-3 py-2 text-[13.5px] text-white dark:bg-zinc-100 dark:text-zinc-900">
        {as === 'recall' && <div className="mb-0.5 text-[11px] uppercase tracking-wide opacity-60">How do I write…</div>}
        {as === 'code' ? (
          <pre className="selectable whitespace-pre-wrap font-mono text-[12.5px]">{text}</pre>
        ) : as === 'math' && mathToHtml(text) ? (
          <MathText input={text} className="selectable" />
        ) : (
          <span className="selectable whitespace-pre-wrap">{text}</span>
        )}
      </div>
      {check && <div className={cx('mt-1 text-[11px]', CHECK_LABEL[check.status][1])}>{CHECK_LABEL[check.status][0]}</div>}
    </div>
  )
}

function BusyRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pl-8 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="flex gap-0.5">
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
      </span>
      {label}
    </div>
  )
}

function RecapCard({ recap, onOpenReview }: { recap: RecapView; onOpenReview: () => void }) {
  return (
    <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-[13px] text-zinc-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-zinc-100">
      <div className="mb-2 flex items-center gap-2">
        <FlagIcon size={14} className="text-amber-500" />
        <span className="font-semibold">Recap</span>
        <span className="ml-auto text-xs text-zinc-500">
          {recap.solved ? 'Solved' : 'Not solved yet'} · {recap.attempts} answers · {recap.hintsUsed} hints
          {recap.revealed ? ' · revealed' : ''}
        </span>
      </div>
      <div className="mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Explain it back</div>
        <div className="selectable">{recap.explainBack}</div>
        <div className="text-xs text-zinc-500">Answer in the box below.</div>
      </div>
      {recap.gaps.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Gaps found</div>
          <div className="flex flex-wrap gap-1">
            {recap.gaps.map((g, i) => (
              <span key={i} className="rounded-full bg-white/70 px-2 py-px text-xs ring-1 ring-zinc-200 dark:bg-black/35 dark:ring-zinc-700">
                {GAP_LABEL[g.type]} · {g.topic}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {recap.cardsAdded > 0 && (
          <Button variant="chip" onClick={onOpenReview}>
            {recap.cardsAdded} new flashcard{recap.cardsAdded === 1 ? '' : 's'}
          </Button>
        )}
        {recap.similarProblem && (
          <Button variant="chip" onClick={() => api.askText(recap.similarProblem!)} title={recap.similarProblem}>
            Try a similar one
          </Button>
        )}
        <Button variant="chip" onClick={() => api.action('new')}>
          New problem
        </Button>
      </div>
      {recap.similarProblem && <div className="mt-2 text-xs text-zinc-500">Similar: {recap.similarProblem}</div>}
    </div>
  )
}

// ---------- stuck, errors, actions ----------

function StuckBubble({ reason, onRecall }: { reason: string | null; onRecall: () => void }) {
  return (
    <div className="mx-3 mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-zinc-800 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-zinc-100">
      <div className="mb-1.5">
        <span className="font-semibold">Stuck?</span>
        {reason && <span className="text-zinc-500 dark:text-zinc-400"> Looks like {reason}.</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="chip" onClick={onRecall}>
          How do I write…
        </Button>
        <Button variant="chip" onClick={() => api.action('next')}>
          What next?
        </Button>
        <Button variant="chip" onClick={() => api.action('im_fine')}>
          I'm fine
        </Button>
      </div>
    </div>
  )
}

function ErrorBox({ message, canRetry }: { message: string; canRetry: boolean }) {
  return (
    <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
      <span className="min-w-0 flex-1">{message}</span>
      {canRetry && (
        <Button variant="chip" onClick={() => api.action('retry')}>
          <RetryIcon size={12} /> Retry
        </Button>
      )}
    </div>
  )
}

function QuickActions({ session, disabled }: { session: SessionView; disabled: boolean }) {
  return (
    <div className="flex justify-between gap-0.5 border-t border-zinc-900/10 px-3 pt-2 dark:border-white/10">
      <Button variant="chip" disabled={disabled} onClick={() => api.action('hint')} title="A slightly bigger hint">
        <BulbIcon size={12} /> Hint
      </Button>
      <Button variant="chip" disabled={disabled} onClick={() => api.action('next')} title="Not sure what to do next?">
        <NextIcon size={12} /> What next?
      </Button>
      <Button variant="chip" disabled={disabled} onClick={() => api.action('check_my_work')} title="Clueless looks at your screen again">
        <CheckIcon size={12} /> Check my work
      </Button>
      <Button
        variant="chip"
        disabled={disabled || !session.revealAllowed}
        onClick={() => api.action('reveal')}
        title={session.revealAllowed ? 'Show the full solution (logged)' : `Unlocks after ${3 - Math.min(3, session.attempts)} more tries`}
      >
        {session.revealAllowed ? <EyeIcon size={12} /> : <LockIcon size={12} />} Reveal
      </Button>
      <Button
        variant="chip"
        disabled={disabled}
        onClick={() => api.action('finish')}
        className={cx(session.solved && 'border-amber-400 bg-amber-400 text-zinc-950 hover:bg-amber-300 dark:bg-amber-400 dark:text-zinc-950')}
        title="Finish and get your recap"
      >
        <FlagIcon size={12} /> Finish
      </Button>
    </div>
  )
}

// ---------- answer box ----------

function Composer({
  session,
  mode,
  setMode,
  disabled
}: {
  session: SessionView
  mode: ComposerMode
  setMode: (m: ComposerMode) => void
  disabled: boolean
}) {
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const as: InputKind =
    mode === 'recall' ? 'recall' : session.expects === 'math' ? 'math' : session.expects === 'code' ? 'code' : 'text'

  useEffect(() => {
    if (!disabled) input.current?.focus()
  }, [disabled, mode, session.thread.length])

  const submit = (value = text): void => {
    if (!value.trim() || disabled) return
    api.send({ text: value, as })
    setText('')
    setMode('answer')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Code: Enter is a newline, Cmd/Ctrl+Enter sends. Everything else: Enter sends.
    const send = as === 'code' ? e.key === 'Enter' && (e.metaKey || e.ctrlKey) : e.key === 'Enter' && !e.shiftKey
    if (send) {
      e.preventDefault()
      submit()
    }
  }

  const placeholder =
    mode === 'recall'
      ? 'What did you forget? e.g. "how to make a list of 9 sets"'
      : as === 'math'
        ? 'Type your answer, e.g. x^2 e^x - 2x e^x + 2e^x + C'
        : as === 'code'
          ? 'Paste or type code (⌘/Ctrl + Enter to send)'
          : 'Your answer or question…'

  return (
    <div className="px-3 pb-3 pt-2">
      {session.expects === 'choice' && session.choices.length > 0 && mode === 'answer' && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {session.choices.map((c) => (
            <Button key={c} variant="chip" disabled={disabled} onClick={() => submit(c)}>
              {c}
            </Button>
          ))}
        </div>
      )}
      <div className="mb-1.5 flex items-center gap-1 text-[11px]">
        {(['answer', 'recall'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cx(
              'no-drag rounded-full px-2 py-0.5 transition-colors',
              mode === m
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10'
            )}
          >
            {m === 'answer' ? 'Answer' : 'How do I write…?'}
          </button>
        ))}
        {mode === 'recall' && (
          <IconButton title="Back to answering" onClick={() => setMode('answer')} className="ml-auto h-5 w-5">
            <BackIcon size={12} />
          </IconButton>
        )}
      </div>
      <div className="flex items-end gap-1.5 rounded-xl border border-zinc-900/10 bg-white/70 px-2 py-1.5 focus-within:border-amber-400 dark:border-white/15 dark:bg-black/35">
        <textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={as === 'code' ? 4 : 2}
          disabled={disabled}
          className={cx(
            'no-drag max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent text-[13.5px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50',
            as === 'code' && 'font-mono text-[12.5px]'
          )}
        />
        <MicButton onTranscript={(t) => setText(t)} disabled={disabled} />
        <IconButton
          title="Send"
          onClick={() => submit()}
          disabled={disabled || !text.trim()}
          className="bg-amber-400 text-zinc-950 hover:bg-amber-300 hover:text-zinc-950 disabled:opacity-40 dark:text-zinc-950 dark:hover:bg-amber-300"
        >
          <SendIcon size={15} />
        </IconButton>
      </div>
      {as === 'math' && text.trim() && (
        <div className="mt-1.5 min-h-5 truncate px-1 text-sm text-zinc-700 dark:text-zinc-200">
          {mathToHtml(text) ? <MathText input={text} /> : <span className="text-xs text-zinc-400">Can't read that as math yet</span>}
        </div>
      )}
    </div>
  )
}
