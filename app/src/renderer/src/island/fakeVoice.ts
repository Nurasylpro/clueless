// The browser preview (`npm run ui`) has no Deepgram, so the mic pretends you said a question:
// the words appear one by one, like the real live transcript, and then it's sent.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceInput, VoiceInputState } from '../voice/useVoiceInput'

const SAID = ['what', 'does', 'this', 'loop', 'do', 'with', 'seen?']

export function useFakeVoiceInput(onFinal: (text: string) => void): VoiceInput {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [heard, setHeard] = useState('')
  const [level, setLevel] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const final = useRef(onFinal)
  final.current = onFinal

  const clear = (): void => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => clear, [])

  const start = useCallback(async (): Promise<void> => {
    clear()
    setState('starting')
    setHeard('')
    const at = (ms: number, fn: () => void): void => {
      timers.current.push(setTimeout(fn, ms))
    }
    at(400, () => setState('listening'))
    SAID.forEach((_, i) =>
      at(700 + i * 320, () => {
        setHeard(SAID.slice(0, i + 1).join(' '))
        setLevel(0.2 + Math.random() * 0.4)
      })
    )
    const end = 700 + SAID.length * 320 + 600
    at(end, () => {
      setState('finishing')
      setLevel(0)
    })
    at(end + 300, () => {
      setState('idle')
      setHeard('')
      final.current(SAID.join(' '))
    })
  }, [])

  const stop = useCallback((): void => {
    clear()
    setState('idle')
    setLevel(0)
    setHeard((h) => {
      if (h) final.current(h)
      return ''
    })
  }, [])

  const cancel = useCallback((): void => {
    clear()
    setState('idle')
    setHeard('')
    setLevel(0)
  }, [])

  return { state, heard, interim: '', level, notice: null, start, stop, cancel }
}
