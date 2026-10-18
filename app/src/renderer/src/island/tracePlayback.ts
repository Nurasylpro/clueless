import type { CodeTrace } from '../../../shared/trace'
import { stepDuration } from './traceExpression'

export const STEP_MS = 2400
export const INTRO_MS = 1100

interface PlaybackState {
  index: number
  paused: boolean
  done: boolean
}

/** One timer, one step at a time. Pausing preserves the time left on the current step. */
export class TracePlayback {
  private state: PlaybackState = { index: -1, paused: false, done: false }
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline: number | null = null
  private remaining = INTRO_MS
  private active = false

  constructor(private readonly trace: CodeTrace) {}

  getSnapshot = (): PlaybackState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start = (): void => {
    this.active = true
    this.schedule()
  }

  dispose = (): void => {
    this.active = false
    this.cancel()
  }

  togglePause = (): void => {
    if (this.state.done || !this.trace.steps.length) return
    this.cancel()
    this.setState({ ...this.state, paused: !this.state.paused })
    this.schedule()
  }

  /** Going back always pauses, so the previous state stays available to inspect. */
  back = (): void => {
    if (this.state.index <= 0) return
    this.cancel()
    const index = this.state.index - 1
    this.remaining = stepDuration(this.trace, index, STEP_MS)
    this.setState({ index, paused: true, done: false })
  }

  private setState(state: PlaybackState): void {
    this.state = state
    this.listeners.forEach((listener) => listener())
  }

  private cancel(): void {
    if (this.deadline !== null) this.remaining = Math.max(0, this.deadline - Date.now())
    clearTimeout(this.timer)
    this.timer = undefined
    this.deadline = null
  }

  private schedule(): void {
    if (!this.active || this.timer !== undefined || this.state.paused || this.state.done || !this.trace.steps.length) return
    this.deadline = Date.now() + this.remaining
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.deadline = null
      if (this.state.index === this.trace.steps.length - 1) {
        this.setState({ ...this.state, done: true })
        return
      }
      const index = this.state.index + 1
      this.remaining = stepDuration(this.trace, index, STEP_MS)
      this.setState({ index, paused: false, done: false })
      this.schedule()
    }, this.remaining)
  }
}
