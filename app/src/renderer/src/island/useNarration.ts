// Voice and animation in step: with voice on, each step of the animation on the code is read
// aloud, and the island controller moves to the next step only once that line has been said
// (stepDone). The intro reads the answer itself. Text-only answers are read like tutor replies.
import { useEffect, useRef } from 'react'
import type { IslandView } from '../../../shared/contracts'
import { narrateStep } from '../../../shared/narrate'
import { toSpeech } from '../../../shared/speechText'
import { speech } from '../voice/speaker'
import { useVoiceMode } from '../voice/voiceMode'
import { islandApi } from './api'

export function useNarration(view: IslandView | null): void {
  const voiceOn = useVoiceMode()
  // Hidden panel: nothing is read aloud, so don't wait for it.
  useEffect(() => {
    const report = (): void => islandApi.setNarrated(voiceOn && document.visibilityState === 'visible')
    report()
    document.addEventListener('visibilitychange', report)
    return () => document.removeEventListener('visibilitychange', report)
  }, [voiceOn])

  const live = useRef(view)
  live.current = view
  const p = view?.playback ?? null
  const last = view?.trace ? view.trace.steps.length - 1 : -1
  const answer = [...(view?.messages ?? [])].reverse().find((m) => m.role === 'clueless')?.text ?? null

  // Read the current step (or the answer, before step 1) whenever it changes, or play resumes.
  const speaking = useRef<string | null>(null)
  const key = p && (p.playing || p.index === last) ? `${p.nonce}:${p.index}` : null
  useEffect(() => {
    if (!voiceOn || !key || !p) return
    const v = live.current
    if (!v?.trace) return
    const { nonce, index } = p
    const text = index < 0 ? toSpeech(answer ?? '') : narrateStep(v.trace, index).speech
    speaking.current = key
    speech.speak(text, () => {
      if (speaking.current === key) speaking.current = null
      islandApi.stepDone(nonce, index)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers nonce, index and play/pause
  }, [key, voiceOn])

  // Paused mid-way, or the animation was taken off the screen: stop talking.
  const paused = Boolean(p && !p.playing && p.index < last)
  useEffect(() => {
    if ((paused || !p) && speaking.current) {
      speaking.current = null
      speech.stop()
    }
  }, [paused, p])

  // A text-only answer (nothing to animate): read it like a tutor reply.
  const count = view?.messages.length ?? 0
  const seen = useRef(count)
  useEffect(() => {
    const grew = count > seen.current
    seen.current = count
    const v = live.current
    if (!grew || !voiceOn || !v || v.playback || v.phase !== 'answer' || !answer) return
    if (v.messages[v.messages.length - 1]?.role === 'clueless') speech.speak(toSpeech(answer))
  }, [count, voiceOn, answer])
}
