import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TtsRequest, TtsResult } from '../../../shared/contracts'
import { createBrowserSpeech, createCloudSpeech, pickVoice, type SynthLike } from './speech'

class FakeUtterance {
  voice: unknown = null
  lang = ''
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(readonly text: string) {}
}

class FakeSynth implements SynthLike {
  spoken: FakeUtterance[] = []
  speaking = false
  pending = false
  paused = false
  voices: SpeechSynthesisVoice[] = [{ name: 'Default', lang: 'en-US', localService: true, default: true } as SpeechSynthesisVoice]
  speak(u: SpeechSynthesisUtterance): void {
    this.spoken.push(u as unknown as FakeUtterance)
    this.speaking = true
  }
  cancel(): void {
    const current = this.spoken.at(-1)
    this.speaking = false
    current?.onerror?.({ error: 'interrupted' })
  }
  pause(): void {
    this.paused = true
  }
  resume(): void {
    this.paused = false
  }
  getVoices(): SpeechSynthesisVoice[] {
    return this.voices
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  /** The current chunk finished. */
  finish(): void {
    this.speaking = false
    this.spoken.at(-1)?.onend?.()
  }
}

function make() {
  const synth = new FakeSynth()
  const speech = createBrowserSpeech(synth, FakeUtterance as unknown as typeof SpeechSynthesisUtterance, 'en-US')
  const states: string[] = []
  speech.subscribe((s) => states.push(s.state))
  return { synth, speech, states }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createBrowserSpeech', () => {
  it('speaks sentence chunks in order, then goes idle', async () => {
    const { synth, speech } = make()
    speech.speak('First sentence. ' + 'word '.repeat(60) + 'end.')
    await vi.runAllTicks()
    await Promise.resolve()
    expect(speech.snapshot().state).toBe('speaking')
    expect(synth.spoken).toHaveLength(1)
    while (speech.snapshot().state === 'speaking') synth.finish()
    expect(synth.spoken.length).toBeGreaterThan(1)
    expect(synth.spoken.map((u) => u.text).join(' ')).toContain('First sentence.')
    expect(speech.snapshot().state).toBe('idle')
  })

  it('a newer reply replaces the old one; the old one never resumes', async () => {
    const { synth, speech } = make()
    speech.speak('Old reply here.')
    await Promise.resolve()
    const old = synth.spoken[0]
    speech.speak('New reply.')
    await Promise.resolve()
    expect(synth.spoken.at(-1)?.text).toBe('New reply.')
    old.onend?.() // a late event from the first reply
    expect(synth.spoken.at(-1)?.text).toBe('New reply.')
    expect(speech.snapshot().error).toBeNull()
  })

  it('pause, resume and stop', async () => {
    const { synth, speech } = make()
    speech.speak('Hello there.')
    await Promise.resolve()
    speech.pause()
    expect(synth.paused).toBe(true)
    expect(speech.snapshot().state).toBe('paused')
    speech.resume()
    expect(speech.snapshot().state).toBe('speaking')
    speech.stop()
    expect(speech.snapshot().state).toBe('idle')
    expect(speech.snapshot().error).toBeNull() // our own stop is not an error
  })

  it('a playback failure is reported and the state resets', async () => {
    const { synth, speech } = make()
    speech.speak('Hello.')
    await Promise.resolve()
    synth.spoken[0].onerror?.({ error: 'synthesis-failed' })
    expect(speech.snapshot()).toEqual({ state: 'idle', error: expect.stringContaining("Couldn't play") })
  })

  it('moves on when the engine never fires end', async () => {
    const { synth, speech } = make()
    speech.speak('Only one.')
    await Promise.resolve()
    synth.speaking = false // the engine went quiet without telling us
    vi.advanceTimersByTime(2000)
    expect(speech.snapshot().state).toBe('idle')
  })

  it('without speechSynthesis it explains instead of throwing', () => {
    const speech = createBrowserSpeech(undefined, undefined, 'en-US')
    expect(speech.available).toBe(false)
    speech.speak('Hi')
    expect(speech.snapshot()).toEqual({ state: 'idle', error: expect.stringContaining("aren't available") })
  })
})

describe('pickVoice', () => {
  const v = (name: string, lang: string, localService = true) => ({ name, lang, localService, default: false }) as SpeechSynthesisVoice
  it('prefers the student language and natural voices', () => {
    const voices = [v('Microsoft Zira', 'en-US'), v('Thomas', 'fr-FR'), v('Microsoft Aria Online (Natural)', 'en-US', false)]
    expect(pickVoice(voices, 'en-US')?.name).toBe('Microsoft Aria Online (Natural)')
    expect(pickVoice(voices, 'fr-FR')?.name).toBe('Thomas')
    expect(pickVoice([], 'en-US')).toBeNull()
  })
})

class FakeAudio {
  src = ''
  paused = true
  plays = 0
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  async play(): Promise<void> {
    this.paused = false
    this.plays++
  }
  pause(): void {
    this.paused = true
  }
  removeAttribute(): void {
    this.src = ''
  }
  end(): void {
    this.paused = true
    this.onended?.()
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

function makeCloud(result: (text: string) => TtsResult) {
  const synth = new FakeSynth()
  const fallback = createBrowserSpeech(synth, FakeUtterance as unknown as typeof SpeechSynthesisUtterance, 'en-US')
  const requests: TtsRequest[] = []
  const audio = new FakeAudio()
  const cloud = createCloudSpeech(
    async (req) => {
      requests.push(req)
      return result(req.text)
    },
    fallback,
    () => audio as unknown as HTMLAudioElement
  )
  return { cloud, synth, audio, requests }
}

const ok = (): TtsResult => ({ ok: true, audio: new Uint8Array([1]).buffer, mime: 'audio/mpeg' })

describe('createCloudSpeech', () => {
  it('plays ElevenLabs audio piece by piece with neighbouring text, prefetching the next', async () => {
    const { cloud, audio, requests } = makeCloud(ok)
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here and it keeps going a while.`).join(' ')
    cloud.speak(long)
    await flush()
    expect(cloud.snapshot().state).toBe('speaking')
    expect(audio.plays).toBe(1)
    expect(requests.length).toBe(2) // the first piece plus the prefetched second
    expect(requests[1].previousText).toBe(requests[0].text)
    while (cloud.snapshot().state === 'speaking') {
      audio.end()
      await flush()
    }
    expect(cloud.snapshot()).toEqual({ state: 'idle', error: null })
  })

  it('no key: the built-in voice reads it, with no error shown', async () => {
    const { cloud, synth } = makeCloud(() => ({ ok: false, reason: 'no-key', message: '' }))
    cloud.speak('Which digit repeats?')
    await flush()
    expect(synth.spoken.map((u) => u.text)).toEqual(['Which digit repeats?'])
    expect(cloud.snapshot()).toEqual({ state: 'speaking', error: null })
    synth.finish()
    expect(cloud.snapshot()).toEqual({ state: 'idle', error: null })
  })

  it('an ElevenLabs failure continues in the built-in voice and says why', async () => {
    const { cloud, synth } = makeCloud(() => ({ ok: false, reason: 'error', message: 'Your ElevenLabs credits have run out.' }))
    cloud.speak('Hello.')
    await flush()
    synth.finish()
    expect(cloud.snapshot()).toEqual({ state: 'idle', error: expect.stringContaining('credits have run out') })
  })

  it('pause, resume, stop, and a newer reply replacing the old one', async () => {
    const { cloud, audio, requests } = makeCloud(ok)
    cloud.speak('First reply.')
    await flush()
    cloud.pause()
    expect(audio.paused).toBe(true)
    expect(cloud.snapshot().state).toBe('paused')
    cloud.resume()
    expect(cloud.snapshot().state).toBe('speaking')
    cloud.speak('Second reply.')
    await flush()
    expect(requests.at(-1)?.text).toBe('Second reply.')
    cloud.stop()
    expect(audio.src).toBe('')
    expect(cloud.snapshot().state).toBe('idle')
  })
})
