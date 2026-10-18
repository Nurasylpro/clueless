// The island's state machine: highlight -> Ask -> thinking -> the answer in the panel, and with
// Animate on, the step-by-step animation drawn over the highlighted code. It also paces the
// animation: one step every STEP_MS, or, with voice on, the next step once the panel has finished
// reading the current one aloud.
// No Electron or Node imports: the main process runs it for real, and the browser mock
// (`npm run ui`) runs the very same logic with a fake tracer.
import type { CodeSpot, IslandView } from './contracts'
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

/** What a capture finds: the screen for Claude, and where the highlight sits on it. */
export interface IslandCapture {
  image: ScreenImage | null
  spot: CodeSpot | null
}

export interface IslandDeps {
  /** A fresh conversation for a new highlight, or null when no Claude credentials are set up. */
  makeTracer(): TracerLike | null
  /** A screenshot of the screen the student is working on (Clueless's own windows hidden). */
  capture(snippet: string): Promise<IslandCapture>
  emit(view: IslandView): void
  /** Run `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void
  now(): number
}

/** Before step 1: time to spot the drawing on the code. */
export const INTRO_MS = 1800
/** One step, voice off. */
export const STEP_MS = 2000
/** Voice on: a step stays at least this long, even if its line is short. */
export const MIN_STEP_MS = 700
/** Voice on: never wait longer than this for a step's narration (the panel may be gone). */
export const MAX_STEP_MS = 12_000
/** Voice on: the intro reads the whole answer first. */
export const MAX_INTRO_MS = 30_000
/** A finished animation stays this long on the code, then clears (the text stays in the panel). */
export const FINISHED_MS = 8000

export const NO_KEY_MESSAGE =
  'Add your Claude key first: put ANTHROPIC_API_KEY (or the AWS Bedrock lines) in app/.env, then try again.'

export const SCROLLED_NOTICE = 'The page moved, so the animation stopped. Press Replay once the code is back where it was.'

export class IslandController {
  private view: IslandView
  private tracer: TracerLike | null = null
  private run = 0 // bumps on every new request / close, so stale replies are dropped
  private nonce = 0
  private cancelTimer: (() => void) | null = null
  private narrated = false
  private stepStarted = 0

  constructor(
    private readonly deps: IslandDeps,
    animate = true
  ) {
    this.view = idleView(animate, true)
  }

  get current(): IslandView {
    return structuredClone(this.view)
  }

  setAnimate(on: boolean): void {
    this.view.animate = on
    if (!on) this.stopPlayback(false)
    this.emit()
  }

  setAskOnHighlight(on: boolean): void {
    this.view.askOnHighlight = on
    this.emit()
  }

  /** The panel reads steps aloud (voice on) and reports when each one is done. */
  setNarrated(on: boolean): void {
    if (this.narrated === on) return
    this.narrated = on
    if (this.view.playback?.playing) this.scheduleNext() // re-time the current step
  }

  /** The student clicked Ask on a highlight. */
  async ask(snippet: string): Promise<void> {
    if (!snippet.trim()) return
    const run = this.restart()
    const tracer = this.deps.makeTracer()
    this.tracer = tracer
    const { animate, askOnHighlight } = this.view
    this.view = { ...idleView(animate, askOnHighlight), phase: 'thinking', snippet, busySince: this.deps.now() }
    this.emit()
    if (!tracer) return this.fail(run, NO_KEY_MESSAGE)
    await this.attempt(run, animate, async () => {
      const { image, spot } = await this.deps.capture(snippet)
      if (run !== this.run) return null
      this.view.spot = spot
      return tracer.ask({ snippet, image, animate })
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
    this.view.notice = null
    this.view.playback = null
    this.view.busySince = this.deps.now()
    this.emit()
    await this.attempt(run, animate, () => tracer.followUp(text, animate))
  }

  /** ✕ on the Ask card, a new highlight, Hide: nothing asked any more. Anything in flight is dropped. */
  close(): void {
    this.restart()
    this.tracer = null
    this.view = idleView(this.view.animate, this.view.askOnHighlight)
    this.emit()
  }

  // ---------- the animation ----------

  play(): void {
    const p = this.view.playback
    if (!p) return this.replay()
    if (p.playing) return
    if (p.index >= this.lastIndex()) return this.replay()
    p.playing = true
    this.scheduleNext()
    this.emit()
  }

  pause(): void {
    const p = this.view.playback
    if (!p?.playing) return
    this.cancel()
    p.playing = false
    this.emit()
  }

  /** Step back or forward by hand (pauses). */
  step(delta: number): void {
    const p = this.view.playback
    if (!p) return
    this.cancel()
    p.playing = false
    p.index = Math.max(0, Math.min(this.lastIndex(), p.index + Math.sign(delta)))
    this.emit()
  }

  replay(): void {
    if (!this.view.trace || this.view.phase !== 'answer') return
    this.view.notice = null
    this.startPlayback()
  }

  /** Take the animation off the screen; the text stays. */
  stopPlayback(emit = true): void {
    if (!this.view.playback) return
    this.cancel()
    this.view.playback = null
    if (emit) this.emit()
  }

  /** The panel finished reading step `index` aloud. */
  stepDone(nonce: number, index: number): void {
    const p = this.view.playback
    if (!this.narrated || !p?.playing || p.nonce !== nonce || p.index !== index) return
    const left = Math.max(0, MIN_STEP_MS - (this.deps.now() - this.stepStarted))
    this.after(left, () => this.advance())
  }

  /** The student scrolled: the drawing would no longer line up with the code. */
  scrolled(): void {
    if (!this.view.playback) return
    this.stopPlayback(false)
    this.view.notice = SCROLLED_NOTICE
    this.emit()
  }

  // ---------- internals ----------

  private startPlayback(): void {
    this.cancel()
    this.view.playback = { nonce: ++this.nonce, index: -1, playing: true }
    this.scheduleNext()
    this.emit()
  }

  /** Time the current step: a fixed time, or (voice on) until its narration ends. */
  private scheduleNext(): void {
    const p = this.view.playback
    if (!p) return
    this.stepStarted = this.deps.now()
    if (this.narrated) this.after(p.index < 0 ? MAX_INTRO_MS : MAX_STEP_MS, () => this.advance())
    else this.after(p.index < 0 ? INTRO_MS : STEP_MS, () => this.advance())
  }

  private advance(): void {
    const p = this.view.playback
    if (!p?.playing) return
    if (p.index < this.lastIndex()) p.index++
    if (p.index < this.lastIndex()) this.scheduleNext()
    else this.finish()
    this.emit()
  }

  /** On the last step: stop there, and clear the drawing after a while. */
  private finish(): void {
    const p = this.view.playback
    if (!p) return
    p.playing = false
    const nonce = p.nonce
    this.after(FINISHED_MS, () => {
      if (this.view.playback?.nonce === nonce && !this.view.playback.playing) this.stopPlayback()
    })
  }

  private lastIndex(): number {
    return (this.view.trace?.steps.length ?? 0) - 1
  }

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
    view.trace = reply.trace
    view.phase = 'answer'
    if (animate && reply.trace && view.spot) this.startPlayback()
    else this.emit()
  }

  private fail(run: number, message: string): void {
    if (run !== this.run) return
    this.view.busySince = null
    this.view.error = message
    this.view.phase = 'answer'
    this.emit()
  }

  private after(ms: number, fn: () => void): void {
    this.cancelTimer?.()
    const cancel = this.deps.schedule(() => {
      if (this.cancelTimer === cancel) this.cancelTimer = null
      fn()
    }, ms)
    this.cancelTimer = cancel
  }

  private cancel(): void {
    this.cancelTimer?.()
    this.cancelTimer = null
  }

  private restart(): number {
    this.cancel()
    return ++this.run
  }

  private emit(): void {
    this.deps.emit(structuredClone(this.view))
  }
}

function idleView(animate: boolean, askOnHighlight: boolean): IslandView {
  return {
    askOnHighlight,
    animate,
    phase: 'idle',
    snippet: null,
    messages: [],
    trace: null,
    spot: null,
    playback: null,
    busySince: null,
    error: null,
    notice: null
  }
}
