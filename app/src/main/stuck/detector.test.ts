import { describe, expect, it, vi } from 'vitest'
import type { StuckState } from '../../shared/contracts'
import { StuckDetector, diffScore, STUCK_TIMING } from './detector'

function setup(titles: string[] = []) {
  let t = 0
  const frame = new Uint8Array(64).fill(100)
  const deps = {
    thumbnail: vi.fn(async () => frame),
    windowTitles: vi.fn(async () => titles),
    isCluelessFocused: () => false,
    onChange: vi.fn((_: StuckState) => {}),
    now: () => t
  }
  const detector = new StuckDetector(deps)
  return { detector, deps, advance: (ms: number) => (t += ms), titles }
}

describe('diffScore', () => {
  it('is 0 for identical images and large for different ones', () => {
    expect(diffScore(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(0)
    expect(diffScore(new Uint8Array([0, 0]), new Uint8Array([200, 200]))).toBe(200)
  })
})

describe('StuckDetector', () => {
  it('glows after a minute without change, then shows the bubble', async () => {
    const { detector, advance } = setup()
    await detector.start()
    await detector.tick()
    advance(STUCK_TIMING.glowAfterMs)
    await detector.tick()
    expect(detector.current.level).toBe(1)
    advance(STUCK_TIMING.bubbleAfterMs - STUCK_TIMING.glowAfterMs)
    await detector.tick()
    expect(detector.current.level).toBe(2)
    detector.stop()
  })

  it('stays quiet after "I\'m fine"', async () => {
    const { detector, advance } = setup()
    await detector.start()
    await detector.tick() // first frame sets the baseline
    advance(STUCK_TIMING.bubbleAfterMs)
    await detector.tick()
    expect(detector.current.level).toBe(2)
    detector.snooze()
    advance(STUCK_TIMING.bubbleAfterMs)
    await detector.tick()
    expect(detector.current.level).toBe(0)
    detector.stop()
  })

  it('nudges on 3 wrong answers in a row', async () => {
    const { detector } = setup()
    await detector.start()
    detector.noteWrongStreak(2)
    expect(detector.current.level).toBe(0)
    detector.noteWrongStreak(3)
    expect(detector.current).toEqual({ level: 2, reason: '3 wrong answers in a row' })
    detector.stop()
  })

  it('notices an answer site opened after the session started, but not one already open', async () => {
    const { detector, titles } = setup(['Chegg - old tab'])
    await detector.start()
    await detector.tick()
    expect(detector.current.level).toBe(0)
    titles.push('ChatGPT - Google Chrome')
    await detector.tick()
    expect(detector.current).toEqual({ level: 2, reason: 'you opened ChatGPT' })
    detector.stop()
  })
})
