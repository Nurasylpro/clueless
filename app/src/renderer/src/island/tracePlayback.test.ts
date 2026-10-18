import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTAINS_DUPLICATE } from './fixtures'
import { INTRO_MS, STEP_MS, TracePlayback } from './tracePlayback'
import { valuesAt } from './traceState'
import { stepDuration } from './traceExpression'

describe('trace playback controls', () => {
  let player: TracePlayback
  const trace = CONTAINS_DUPLICATE.trace

  beforeEach(() => {
    vi.useFakeTimers()
    player = new TracePlayback(trace)
    player.start()
  })

  afterEach(() => {
    player.dispose()
    vi.useRealTimers()
  })

  it('can pause during the introduction and resume its remaining time', () => {
    vi.advanceTimersByTime(500)
    player.togglePause()
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot()).toEqual({ index: -1, paused: true, done: false })
    player.togglePause()
    vi.advanceTimersByTime(INTRO_MS - 501)
    expect(player.getSnapshot().index).toBe(-1)
    vi.advanceTimersByTime(1)
    expect(player.getSnapshot().index).toBe(0)
  })

  it('holds the current step and resumes without skipping or restarting its full duration', () => {
    vi.advanceTimersByTime(INTRO_MS + 800)
    player.togglePause()
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot().index).toBe(0)
    player.togglePause()
    vi.advanceTimersByTime(STEP_MS - 801)
    expect(player.getSnapshot().index).toBe(0)
    vi.advanceTimersByTime(1)
    expect(player.getSnapshot().index).toBe(1)
  })

  it('goes back exactly one step, restores earlier values, and stays paused', () => {
    vi.advanceTimersByTime(INTRO_MS + STEP_MS * 5)
    expect(valuesAt(trace, player.getSnapshot().index).seen.items).toEqual(['3'])
    player.back()
    expect(player.getSnapshot()).toEqual({ index: 4, paused: true, done: false })
    expect(valuesAt(trace, player.getSnapshot().index).seen.items).toEqual([])
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot().index).toBe(4)
    player.back()
    expect(player.getSnapshot().index).toBe(3)
    player.togglePause()
    vi.advanceTimersByTime(STEP_MS)
    expect(player.getSnapshot().index).toBe(4)
  })

  it('never goes before the first step and allows going back after completion', () => {
    player.back()
    expect(player.getSnapshot().index).toBe(-1)
    vi.advanceTimersByTime(INTRO_MS)
    player.back()
    expect(player.getSnapshot().index).toBe(0)
    vi.runAllTimers()
    expect(player.getSnapshot().done).toBe(true)
    player.togglePause()
    expect(player.getSnapshot().done).toBe(true)
    player.back()
    expect(player.getSnapshot()).toEqual({ index: trace.steps.length - 2, paused: true, done: false })
    player.togglePause()
    vi.advanceTimersByTime(stepDuration(trace, trace.steps.length - 2, STEP_MS))
    expect(player.getSnapshot().index).toBe(trace.steps.length - 1)
    expect(player.getSnapshot().done).toBe(false)
    vi.advanceTimersByTime(stepDuration(trace, trace.steps.length - 1, STEP_MS))
    expect(player.getSnapshot().done).toBe(true)
  })

  it('preserves a meaningful step’s longer hold when paused', () => {
    vi.advanceTimersByTime(INTRO_MS + STEP_MS * 16 + 500)
    expect(player.getSnapshot().index).toBe(16)
    player.togglePause()
    player.togglePause()
    vi.advanceTimersByTime(2899)
    expect(player.getSnapshot().index).toBe(16)
    vi.advanceTimersByTime(1)
    expect(player.getSnapshot().index).toBe(17)
  })

  it('cancels timers on cleanup and tolerates an effect being restarted', () => {
    vi.advanceTimersByTime(300)
    player.dispose()
    vi.advanceTimersByTime(60_000)
    expect(player.getSnapshot().index).toBe(-1)
    player.start()
    player.start()
    vi.advanceTimersByTime(INTRO_MS - 300)
    expect(player.getSnapshot().index).toBe(0)
    expect(vi.getTimerCount()).toBe(1)
  })
})
