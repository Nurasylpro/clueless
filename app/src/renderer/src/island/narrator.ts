// Reads the animation's lines aloud, in step with it: ElevenLabs (through the main process) when a
// key is set, the computer's own voice otherwise. While one line plays, the next ones are already
// downloading, so the voice moves from step to step without a pause. Speed changes how fast it
// talks without changing its pitch. If no voice works at all, it waits about as long as the line
// takes to read, so the animation never gets stuck.
import type { TtsRequest, TtsResult } from '../../../shared/contracts'
import { toSpeech } from '../../../shared/speechText'
import { pickVoice } from '../voice/speech'
import type { Speaker } from './tracePlayback'

export interface Narrator extends Speaker {
  setRate(rate: number): void
  /** Start downloading the first lines before the animation needs them. */
  warm(): void
  dispose(): void
}

type Tts = (req: TtsRequest) => Promise<TtsResult>

const PREFETCH = 3 // lines downloaded ahead of the one playing

export function createNarrator(
  line: (index: number) => string, // -1 = the intro
  count: number, // steps; lines go from -1 to count - 1
  tts: Tts | null,
  rate = 1
): Narrator {
  const audio: Map<number, Promise<TtsResult>> = new Map()
  let cloud = Boolean(tts) // off after the first "no key" / failure: the rest uses the computer's voice
  let generation = 0
  let player: HTMLAudioElement | null = null
  let url: string | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined

  const text = (i: number): string => (i >= -1 && i < count ? toSpeech(line(i)) : '')

  const fetchLine = (i: number): Promise<TtsResult> | null => {
    if (!cloud || !tts || i < -1 || i >= count || !text(i)) return null
    let p = audio.get(i)
    if (!p) {
      p = tts({ text: text(i), previousText: text(i - 1) || undefined, nextText: text(i + 1) || undefined }).catch(
        (err): TtsResult => ({ ok: false, reason: 'error', message: String(err) })
      )
      audio.set(i, p)
    }
    return p
  }

  const prefetch = (from: number): void => {
    for (let i = from; i < Math.min(count, from + PREFETCH); i++) void fetchLine(i)
  }

  const clear = (): void => {
    clearTimeout(fallbackTimer)
    if (player) {
      player.onended = null
      player.onerror = null
      player.pause()
      player.removeAttribute('src')
    }
    if (url) URL.revokeObjectURL(url)
    url = null
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    } catch {
      // nothing playing
    }
  }

  /** The computer's own voice. Calls `done` at the end, or after a reading-time guess if the
   *  engine never says it's finished (some don't), so the animation keeps moving. */
  const builtIn = (words: string, gen: number, done: () => void): void => {
    const wordCount = words.split(/\s+/).filter(Boolean).length
    const guess = (900 + wordCount * 380) / rate
    let finished = false
    const finish = (): void => {
      if (finished || gen !== generation) return
      finished = true
      clearTimeout(fallbackTimer)
      done()
    }
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      fallbackTimer = setTimeout(finish, guess)
      return
    }
    const u = new SpeechSynthesisUtterance(words)
    const voice = pickVoice(speechSynthesis.getVoices(), navigator.language || 'en-US')
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    }
    u.rate = rate
    u.onend = finish
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') finish()
    }
    fallbackTimer = setTimeout(finish, guess * 2 + 4000) // the engine dropped `end`: move on anyway
    speechSynthesis.speak(u)
  }

  const say = (index: number, done: () => void): (() => void) => {
    const gen = ++generation
    clear()
    const words = text(index)
    if (!words) {
      fallbackTimer = setTimeout(() => gen === generation && done(), 0)
      return stop
    }
    prefetch(index + 1)
    const pending = fetchLine(index)
    if (!pending) {
      builtIn(words, gen, done)
      return stop
    }
    void pending.then(async (res) => {
      if (gen !== generation) return
      if (!res.ok) {
        cloud = false // no key, or the service failed: the computer's voice from here on
        return builtIn(words, gen, done)
      }
      url = URL.createObjectURL(new Blob([res.audio], { type: res.mime }))
      const a = (player ??= new Audio())
      a.preservesPitch = true
      a.src = url
      a.playbackRate = rate
      a.onended = () => gen === generation && done()
      a.onerror = () => gen === generation && builtIn(words, gen, done)
      try {
        await a.play()
      } catch {
        if (gen === generation && a.paused) builtIn(words, gen, done)
      }
    })
    return stop
  }

  function stop(): void {
    generation++
    clear()
  }

  return {
    say,
    setRate: (next) => {
      rate = next
      if (player) player.playbackRate = next
    },
    warm: () => prefetch(-1),
    dispose: () => {
      stop()
      audio.clear()
    }
  }
}
