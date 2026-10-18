// A browser stand-in for `window.island` (`npm run ui`). It runs the real IslandController with a
// fake Claude that replays a matching demo after a short delay. No Electron, no API key.
import type { IslandApi, IslandView } from '../../../shared/contracts'
import { IslandController, type TracerLike } from '../../../shared/islandController'
import type { TraceReply } from '../../../shared/trace'
import { demoReplyFor } from './fixtures'

const THINK_MS = 1600

export interface IslandMock extends IslandApi {
  /** The page found a highlight (the real app does this with a mouse hook). */
  select(text: string): void
  onHidden(cb: (hidden: boolean) => void): () => void
  show(): void
  hide(): void
  /** Ctrl+Shift+1 in the page. */
  toggleMic(): void
}

const looksLikeCode = (text: string): boolean => /[=(){}[\]:;]/.test(text) && /\n|def |for |if |return/.test(text)

const fakeTracer = (): TracerLike => {
  const reply = (animate: boolean, text: string): Promise<TraceReply> =>
    new Promise((resolve) =>
      setTimeout(() => {
        const demo = demoReplyFor(text)
        if (animate && demo) resolve(demo)
        else if (looksLikeCode(text) && !demo) resolve({
          message: 'This browser preview has prepared replays for the examples in the dropdown. Select the whole example to watch it. To ask about other code or a few selected lines, use the Electron app connected to Claude.',
          trace: null
        })
        else
          resolve({
            message: demo
              ? demo.message
              : 'This asks whether **any value appears at least twice** in the array. You only need to know *whether* you have seen a number before, not how many times.',
            trace: null
          })
      }, THINK_MS)
    )
  let snippet = ''
  let guiding = false
  return {
    ask: (input) => {
      guiding = false
      snippet = input.snippet
      return reply(input.animate, input.snippet)
    },
    // Nothing highlighted: the preview "reads" the code on the fake page, like Claude reads the screenshot.
    askScreen: (input) => {
      guiding = Boolean(input.guide)
      snippet = currentCode()
      if (guiding) return Promise.resolve({ message: 'I can see the duplicate-checking problem. Which part feels unclear: what counts as a duplicate, or what your code does?', trace: null })
      return reply(input.animate, snippet)
    },
    followUp: (_text, animate) => guiding ? Promise.resolve({ message: 'Let’s look at the example together. Which value appears more than once, and what would that tell you about the result?', trace: null }) : reply(animate, snippet)
  }
}

/** The code on the fake LeetCode page (MockPage sets it). */
let pageCode = ''
const currentCode = (): string => pageCode
export function setMockPageCode(code: string): void {
  pageCode = code
}

export function createIslandMock(): IslandMock {
  const listeners = new Set<(v: IslandView) => void>()
  const hiddenListeners = new Set<(h: boolean) => void>()
  const micListeners = new Set<() => void>()
  let pending: string | null = null

  const controller = new IslandController({
    makeTracer: fakeTracer,
    capture: async () => ({ data: 'mock-screen', mediaType: 'image/jpeg' }),
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
    setVoice: (on) => controller.setVoice(on),
    setExpanded: (open) => controller.setExpanded(open),
    askText: (text) => void controller.askText(text),
    startGuidance: () => void controller.startGuidance(),
    replay: () => controller.replay(),
    finishAnimation: () => controller.finishAnimation(),
    hide: () => {
      controller.hide()
      setHidden(true)
    },
    show: () => setHidden(false),
    onMicToggle: (cb) => {
      micListeners.add(cb)
      return () => micListeners.delete(cb)
    },
    toggleMic: () => micListeners.forEach((cb) => cb()),
    resize: () => {},
    holdCard: (hold) => controller.holdCard(hold),
    ask: () => {
      if (pending) void controller.ask(pending)
    },
    select: (text) => {
      pending = text
    },
    onHidden: (cb) => {
      hiddenListeners.add(cb)
      return () => hiddenListeners.delete(cb)
    }
  }
}
