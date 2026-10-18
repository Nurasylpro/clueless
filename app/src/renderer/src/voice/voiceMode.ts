// Voice mode (replies read aloud, mic a click away), shared by everything in this window: the
// session's voice controls and the Ask card's step-by-step narration. Saved across restarts.
import { useSyncExternalStore } from 'react'

const KEY = 'clueless.voiceMode'
const listeners = new Set<() => void>()

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

let on = load()

export const voiceMode = {
  get: (): boolean => on,
  set(next: boolean): void {
    if (next === on) return
    on = next
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      // storage unavailable: the setting just won't persist
    }
    listeners.forEach((cb) => cb())
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }
}

export function useVoiceMode(): boolean {
  return useSyncExternalStore(voiceMode.subscribe, voiceMode.get)
}
