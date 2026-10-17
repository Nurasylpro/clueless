// Stuck detection. Runs on the laptop, with no AI calls:
// - the screen hasn't changed for a while (tiny grayscale thumbnails are compared)
// - several wrong answers in a row
// - an answer site (ChatGPT, Chegg, Photomath, ...) appeared after the session started
// No Electron imports: screen and window access are injected, so this is unit-testable.
import type { StuckState } from '../../shared/contracts'

export const ANSWER_SITES =
  /chatgpt|chegg|photomath|symbolab|mathway|course\s?hero|brainly|quizlet|gauth|socratic|wolfram\s?alpha|studocu|numerade/i

export interface StuckDeps {
  /** Grayscale thumbnail of the screen (same size every time), or null if unavailable. */
  thumbnail(): Promise<Uint8Array | null>
  /** Titles of the open windows (browser windows include the tab title). */
  windowTitles(): Promise<string[]>
  /** True while the student is typing in Clueless itself; then they're not stuck. */
  isCluelessFocused(): boolean
  onChange(state: StuckState): void
  now?: () => number
}

export const STUCK_TIMING = {
  tickMs: 15_000,
  glowAfterMs: 60_000,
  bubbleAfterMs: 120_000,
  snoozeMs: 5 * 60_000,
  wrongStreakForBubble: 3
}

/** Mean absolute difference between two grayscale images (0-255). */
export function diffScore(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 255
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i])
  return total / a.length
}

/** Below this the screen counts as "unchanged" (cursor blinks and clocks are ~0.1-0.5). */
export const CHANGE_THRESHOLD = 1.5

export class StuckDetector {
  private timer: ReturnType<typeof setInterval> | null = null
  private last: Uint8Array | null = null
  private unchangedSince = 0
  private wrongStreak = 0
  private baselineSites = new Set<string>()
  private snoozedUntil = 0
  private state: StuckState = { level: 0, reason: null }
  private readonly now: () => number

  constructor(private readonly deps: StuckDeps) {
    this.now = deps.now ?? Date.now
  }

  /** Start watching for a new problem session. */
  async start(): Promise<void> {
    this.stop()
    this.last = null
    this.unchangedSince = this.now()
    this.wrongStreak = 0
    this.snoozedUntil = 0
    this.baselineSites = new Set((await this.safeTitles()).filter((t) => ANSWER_SITES.test(t)))
    this.set({ level: 0, reason: null })
    this.timer = setInterval(() => void this.tick(), STUCK_TIMING.tickMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.set({ level: 0, reason: null })
  }

  /** "I'm fine": stay quiet for a while. */
  snooze(): void {
    this.snoozedUntil = this.now() + STUCK_TIMING.snoozeMs
    this.unchangedSince = this.now()
    this.set({ level: 0, reason: null })
  }

  /** The student answered or asked something in Clueless: that's progress, reset the clock. */
  noteActivity(): void {
    this.unchangedSince = this.now()
    if (this.state.level > 0 && this.wrongStreak < STUCK_TIMING.wrongStreakForBubble) {
      this.set({ level: 0, reason: null })
    }
  }

  noteWrongStreak(streak: number): void {
    this.wrongStreak = streak
    if (streak >= STUCK_TIMING.wrongStreakForBubble && !this.snoozed()) {
      this.set({ level: 2, reason: `${streak} wrong answers in a row` })
    }
  }

  get current(): StuckState {
    return this.state
  }

  /** One check. Public so tests can drive it without timers. */
  async tick(): Promise<void> {
    if (this.deps.isCluelessFocused()) {
      this.unchangedSince = this.now()
      return
    }
    const thumb = await this.deps.thumbnail().catch(() => null)
    if (thumb) {
      if (!this.last || diffScore(this.last, thumb) > CHANGE_THRESHOLD) this.unchangedSince = this.now()
      this.last = thumb
    }

    const newSite = (await this.safeTitles()).find((t) => ANSWER_SITES.test(t) && !this.baselineSites.has(t))
    if (newSite) {
      this.baselineSites.add(newSite) // only nudge once per window
      this.set({ level: 2, reason: `you opened ${siteName(newSite)}` })
      return
    }
    if (this.snoozed()) return

    const idle = this.now() - this.unchangedSince
    if (this.wrongStreak >= STUCK_TIMING.wrongStreakForBubble) {
      this.set({ level: 2, reason: `${this.wrongStreak} wrong answers in a row` })
    } else if (idle >= STUCK_TIMING.bubbleAfterMs) {
      this.set({ level: 2, reason: `your screen hasn't changed in ${Math.round(idle / 60_000)} min` })
    } else if (idle >= STUCK_TIMING.glowAfterMs) {
      this.set({ level: 1, reason: 'no progress for a minute' })
    } else if (this.state.level > 0) {
      this.set({ level: 0, reason: null })
    }
  }

  private snoozed(): boolean {
    return this.now() < this.snoozedUntil
  }

  private async safeTitles(): Promise<string[]> {
    try {
      return await this.deps.windowTitles()
    } catch {
      return []
    }
  }

  private set(next: StuckState): void {
    if (next.level === this.state.level && next.reason === this.state.reason) return
    this.state = next
    this.deps.onChange(next)
  }
}

function siteName(title: string): string {
  return title.match(ANSWER_SITES)?.[0] ?? 'an answer site'
}
