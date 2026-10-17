// Which animation is playing. One at a time: in the panel (explain mode) or over the code (code mode).
import { createContext, useContext } from 'react'
import type { TurnAnimation, TurnView, Visual } from '../../../shared/contracts'

export interface Playing {
  itemId: string // the tutor turn it belongs to
  visual: Visual
  message: string // the turn's text: text and visual always go together
  animation: TurnAnimation | null
  nonce: number // bumps on Replay
}

export interface Playback {
  playing: Playing | null
  play(itemId: string, turn: TurnView): void
  replay(): void
  stop(): void
}

/** Code mode: the turn came from "Animate my code" and knows where the code is on screen. */
export function playsOnCode(animation: TurnAnimation | null): boolean {
  return animation?.target === 'code' && Boolean(animation.area)
}

export const PlaybackContext = createContext<Playback>({ playing: null, play() {}, replay() {}, stop() {} })

export const usePlayback = (): Playback => useContext(PlaybackContext)
