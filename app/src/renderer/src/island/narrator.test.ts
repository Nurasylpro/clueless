import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TtsResult } from '../../../shared/contracts'
import { createNarrator } from './narrator'

const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve() }

class FakeAudio {
  static latest: FakeAudio
  paused = true
  preservesPitch = true
  src = ''
  playbackRate = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { FakeAudio.latest = this }
  async play(): Promise<void> { this.paused = false }
  pause(): void { this.paused = true }
  removeAttribute(): void { this.src = '' }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('animation narrator', () => {
  it('never substitutes a system voice after a service failure, and recovers on the next line', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Audio', FakeAudio)
    const builtIn = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak: builtIn, cancel: vi.fn() })
    const notice = vi.fn()
    const tts = vi.fn(async ({ text }: { text: string }): Promise<TtsResult> => text.startsWith('Intro')
      ? { ok: false, reason: 'error', message: 'Temporary outage.' }
      : { ok: true, audio: new ArrayBuffer(3), mime: 'audio/mpeg' })
    const narrator = createNarrator((i) => i < 0 ? 'Intro' : 'Next line', 1, tts, 1, notice)
    const done = vi.fn()
    narrator.warm()
    narrator.say(-1, done)
    await flush()
    expect(builtIn).not.toHaveBeenCalled()
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('Temporary outage'))
    vi.runAllTimers()
    expect(done).toHaveBeenCalledOnce()
    narrator.say(0, done)
    await flush()
    expect(FakeAudio.latest.paused).toBe(false)
    expect(notice).toHaveBeenLastCalledWith(null)
    FakeAudio.latest.onended?.()
    expect(done).toHaveBeenCalledTimes(2)
    narrator.dispose()
  })

  it('ignores audio returned after stopping and reuses downloads across effect restarts', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    const tts = vi.fn(async (): Promise<TtsResult> => ({ ok: true, audio: new ArrayBuffer(3), mime: 'audio/mpeg' }))
    const narrator = createNarrator(() => 'Hello', 1, tts)
    narrator.warm()
    const done = vi.fn()
    const stop = narrator.say(-1, done)
    stop()
    narrator.dispose()
    narrator.warm()
    await flush()
    expect(tts).toHaveBeenCalledTimes(2) // intro and first step, not downloaded again
    expect(done).not.toHaveBeenCalled()
    narrator.dispose()
  })
})
