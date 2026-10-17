// The problem session, kept small: problem bar, current step, ONLY the latest exchange
// (the student's last input and Clueless's last reply), quick actions and the answer box.
// The full conversation still lives in the session (for the recap and memory); it's just not shown.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  CheckResult,
  InputKind,
  PlanStep,
  ProblemView,
  RecapView,
  SessionView,
  Subject,
  TurnView
} from '../../../shared/contracts'
import { api } from '../api'
import {
  BackIcon,
  CheckIcon,
  FlagIcon,
  LockIcon,
  PlusIcon,
  RetryIcon,
  SendIcon
} from '../components/icons'
import { Markdown, MathText, mathToHtml } from '../components/Markdown'
import { MicButton, VoiceStrip } from '../components/MicButton'
import { Button, cx, IconButton } from '../components/ui'
import { VisualSlot } from '../components/VisualSlot'
import { useVoiceInput } from '../voice/useVoiceInput'

type ComposerMode = 'answer' | 'recall'

export function SessionScreen({ session, onOpenReview }: { session: SessionView; onOpenReview: () => void }) {
  const [mode, setMode] = useState<ComposerMode>('answer')
  const ready = Boolean(session.problem) && !session.busy

  return (
    <div className="session-screen flex min-h-0 flex-col">
      {session.problem && <ProblemBar problem={session.problem} />}
      {session.plan.length > 0 && <PlanList plan={session.plan} />}
      <LatestExchange session={session} onOpenReview={onOpenReview} />
      {session.stuck.level === 2 && !session.busy && !session.recap && (
        <StuckBubble reason={session.stuck.reason} onRecall={() => setMode('recall')} />
      )}
      {session.error && (
        // Without a problem there's nothing to retry: offer a way back to the start screen instead.
        <ErrorBox message={session.error} canRetry={Boolean(session.problem)} onDismiss={session.problem ? null : () => api.action('new')} />
      )}
      {session.problem && !session.recap && <QuickActions session={session} disabled={!ready} />}
      {session.problem && <Composer session={session} mode={mode} setMode={setMode} disabled={!ready} />}
    </div>
  )
}

// ---------- problem + plan ----------

const SUBJECTS: Subject[] = ['coding', 'math', 'physics', 'other']

function ProblemBar({ problem }: { problem: ProblemView }) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-900/10 px-3 py-1.5 dark:border-white/10" title={problem.summary}>
      <select
        value={problem.subject}
        onChange={(e) => api.setSubject(e.target.value as Subject)}
        title="Wrong subject? Change it"
        className="no-drag h-5 shrink-0 cursor-pointer rounded border-0 bg-claude-100 px-1 text-[10px] font-semibold uppercase tracking-wide text-claude-900 outline-none dark:bg-claude-500/15 dark:text-claude-400"
      >
        {SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">{problem.title}</div>
      <IconButton title="New problem" onClick={() => api.action('new')} className="h-6 w-6">
        <PlusIcon size={14} />
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
    <div className="border-b border-zinc-900/10 px-3 py-1.5 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="no-drag mb-0.5 flex w-full items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400"
      >
        <span>Plan</span>
        <span className="flex flex-1 gap-0.5">
          {plan.map((s) => (
            <span
              key={s.id}
              className={cx(
                'h-1 flex-1 rounded-full',
                s.status === 'done' ? 'bg-emerald-500' : s.status === 'current' ? 'bg-claude-500' : 'bg-zinc-200 dark:bg-zinc-700'
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
              'flex items-start gap-2 text-[12.5px]',
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
                <span className="h-2 w-2 rounded-full bg-claude-500" />
              )}
            </span>
            {s.text}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------- the latest exchange ----------

function findLastIndex<T>(list: T[], test: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i
  return -1
}

/** Only the student's latest input and Clueless's latest reply. */
function LatestExchange({ session, onOpenReview }: { session: SessionView; onOpenReview: () => void }) {
  const { thread } = session
  const tutorAt = findLastIndex(thread, (t) => t.role === 'tutor')
  const studentAt = findLastIndex(thread, (t) => t.role === 'student')
  // A student message waiting for its reply, or the one that the latest reply answers.
  const pending = studentAt > tutorAt
  const showStudent = studentAt >= 0 && (pending || studentAt === tutorAt - 1)
  const tutor = tutorAt >= 0 ? thread[tutorAt] : null
  const student = showStudent ? thread[studentAt] : null

  return (
    <div className="exchange space-y-2 px-3 py-2.5">
      {student && student.role === 'student' && <StudentLine text={student.text} as={student.as} check={student.check} />}
      {session.busy && <BusyRow label={session.busy} />}
      {tutor && tutor.role === 'tutor' && !pending && (
        <div className={cx('transition-opacity', session.busy && 'opacity-40')}>
          <TutorCard turn={tutor.turn} />
          {session.recap && session.recap.afterItemId === tutor.id && (
            <RecapCard recap={session.recap} onOpenReview={onOpenReview} />
          )}
        </div>
      )}
    </div>
  )
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

function TutorCard({ turn }: { turn: TurnView }) {
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
    <div className={cx('rounded-xl border px-3 py-2 text-zinc-800 dark:text-zinc-100', tone)}>
      {(label || turn.hintLevel > 0 || turn.gap || turn.verdict !== 'none') && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <Verdict verdict={turn.verdict} />
          {label && <span className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>}
          {turn.hintLevel > 0 && <HintDots level={turn.hintLevel} />}
          {turn.gap && (
            <span className="truncate rounded-full bg-zinc-100 px-1.5 py-px text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              {GAP_LABEL[turn.gap.type]} · {turn.gap.topic}
            </span>
          )}
        </div>
      )}
      <div className="msg-scroll max-h-[300px] overflow-y-auto">
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
    partial: ['Partly', 'bg-claude-100 text-claude-800 dark:bg-claude-600/15 dark:text-claude-400'],
    incorrect: ['Not quite', 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300']
  } as const
  const [text, cls] = map[verdict]
  return <span className={cx('rounded-full px-1.5 py-px font-medium', cls)}>{text}</span>
}

function HintDots({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" title={`Hint level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cx('h-1.5 w-1.5 rounded-full', n <= level ? 'bg-claude-500' : 'bg-zinc-200 dark:bg-zinc-700')} />
      ))}
    </span>
  )
}

const CHECK_LABEL: Record<CheckResult['status'], [string, string]> = {
  match: ['Math engine: matches', 'text-emerald-600 dark:text-emerald-400'],
  mismatch: ["Math engine: doesn't match", 'text-rose-600 dark:text-rose-400'],
  missing_units: ['Math engine: add units', 'text-claude-600 dark:text-claude-500'],
  wrong_units: ["Math engine: units don't match", 'text-rose-600 dark:text-rose-400'],
  unparseable: ["Math engine: couldn't read this as math", 'text-zinc-400']
}

function StudentLine({ text, as, check }: { text: string; as: InputKind; check: CheckResult | null }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px]">
      <span className="mt-px shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        {as === 'recall' ? 'Asked' : 'You'}
      </span>
      <div className="min-w-0 flex-1">
        {as === 'code' ? (
          <pre className="selectable line-clamp-3 whitespace-pre-wrap font-mono text-[11.5px] text-zinc-700 dark:text-zinc-300">{text}</pre>
        ) : as === 'math' && mathToHtml(text) ? (
          <MathText input={text} className="selectable text-zinc-700 dark:text-zinc-300" />
        ) : (
          <span className="selectable line-clamp-2 text-zinc-700 dark:text-zinc-300">{text}</span>
        )}
        {check && <div className={cx('text-[10.5px]', CHECK_LABEL[check.status][1])}>{CHECK_LABEL[check.status][0]}</div>}
      </div>
    </div>
  )
}

function BusyRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="flex gap-0.5">
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
      </span>
      {label}
    </div>
  )
}

function RecapCard({ recap, onOpenReview }: { recap: RecapView; onOpenReview: () => void }) {
  return (
    <div className="mt-2 rounded-xl border border-claude-400/70 bg-claude-50/60 p-3 text-[12.5px] text-zinc-800 dark:border-claude-600/30 dark:bg-claude-600/5 dark:text-zinc-100">
      <div className="mb-2 flex items-center gap-2">
        <FlagIcon size={14} className="text-claude-600" />
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
    <div className="mx-3 mb-2 rounded-xl border border-claude-400 bg-claude-50 px-3 py-2 text-[13px] text-zinc-800 shadow-sm dark:border-claude-600/40 dark:bg-claude-600/10 dark:text-zinc-100">
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

function ErrorBox({ message, canRetry, onDismiss }: { message: string; canRetry: boolean; onDismiss: (() => void) | null }) {
  return (
    <div className="mx-3 mb-2 mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
      <span className="min-w-0 flex-1">{message}</span>
      {canRetry && (
        <Button variant="chip" onClick={() => api.action('retry')}>
          <RetryIcon size={12} /> Retry
        </Button>
      )}
      {onDismiss && (
        <Button variant="chip" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </div>
  )
}

function QuickActions({ session, disabled }: { session: SessionView; disabled: boolean }) {
  return (
    <div className="flex justify-between gap-0.5 border-t border-zinc-900/10 px-3 pt-1.5 dark:border-white/10">
      <Button variant="chip" disabled={disabled} onClick={() => api.action('hint')} title="A slightly bigger hint">
        Hint
      </Button>
      <Button variant="chip" disabled={disabled} onClick={() => api.action('next')} title="Not sure what to do next?">
        What next?
      </Button>
      <Button variant="chip" disabled={disabled} onClick={() => api.action('check_my_work')} title="Clueless looks at your screen again">
        Check my work
      </Button>
      <Button
        variant="chip"
        disabled={disabled || !session.revealAllowed}
        onClick={() => api.action('reveal')}
        title={session.revealAllowed ? 'Show the full solution (logged)' : `Unlocks after ${3 - Math.min(3, session.attempts)} more tries`}
      >
        {!session.revealAllowed && <LockIcon size={11} />} Reveal
      </Button>
      <Button
        variant="chip"
        disabled={disabled}
        onClick={() => api.action('finish')}
        className={cx(session.solved && 'border-claude-500 bg-claude-500 text-white hover:bg-claude-400 dark:bg-claude-500 dark:text-white')}
        title="Finish and get your recap"
      >
        Finish
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

  // Grow with the text (up to max-h), so the panel stays small for one-line answers.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text, as])

  const submit = (value = text): void => {
    if (!value.trim() || disabled) return
    api.send({ text: value, as })
    setText('')
    setMode('answer')
  }

  // Voice: the final transcript goes through the same send as typing (spoken math is sent as text,
  // so the checker and the tutor read it like a typed sentence). Whatever was typed stays in the box.
  const [voiceSent, setVoiceSent] = useState(false)
  const sawBusy = useRef(false)
  const voice = useVoiceInput((spoken) => {
    api.send({ text: spoken, as: mode === 'recall' ? 'recall' : 'text' })
    setMode('answer')
    sawBusy.current = false
    setVoiceSent(true)
  })
  // "Waiting for Clueless" lasts until the tutor's reply (or an error) arrives.
  useEffect(() => {
    if (!voiceSent) return
    if (disabled) sawBusy.current = true
    else if (sawBusy.current) setVoiceSent(false)
    const t = setTimeout(() => !sawBusy.current && setVoiceSent(false), 3000) // never got busy
    return () => clearTimeout(t)
  }, [voiceSent, disabled])
  // The voice hotkey (Ctrl/Cmd+Shift+1) starts or stops talking.
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  useEffect(
    () =>
      api.onVoiceToggle(() => {
        const v = voiceRef.current
        if (v.state === 'starting' || v.state === 'listening') v.stop()
        else if (!disabledRef.current && v.state !== 'finishing') void v.start()
      }),
    []
  )
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

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
    <div className="px-3 pb-2.5 pt-1.5">
      {session.expects === 'choice' && session.choices.length > 0 && mode === 'answer' && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {session.choices.map((c) => (
            <Button key={c} variant="chip" disabled={disabled} onClick={() => submit(c)}>
              {c}
            </Button>
          ))}
        </div>
      )}
      <div className="mb-1 flex items-center gap-1 text-[10.5px]">
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
      <VoiceStrip voice={voice} onDismiss={voice.cancel} />
      <div className="flex items-end gap-1.5 rounded-xl border border-zinc-900/10 bg-white/70 px-2 py-1 focus-within:border-claude-500 dark:border-white/15 dark:bg-black/35">

        <textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={as === 'code' ? 3 : 1}
          disabled={disabled}
          className={cx(
            'no-drag max-h-28 min-h-[1.75rem] flex-1 resize-none bg-transparent py-0.5 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50',
            as === 'code' && 'font-mono text-[12.5px]'
          )}
        />
        <MicButton voice={voice} processing={voiceSent} disabled={disabled} />
        <IconButton
          title="Send"
          onClick={() => submit()}
          disabled={disabled || !text.trim()}
          className="bg-claude-500 text-white hover:bg-claude-400 hover:text-white disabled:opacity-40 dark:text-white dark:hover:bg-claude-400"
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
