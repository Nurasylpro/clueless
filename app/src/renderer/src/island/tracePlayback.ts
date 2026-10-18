// Plays a trace one step at a time. Each step is "held" before the next one:
// - silent: long enough to see the change and read the line on top (never shorter than STEP_MS);
// - with voice: until its line has been said, then a short breath.
// Speed (slow / normal / fast) scales both. Pause keeps the time left; with voice, resume says the
// current line again from the start. Back goes exactly one step back and pauses, silently.
import type { CodeTrace } from '../../../shared/trace'
import { stepDuration } from './traceExpression'

export const STEP_MS = 2400 // the shortest a step stays on screen at normal speed
export const INTRO_MS = 1100 // the shortest the intro stays on screen
export const GAP_MS = 550 // with voice: the breath after a line is said, before the next step

export const SPEEDS = { slow: 0.8, normal: 1, fast: 1.2 } as const
export type Speed = keyof typeof SPEEDS

/** Says the line for a step (-1 = the intro) and calls `done` when it has been said to the end.
 *  Returns a function that stops it. */
export interface Speaker {
  say(index: number, done: () => void): () => void
}

export interface PlaybackState {
  index: number // -1 = the intro
  paused: boolean
  done: boolean
}

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length

/** The line shown on top at `index` (-1 = the intro). */
export function lineAt(trace: CodeTrace, index: number): string {
  return index < 0 ? trace.intro : (trace.steps[index]?.say ?? '')
}

/** Silent: how long a step stays, at the given speed. Long enough to read its line (~215 words a minute). */
export function holdMs(trace: CodeTrace, index: number, rate = 1): number {
  const base = index < 0 ? INTRO_MS : stepDuration(trace, index, STEP_MS)
  const reading = 900 + words(lineAt(trace, index)) * 280
  return Math.round(Math.max(base, reading) / rate)
}

/** With voice: the breath after the line has been said (a little longer at a meaningful moment). */
export function gapMs(trace: CodeTrace, index: number, rate = 1): number {
  const extra = index >= 0 ? stepDuration(trace, index, 0) : 0
  return Math.round((GAP_MS + extra) / rate)
}

export class TracePlayback {
  private state: PlaybackState = { index: -1, paused: false, done: false }
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline: number | null = null
  private remaining: number
  private active = false
  private stopSpeech: (() => void) | null = null
  private speaking = false // the current step's line is being said right now
  private fresh = true // the current step hasn't started its hold yet (say its line first)

  constructor(
    private readonly trace: CodeTrace,
    private rate = 1,
    private speaker: Speaker | null = null
  ) {
    this.remaining = holdMs(trace, -1, rate)
  }

  getSnapshot = (): PlaybackState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start = (): void => {
    this.active = true
    this.run()
  }

  dispose = (): void => {
    this.active = false
    this.halt()
  }

  togglePause = (): void => {
    if (this.state.done || !this.trace.steps.length) return
    if (this.state.paused) {
      this.setState({ ...this.state, paused: false })
      this.run()
    } else {
      this.halt()
      this.setState({ ...this.state, paused: true })
    }
  }

  /** Going back always pauses, so the previous state stays available to inspect. Silent until resumed. */
  back = (): void => {
    if (this.state.index <= 0) return
    this.halt()
    const index = this.state.index - 1
    this.enter(index)
    this.setState({ index, paused: true, done: false })
  }

  /** Slow / normal / fast. A silent hold in progress keeps its place, at the new pace. */
  setRate = (rate: number): void => {
    if (rate === this.rate || rate <= 0) return
    const running = this.timer !== undefined
    if (running) this.cancelTimer()
    this.remaining = Math.round((this.remaining * this.rate) / rate)
    this.rate = rate
    if (running) this.schedule()
  }

  // ---------- internals ----------

  private setState(state: PlaybackState): void {
    this.state = state
    this.listeners.forEach((listener) => listener())
  }

  /** A step becomes current: its hold hasn't started yet. */
  private enter(index: number): void {
    this.fresh = true
    this.remaining = holdMs(this.trace, index, this.rate)
  }

  /** Continue the current step's hold (or start it), unless paused, done or inactive. */
  private run(): void {
    if (!this.active || this.state.paused || this.state.done || !this.trace.steps.length) return
    if (this.timer !== undefined || this.speaking) return
    if (this.speaker && this.fresh) {
      this.fresh = false
      this.speaking = true
      const index = this.state.index
      this.stopSpeech = this.speaker.say(index, () => {
        if (!this.speaking || this.state.index !== index) return
        this.speaking = false
        this.stopSpeech = null
        this.remaining = gapMs(this.trace, index, this.rate)
        this.schedule()
      })
      return
    }
    this.fresh = false
    this.schedule()
  }

  private schedule(): void {
    if (!this.active || this.timer !== undefined || this.state.paused || this.state.done) return
    this.deadline = Date.now() + this.remaining
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.deadline = null
      this.next()
    }, this.remaining)
  }

  private next(): void {
    if (this.state.index === this.trace.steps.length - 1) {
      this.setState({ ...this.state, done: true })
      return
    }
    const index = this.state.index + 1
    this.enter(index)
    this.setState({ index, paused: false, done: false })
    this.run()
  }

  /** Stop the clock and the voice. A line cut off mid-sentence is said again from the start. */
  private halt(): void {
    this.cancelTimer()
    if (this.speaking) {
      this.speaking = false
      this.fresh = true
      this.remaining = holdMs(this.trace, this.state.index, this.rate)
    }
    this.stopSpeech?.()
    this.stopSpeech = null
  }

  private cancelTimer(): void {
    if (this.deadline !== null) this.remaining = Math.max(0, this.deadline - Date.now())
    clearTimeout(this.timer)
    this.timer = undefined
    this.deadline = null
  }
}
