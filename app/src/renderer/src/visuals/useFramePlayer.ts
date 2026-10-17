// Plays a visual's frames once, in order, then freezes on the last one (no looping).
import { useEffect, useState } from 'react'

export const FRAME_MS = 1100

export interface FramePlayer {
  index: number
  done: boolean
  /** Jump to a frame and stop there. */
  jump(index: number): void
}

/** `nonce` restarts playback from frame 1 whenever it changes (the Replay button). */
export function useFramePlayer(count: number, nonce: number): FramePlayer {
  const [state, setState] = useState({ index: 0, playing: count > 1 })

  useEffect(() => setState({ index: 0, playing: count > 1 }), [count, nonce])

  useEffect(() => {
    if (!state.playing) return
    const timer = setTimeout(() => {
      setState((s) => (s.index + 1 >= count - 1 ? { index: count - 1, playing: false } : { index: s.index + 1, playing: true }))
    }, FRAME_MS)
    return () => clearTimeout(timer)
  }, [state, count])

  const index = Math.max(0, Math.min(state.index, count - 1))
  return {
    index,
    done: !state.playing,
    jump: (i) => setState({ index: Math.max(0, Math.min(i, count - 1)), playing: false })
  }
}
