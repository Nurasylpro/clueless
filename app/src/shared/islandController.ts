// The island's state machine: highlight -> Ask -> thinking -> text -> (4 s) -> full-screen animation.
// No Electron or Node imports: the main process runs it for real, and the browser mock
// (`npm run ui`) runs the very same logic with a fake tracer.
import type { IslandView } from './contracts'
import type { TraceReply } from './trace'

export interface ScreenImage {
  data: string // base64, no data: prefix
  mediaType: 'image/jpeg' | 'image/png'
}

export interface AskInput {
  snippet: string // the highlighted text, as copied
  image: ScreenImage | null // the whole screen, for context
  animate: boolean
}

/** One conversation with Claude about one highlight. */
export interface TracerLike {
  ask(input: AskInput): Promise<TraceReply>
  followUp(text: string, animate: boolean): Promise<TraceReply>
}

export interface IslandDeps {
  /** A fresh conversation for a new highlight, or null when no Claude credentials are set up. */
  makeTracer(): TracerLike | null
  /** A screenshot of the screen the student is working on (Clueless's own windows hidden). */
  capture(): Promise<ScreenImage | null>
  emit(view: IslandView): void
  /** Run `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void
  now(): number
}

/** Animate on: the text shows this long, then the animation takes the whole screen. */
export const READ_BEFORE_ANIMATION_MS = 4000

/** Animate on but nothing to animate: the text closes by itself after it's been read. */
export function readingMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return 4000 + Math.ceil(words / 15) * 1000
}

export const NO_KEY_MESSAGE =
  'Add your Claude key first: put ANTHROPIC_API_KEY (or the AWS Bedrock lines) in app/.env, then try again.'

export class IslandController {
  private view: IslandView
  private tracer: TracerLike | null = null
  private run = 0 // bumps on every new request / close, so stale replies are dropped
  private cancelTimer: (() => void) | null = null
  private holding = false
  private closeOnRelease = false

  constructor(
    private readonly deps: IslandDeps,
    animate = true
  ) {
    this.view = idleView(animate)
  }

  get current(): IslandView {
    return structuredClone(this.view)
  }

  setAnimate(on: boolean): void {
    this.view.animate = on
    this.emit()
  }

  /** The student clicked Ask on a highlight. */
  async ask(snippet: string): Promise<void> {
    if (!snippet.trim()) return
    const run = this.restart()
    const tracer = this.deps.makeTracer()
    this.tracer = tracer
    const animate = this.view.animate
    this.view = { ...idleView(animate), phase: 'thinking', snippet, busySince: this.deps.now() }
    this.emit()
    if (!tracer) return this.fail(run, NO_KEY_MESSAGE)
    await this.attempt(run, animate, async () => {
      const image = await this.deps.capture()
      return run === this.run ? tracer.ask({ snippet, image, animate }) : null
    })
  }

  /** A typed follow-up about the same highlight. */
  async followUp(text: string): Promise<void> {
    const tracer = this.tracer
    if (!tracer || this.view.phase !== 'answer' || !text.trim()) return
    const run = this.restart()
    const animate = this.view.animate
    this.view.messages.push({ role: 'student', text })
    this.view.phase = 'thinking'
    this.view.error = null
    this.view.trace = null
    this.view.busySince = this.deps.now()
    this.emit()
    await this.attempt(run, animate, () => tracer.followUp(text, animate))
  }

  /** The mouse is over the card: an auto-close waits until it leaves. */
  holdCard(hold: boolean): void {
    this.holding = hold
    if (!hold && this.closeOnRelease) {
      this.closeOnRelease = false
      this.after(1500, () => this.autoClose())
    }
  }

  /** ✕, a new highlight, Hide: back to the bare pill. Anything still in flight is dropped. */
  closeCard(): void {
    this.restart()
    this.tracer = null
    this.view = idleView(this.view.animate)
    this.emit()
  }

  /** The student clicked the finished animation away. */
  finishAnimation(): void {
    if (this.view.phase === 'playing' || this.view.phase === 'reading') this.closeCard()
  }

  // ---------- internals ----------

  private async attempt(run: number, animate: boolean, call: () => Promise<TraceReply | null>): Promise<void> {
    let reply: TraceReply | null
    try {
      reply = await call()
    } catch (err) {
      if (run === this.run) this.fail(run, err instanceof Error ? err.message : String(err))
      return
    }
    if (!reply || run !== this.run) return
    const view = this.view
    view.busySince = null
    view.messages.push({ role: 'clueless', text: reply.message || "I couldn't find anything to explain there." })
    if (animate && reply.trace) {
      view.trace = reply.trace
      view.phase = 'reading'
      this.emit()
      this.after(READ_BEFORE_ANIMATION_MS, () => {
        this.view.phase = 'playing'
        this.emit()
      })
      return
    }
    view.trace = null
    view.phase = 'answer'
    this.emit()
    // Animate on, but nothing to animate (not code): the text closes by itself once read.
    if (animate) this.after(readingMs(reply.message), () => this.autoClose())
  }

  private fail(run: number, message: string): void {
    if (run !== this.run) return
    this.view.busySince = null
    this.view.error = message
    this.view.phase = 'answer'
    this.emit()
  }

  private autoClose(): void {
    if (this.holding) this.closeOnRelease = true
    else this.closeCard()
  }

  private after(ms: number, fn: () => void): void {
    this.cancelTimer?.()
    const cancel = this.deps.schedule(() => {
      if (this.cancelTimer === cancel) this.cancelTimer = null
      fn()
    }, ms)
    this.cancelTimer = cancel
  }

  private restart(): number {
    this.cancelTimer?.()
    this.cancelTimer = null
    this.closeOnRelease = false
    return ++this.run
  }

  private emit(): void {
    this.deps.emit(structuredClone(this.view))
  }
}

function idleView(animate: boolean): IslandView {
  return { animate, phase: 'idle', snippet: null, messages: [], trace: null, busySince: null, error: null }
}
