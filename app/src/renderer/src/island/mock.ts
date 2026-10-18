// A browser stand-in for `window.island` (`npm run ui`). It runs the real IslandController with a
// fake Claude that answers after a short delay: code gets the Contains Duplicate trace, anything
// else gets a text answer. No Electron, no API key.
import type { CodeSpot, IslandApi, IslandView } from '../../../shared/contracts'
import { IslandController, type TracerLike } from '../../../shared/islandController'
import type { TraceReply } from '../../../shared/trace'
import { CONTAINS_DUPLICATE } from './fixtures'

const THINK_MS = 1600

export interface IslandMock extends IslandApi {
  /** The page found a highlight (the real app does this with a mouse hook), and where it is. */
  select(text: string, spot: CodeSpot | null): void
  /** The page scrolled. */
  scrolled(): void
  onHidden(cb: (hidden: boolean) => void): () => void
  show(): void
}

const looksLikeCode = (text: string): boolean => /[=(){}[\]:;]/.test(text) && /\n|def |for |if |return/.test(text)

const fakeTracer = (): TracerLike => {
  const reply = (animate: boolean, text: string): Promise<TraceReply> =>
    new Promise((resolve) =>
      setTimeout(() => {
        if (animate && looksLikeCode(text)) resolve(CONTAINS_DUPLICATE)
        else
          resolve({
            message: looksLikeCode(text)
              ? 'This loop walks through `nums` and keeps every number it has met in a **set** called `seen`. Before adding a number it checks whether `seen` already has it. What does that tell you the moment the check is true?'
              : 'This asks whether **any value appears at least twice** in the array. You only need to know *whether* you have seen a number before, not how many times.',
            trace: null
          })
      }, THINK_MS)
    )
  let snippet = ''
  return {
    ask: (input) => {
      snippet = input.snippet
      return reply(input.animate, input.snippet)
    },
    followUp: (_text, animate) => reply(animate, snippet)
  }
}

export function createIslandMock(): IslandMock {
  const listeners = new Set<(v: IslandView) => void>()
  const hiddenListeners = new Set<(h: boolean) => void>()
  let pending: { text: string; spot: CodeSpot | null } | null = null
  let asked: CodeSpot | null = null

  const controller = new IslandController({
    makeTracer: fakeTracer,
    capture: async () => ({ image: null, spot: asked }),
    emit: (view) => listeners.forEach((cb) => cb(view)),
    schedule: (fn, ms) => {
      const t = setTimeout(fn, ms)
      return () => clearTimeout(t)
    },
    now: () => Date.now()
  })

  const setHidden = (hidden: boolean): void => hiddenListeners.forEach((cb) => cb(hidden))

  return {
    getView: async () => controller.current,
    onView: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    setAnimate: (on) => controller.setAnimate(on),
    setAskOnHighlight: (on) => controller.setAskOnHighlight(on),
    followUp: (text) => void controller.followUp(text),
    close: () => controller.close(),
    hide: () => {
      controller.close()
      setHidden(true)
    },
    show: () => setHidden(false),
    resize: () => {},
    ask: () => {
      if (!pending) return
      asked = pending.spot
      void controller.ask(pending.text)
    },
    play: () => controller.play(),
    pause: () => controller.pause(),
    step: (delta) => controller.step(delta),
    replay: () => controller.replay(),
    stop: () => controller.stopPlayback(),
    stepDone: (nonce, index) => controller.stepDone(nonce, index),
    setNarrated: (on) => controller.setNarrated(on),
    select: (text, spot) => {
      pending = { text, spot }
    },
    scrolled: () => controller.scrolled(),
    onHidden: (cb) => {
      hiddenListeners.add(cb)
      return () => hiddenListeners.delete(cb)
    }
  }
}
