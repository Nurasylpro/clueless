import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTAINS_DUPLICATE } from './fixtures'
import { gapMs, holdMs, SPEEDS, TracePlayback, type Speaker } from './tracePlayback'
import { valuesAt } from './traceState'

const trace = CONTAINS_DUPLICATE.trace
/** Time from the start until step `index` begins (silent, normal speed). */
const until = (index: number, rate = 1): number => {
  let ms = 0
  for (let i = -1; i < index; i++) ms += holdMs(trace, i, rate)
  return ms
}

describe('silent playback', () => {
  let player: TracePlayback

  beforeEach(() => {
    vi.useFakeTimers()
    player = new TracePlayback(trace)
    player.start()
  })

  afterEach(() => {
    player.dispose()
    vi.useRealTimers()
  })

  it('holds each step long enough to read its line', () => {
    const long = trace.steps.findIndex((s) => s.say.split(' ').length >= 9)
    expect(holdMs(trace, long)).toBeGreaterThan(2400)
    vi.advanceTimersByTime(until(3) - 1)
    expect(player.getSnapshot().index).toBe(2)
    vi.advanceTimersByTime(1)
    expect(player.getSnapshot().index).toBe(3)
  })

  it('can pause during the introduction and resume its remaining time', () => {
    vi.advanceTimersByTime(500)
    player.togglePause()
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot()).toEqual({ index: -1, paused: true, done: false })
    player.togglePause()
    vi.advanceTimersByTime(holdMs(trace, -1) - 501)
    expect(player.getSnapshot().index).toBe(-1)
    vi.advanceTimersByTime(1)
    expect(player.getSnapshot().index).toBe(0)
  })

  it('goes back exactly one step, restores earlier values, and stays paused', () => {
    vi.advanceTimersByTime(until(5))
    expect(valuesAt(trace, player.getSnapshot().index).seen.items).toEqual(['3'])
    player.back()
    expect(player.getSnapshot()).toEqual({ index: 4, paused: true, done: false })
    expect(valuesAt(trace, player.getSnapshot().index).seen.items).toEqual([])
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot().index).toBe(4)
    player.togglePause()
    vi.advanceTimersByTime(holdMs(trace, 4))
    expect(player.getSnapshot().index).toBe(5)
  })

  it('never goes before the first step and allows going back after completion', () => {
    player.back()
    expect(player.getSnapshot().index).toBe(-1)
    vi.runAllTimers()
    expect(player.getSnapshot().done).toBe(true)
    player.togglePause()
    expect(player.getSnapshot().done).toBe(true)
    player.back()
    expect(player.getSnapshot()).toEqual({ index: trace.steps.length - 2, paused: true, done: false })
  })

  it('slow and fast change the pace, even in the middle of a step', () => {
    vi.advanceTimersByTime(until(0) + 1000)
    player.setRate(SPEEDS.slow)
    // The rest of step 0 now takes longer: (hold - 1000) / 0.8
    vi.advanceTimersByTime(Math.round((holdMs(trace, 0) - 1000) / SPEEDS.slow) - 5)
    expect(player.getSnapshot().index).toBe(0)
    vi.advanceTimersByTime(5)
    expect(player.getSnapshot().index).toBe(1)
    expect(holdMs(trace, 1, SPEEDS.fast)).toBeLessThan(holdMs(trace, 1, SPEEDS.normal))
  })

  it('cancels timers on cleanup and tolerates an effect being restarted', () => {
    vi.advanceTimersByTime(300)
    player.dispose()
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot().index).toBe(-1)
    player.start()
    player.start()
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('playback in step with the voice', () => {
  let said: number[]
  let stops: number
  let finish: (() => void) | null
  let player: TracePlayback
  const speaker: Speaker = {
    say: (index, done) => {
      said.push(index)
      finish = done
      return () => {
        stops++
        finish = null
      }
    }
  }
  /** The voice finishes the current line. */
  const spoken = (): void => {
    const f = finish
    finish = null
    f?.()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    said = []
    stops = 0
    finish = null
    player = new TracePlayback(trace, 1, speaker)
    player.start()
  })

  afterEach(() => {
    player.dispose()
    vi.useRealTimers()
  })

  it('says the intro, then waits for each line to be said before moving on', () => {
    expect(said).toEqual([-1])
    vi.advanceTimersByTime(60_000) // a slow voice: the animation waits
    expect(player.getSnapshot().index).toBe(-1)
    spoken()
    vi.advanceTimersByTime(gapMs(trace, -1) - 1)
    expect(player.getSnapshot().index).toBe(-1)
    vi.advanceTimersByTime(1)
    expect(player.getSnapshot().index).toBe(0)
    expect(said).toEqual([-1, 0])
  })

  it('pause stops the voice; resume says the same line again from the start', () => {
    spoken()
    vi.advanceTimersByTime(gapMs(trace, -1))
    expect(said).toEqual([-1, 0])
    player.togglePause()
    expect(stops).toBe(1)
    player.togglePause()
    expect(said).toEqual([-1, 0, 0])
    expect(player.getSnapshot().index).toBe(0)
  })

  it('back is silent until resumed', () => {
    for (let i = 0; i < 3; i++) {
      spoken()
      vi.advanceTimersByTime(10_000)
    }
    expect(player.getSnapshot().index).toBe(2)
    const before = said.length
    player.back()
    expect(player.getSnapshot()).toEqual({ index: 1, paused: true, done: false })
    expect(said.length).toBe(before)
    player.togglePause()
    expect(said.at(-1)).toBe(1)
  })

  it('a line that finishes after the student paused is ignored', () => {
    const late = finish
    player.togglePause()
    late?.()
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot()).toEqual({ index: -1, paused: true, done: false })
  })
})
