// React view of the shared speech service.
import { useEffect, useState } from 'react'
import { speech } from './speaker'
import type { SpeechSnapshot } from './speech'

export function useSpeech(): SpeechSnapshot {
  const [snap, setSnap] = useState<SpeechSnapshot>(speech.snapshot())
  useEffect(() => speech.subscribe(setSnap), [])
  return snap
}
