// Session controller: glues the tutor, the answer checker, stuck detection and memory together,
// and keeps the SessionView the UI renders. No Electron imports (screen capture is injected).
import { randomUUID } from 'node:crypto'
import type {
  AnswerCheck,
  InputKind,
  ProblemInfo,
  ScreenArea,
  SessionView,
  StuckState,
  Subject,
  ThreadItem,
  TutorReplyT,
  TutorTurn,
  TurnAnimation,
  TurnView,
  UserAction
} from '../shared/contracts'
import { checkAnswer } from './checker/check'
import type { MemoryStore, SessionRecord } from './memory/store'
import { TutorError, type ImageInput, type SendInput, type TutorLike } from './tutor/tutor'

export const REVEAL_AFTER_ATTEMPTS = 3

/** "Animate my code": the student dragged a box around their code. */
export interface AreaCapture {
  screen: ImageInput // the whole display, for context
  crop: ImageInput // just the selected area
  area: ScreenArea
}

export interface ControllerDeps {
  /** A fresh tutor for a new problem, or null when there's no API key. */
  makeTutor(): TutorLike | null
  memory: MemoryStore
  /** Capture the screen for "Check my work". */
  captureScreen(): Promise<ImageInput | null>
  /** Let the student drag a box around their code and capture it. null = cancelled. */
  captureArea(): Promise<AreaCapture | null>
  emit(view: SessionView | null): void
  stuck: {
    start(): Promise<void> | void
    stop(): void
    snooze(): void
    noteActivity(): void
    noteWrongStreak(streak: number): void
  }
}

export class SessionController {
  private view: SessionView | null = null
  private tutor: TutorLike | null = null
  private problem: ProblemInfo | null = null
  private pendingCheck: AnswerCheck | null = null
  private pendingNotes: string[] = []
  private lastFailed: (() => Promise<void>) | null = null
  private recorded = false
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly deps: ControllerDeps) {}

  get current(): SessionView | null {
    return this.view
  }

  /** Start a new problem from a screenshot and/or typed text. */
  startProblem(input: { image?: ImageInput; text?: string }): Promise<void> {
    return this.enqueue(async () => {
      this.finishRecord()
      const tutor = this.deps.makeTutor()
      this.tutor = tutor
      this.problem = null
      this.pendingCheck = null
      this.pendingNotes = []
      this.recorded = false
      this.view = emptyView()
      if (!tutor) {
        this.view.error = 'Add your Claude API key first (see the banner above).'
        return this.emit()
      }
      void this.deps.stuck.start()
      const run = async (): Promise<void> => {
        const reply = await this.call('Reading your screen…', () =>
          tutor.start({ ...input, history: this.deps.memory.historySummary() })
        )
        if (reply) this.applyReply(reply)
      }
      await this.attempt(run)
    })
  }

  send(text: string, as: InputKind): Promise<void> {
    return this.enqueue(async () => {
      const view = this.view
      if (!view || !this.tutor || !text.trim()) return
      this.deps.stuck.noteActivity()

      const check = as === 'recall' ? null : this.pendingCheck
      const result = check ? checkAnswer(check, text) : null
      view.thread.push({ id: randomUUID(), role: 'student', text, as, check: result, at: Date.now() })
      this.emit()

      const notes = this.takeNotes()
      if (result) notes.push(`[CHECKER] ${result.detail}`)
      const input: SendInput = { tag: as === 'recall' ? 'RECALL' : 'STUDENT', text, notes }
      await this.attempt(() => this.round(input))
    })
  }

  action(action: UserAction): Promise<void> {
    return this.enqueue(async () => {
      const view = this.view
      if (action === 'new') {
        this.finishRecord()
        this.deps.stuck.stop()
        this.view = null
        this.tutor = null
        return this.emit()
      }
      if (action === 'im_fine') {
        this.deps.stuck.snooze()
        return
      }
      if (action === 'retry') {
        const failed = this.lastFailed
        if (failed && view) {
          view.error = null
          await this.attempt(failed)
        }
        return
      }
      if (!view || !this.tutor || !this.problem) return
      this.deps.stuck.noteActivity()

      switch (action) {
        case 'hint':
          return this.attempt(() => this.round({ tag: 'HINT', notes: this.takeNotes() }, 'Thinking of a hint…'))
        case 'next':
          return this.attempt(() => this.round({ tag: 'WHAT NEXT', notes: this.takeNotes() }))
        case 'check_my_work': {
          const image = await this.deps.captureScreen()
          if (!image) {
            view.error = "Couldn't capture your screen."
            return this.emit()
          }
          return this.attempt(() =>
            this.round({ tag: 'CHECK MY WORK', image, notes: this.takeNotes() }, 'Looking at your work…')
          )
        }
        case 'reveal':
          if (!view.revealAllowed) return
          view.revealed = true
          return this.attempt(() => this.round({ tag: 'REVEAL', notes: this.takeNotes() }))
        case 'finish':
          return this.attempt(() => this.round({ tag: 'RECAP', notes: this.takeNotes() }, 'Writing your recap…'))
        case 'animate_code': {
          const shot = await this.deps.captureArea()
          if (!shot) return // the student cancelled the selection
          const animation: TurnAnimation = { target: 'code', area: shot.area }
          return this.attempt(() =>
            this.round(
              { tag: 'ANIMATE CODE', image: shot.screen, crop: shot.crop, notes: this.takeNotes() },
              'Getting the animation ready…',
              animation
            )
          )
        }
        case 'animate_problem':
        case 'animate_question': {
          const target = action === 'animate_problem' ? 'problem' : 'question'
          const tag = action === 'animate_problem' ? 'ANIMATE PROBLEM' : 'ANIMATE QUESTION'
          return this.attempt(() =>
            this.round({ tag, notes: this.takeNotes() }, 'Getting the animation ready…', { target, area: null })
          )
        }
      }
    })
  }

  /** Show an error without calling Claude (for example, the screen couldn't be captured). */
  fail(message: string): void {
    if (!this.view) this.view = emptyView()
    this.view.busy = null
    this.view.error = message
    this.emit()
  }

  /** The stuck detector changed level: show or hide the glow / bubble. */
  setStuck(state: StuckState): void {
    if (!this.view) return
    this.view.stuck = state
    this.emit()
  }

  /** The student says the subject is different from what Clueless guessed. */
  setSubject(subject: Subject): void {
    if (!this.view?.problem || !this.problem) return
    this.problem.subject = subject
    this.view.problem.subject = subject
    this.pendingNotes.push(`[SUBJECT] The student says this is a ${subject} problem.`)
    this.emit()
  }

  // ---------- internals ----------

  private async round(input: SendInput, busy = 'Thinking…', animation: TurnAnimation | null = null): Promise<void> {
    const tutor = this.tutor
    if (!tutor) return
    const reply = await this.call(busy, () => tutor.send(input))
    if (reply) this.applyReply(reply, animation)
  }

  private async attempt(run: () => Promise<void>): Promise<void> {
    try {
      this.lastFailed = null
      await run()
    } catch (err) {
      if (!this.view) return
      this.view.busy = null
      this.view.error = err instanceof TutorError || err instanceof Error ? err.message : String(err)
      this.lastFailed = run
      this.emit()
    }
  }

  private async call(busy: string, fn: () => Promise<TutorReplyT>): Promise<TutorReplyT | null> {
    const view = this.view
    if (!view) return null
    view.busy = busy
    view.error = null
    this.emit()
    const tutor = this.tutor
    const reply = await fn()
    // A new problem started while we were waiting: drop this reply.
    if (this.view !== view || this.tutor !== tutor) return null
    view.busy = null
    return reply
  }

  private applyReply(reply: TutorReplyT, animation: TurnAnimation | null = null): void {
    const view = this.view
    if (!view) return
    const turn = reply.turn

    if (reply.problem && !this.problem) {
      this.problem = reply.problem
      const { hiddenSolution: _hidden, ...visible } = reply.problem
      view.problem = visible
    }

    // Count answers and wrong streaks from the tutor's verdict.
    if (turn.verdict !== 'none') {
      view.attempts++
      view.wrongStreak = turn.verdict === 'correct' ? 0 : view.wrongStreak + 1
      this.deps.stuck.noteWrongStreak(view.wrongStreak)
    }
    if (turn.hintLevel > 0) view.hintsUsed++
    view.revealAllowed = view.attempts >= REVEAL_AFTER_ATTEMPTS
    if (turn.kind === 'solved') view.solved = true
    if (turn.plan.length) view.plan = turn.plan
    view.expects = turn.expects
    view.choices = turn.choices
    this.pendingCheck = turn.check

    if (turn.gap && this.problem) this.deps.memory.recordGap(this.problem.subject, turn.gap)

    const itemId = randomUUID()
    view.thread.push({ id: itemId, role: 'tutor', turn: toTurnView(turn, animation), at: Date.now() })

    if (reply.recap && this.problem) {
      const subject = this.problem.subject
      const cardsAdded = this.deps.memory.addCards(subject, this.problem.title, reply.recap.flashcards)
      view.recap = {
        ...reply.recap,
        hintsUsed: view.hintsUsed,
        attempts: view.attempts,
        solved: view.solved,
        revealed: view.revealed,
        cardsAdded,
        afterItemId: itemId
      }
      this.finishRecord()
      this.deps.stuck.stop()
    }
    this.emit()
  }

  /** Save the finished (or abandoned) session to memory once. */
  private finishRecord(): void {
    const view = this.view
    if (!view || !view.problem || this.recorded) return
    this.recorded = true
    const gaps = view.thread.flatMap((t) => (t.role === 'tutor' && t.turn.gap ? [t.turn.gap] : []))
    const record: SessionRecord = {
      id: view.id,
      startedAt: new Date(view.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      subject: view.problem.subject,
      title: view.problem.title,
      attempts: view.attempts,
      hintsUsed: view.hintsUsed,
      solved: view.solved,
      revealed: view.revealed,
      gaps,
      turns: view.thread.flatMap((t): SessionRecord['turns'] =>
        t.role === 'tutor'
          ? [{ role: 'tutor' as const, text: t.turn.message, kind: t.turn.kind, hintLevel: t.turn.hintLevel }]
          : t.role === 'student'
            ? [{ role: 'student' as const, text: t.text, as: t.as }]
            : []
      )
    }
    this.deps.memory.addSession(record)
  }

  private takeNotes(): string[] {
    const notes = this.pendingNotes
    this.pendingNotes = []
    return notes
  }

  /** One request at a time, in order. */
  private enqueue(job: () => Promise<void>): Promise<void> {
    const next = this.queue.then(job, job)
    this.queue = next.catch(() => {})
    return next
  }

  private emit(): void {
    this.deps.emit(this.view ? structuredClone(this.view) : null)
  }
}

export function toTurnView(turn: TutorTurn, animation: TurnAnimation | null = null): TurnView {
  const { check, ...rest } = turn
  // "I can't animate this." comes back without a visual: nothing to play.
  return { ...rest, checkKind: check?.kind ?? null, animation: turn.visual ? animation : null }
}

function emptyView(): SessionView {
  return {
    id: randomUUID(),
    startedAt: Date.now(),
    problem: null,
    plan: [],
    thread: [] as ThreadItem[],
    expects: 'none',
    choices: [],
    attempts: 0,
    wrongStreak: 0,
    hintsUsed: 0,
    revealAllowed: false,
    revealed: false,
    solved: false,
    busy: null,
    error: null,
    stuck: { level: 0, reason: null },
    recap: null
  }
}
