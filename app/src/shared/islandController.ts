// The island's state machine. Ask on a highlight (or type / say a question in the card) ->
// thinking -> with Animate on and code: the full-screen animation starts right away (its recap
// waits in the card); otherwise the text answer opens the card. Voice only changes what the UI
// reads aloud, so it is just stored here.
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

export interface ScreenQuestion {
  question: string // typed or spoken, with nothing highlighted
  image: ScreenImage | null
  animate: boolean
}

/** One conversation with Claude about one highlight (or one screen). */
export interface TracerLike {
  ask(input: AskInput): Promise<TraceReply>
  askScreen(input: ScreenQuestion): Promise<TraceReply>
  followUp(text: string, animate: boolean): Promise<TraceReply>
}

export interface IslandDeps {
  /** A fresh conversation, or null when no Claude credentials are set up. */
  makeTracer(): TracerLike | null
  /** A screenshot of the screen the student is working on (Clueless's own windows hidden). */
  capture(): Promise<ScreenImage | null>
  emit(view: IslandView): void
  /** Run `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void
  now(): number
}

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
  private run = 0 // bumps on every new request / hide, so stale replies are dropped
  private cancelTimer: (() => void) | null = null
  private holding = false
  private closeOnRelease = false

  constructor(
    private readonly deps: IslandDeps,
    settings: { animate?: boolean; voice?: boolean } = {}
  ) {
    this.view = freshView(settings.animate ?? true, settings.voice ?? false)
  }

  get current(): IslandView {
    return structuredClone(this.view)
  }

  setAnimate(on: boolean): void {
    this.view.animate = on
    this.emit()
  }

  setVoice(on: boolean): void {
    this.view.voice = on
    this.emit()
  }

  /** The Expand arrow: open or close the card. Closing keeps the conversation for next time. */
  setExpanded(open: boolean): void {
    this.cancelAutoClose()
    this.view.expanded = open
    this.emit()
  }

  /** The student clicked Ask on a highlight: a new conversation about it. */
  async ask(snippet: string): Promise<void> {
    if (!snippet.trim()) return
    const run = this.restart()
    const tracer = this.deps.makeTracer()
    this.tracer = tracer
    const { animate, voice, expanded } = this.view
    this.view = { ...freshView(animate, voice), expanded, phase: 'thinking', snippet, busySince: this.deps.now(), playId: this.view.playId }
    this.emit()
    if (!tracer) return this.fail(run, NO_KEY_MESSAGE)
    await this.attempt(run, animate, async () => {
      const image = await this.deps.capture()
      return run === this.run ? tracer.ask({ snippet, image, animate }) : null
    })
  }

  /** Typed or spoken in the card: a follow-up when there's a conversation, else about the screen. */
  async askText(text: string): Promise<void> {
    const question = text.trim()
    if (!question || this.view.phase === 'thinking' || this.view.phase === 'playing') return
    const run = this.restart()
    const animate = this.view.animate
    let tracer = this.tracer
    const fresh = !tracer
    if (fresh) {
      tracer = this.deps.makeTracer()
      this.tracer = tracer
      const { voice, playId } = this.view
      this.view = { ...freshView(animate, voice), playId }
    }
    this.view.messages.push({ role: 'student', text: question })
    this.view.expanded = true
    this.view.phase = 'thinking'
    this.view.error = null
    this.view.busySince = this.deps.now()
    this.emit()
    if (!tracer) return this.fail(run, NO_KEY_MESSAGE)
    const t = tracer
    await this.attempt(run, animate, async () => {
      if (!fresh) return t.followUp(question, animate)
      const image = await this.deps.capture()
      return run === this.run ? t.askScreen({ question, image, animate }) : null
    })
  }

  /** "Watch again" in the card: the latest animation from the start. */
  replay(): void {
    if (!this.view.trace || this.view.phase === 'thinking') return
    this.restart()
    this.view.phase = 'playing'
    this.view.expanded = false
    this.view.playId++
    this.emit()
  }

  /** The mouse is over the card, or it's being read aloud: an auto-close waits until that ends. */
  holdCard(hold: boolean): void {
    this.holding = hold
    if (!hold && this.closeOnRelease) {
      this.closeOnRelease = false
      this.after(1500, () => this.autoClose())
    }
  }

  /** The student clicked the finished animation away: back to the pill (the recap is in the card). */
  finishAnimation(): void {
    if (this.view.phase !== 'playing') return
    this.view.phase = 'idle'
    this.view.expanded = false
    this.emit()
  }

  /** The hotkey hid the island: drop anything in flight and close the card. The last answer and
   *  animation stay for the next time it's expanded. */
  hide(): void {
    this.restart()
    if (this.view.phase === 'thinking') {
      this.view.busySince = null
      this.view.messages = this.view.messages.filter((m, i, all) => !(i === all.length - 1 && m.role === 'student'))
    }
    this.view.phase = 'idle'
    this.view.expanded = false
    this.emit()
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
      // No text screen first: the animation starts right away; its recap waits in the card.
      view.trace = reply.trace
      view.recapAt = view.messages.length - 1
      view.phase = 'playing'
      view.expanded = false
      view.playId++
      this.emit()
      return
    }
    view.phase = 'answer'
    view.expanded = true
    this.emit()
    // Animate on, but nothing to animate (not code): the text closes by itself once read.
    if (animate) this.after(readingMs(reply.message), () => this.autoClose())
  }

  private fail(run: number, message: string): void {
    if (run !== this.run) return
    this.view.busySince = null
    this.view.error = message
    this.view.phase = 'answer'
    this.view.expanded = true
    this.emit()
  }

  private autoClose(): void {
    if (this.holding) {
      this.closeOnRelease = true
      return
    }
    this.view.expanded = false
    if (this.view.phase === 'answer') this.view.phase = 'idle'
    this.emit()
  }

  private cancelAutoClose(): void {
    this.cancelTimer?.()
    this.cancelTimer = null
    this.closeOnRelease = false
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
    this.cancelAutoClose()
    return ++this.run
  }

  private emit(): void {
    this.deps.emit(structuredClone(this.view))
  }
}

function freshView(animate: boolean, voice: boolean): IslandView {
  return {
    animate,
    voice,
    expanded: false,
    phase: 'idle',
    snippet: null,
    messages: [],
    trace: null,
    recapAt: -1,
    playId: 0,
    busySince: null,
    error: null
  }
}
