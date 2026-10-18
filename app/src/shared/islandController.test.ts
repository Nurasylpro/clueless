import { describe, expect, it } from 'vitest'
import type { IslandView } from './contracts'
import {
  FINISHED_MS,
  INTRO_MS,
  IslandController,
  MIN_STEP_MS,
  NO_KEY_MESSAGE,
  SCROLLED_NOTICE,
  STEP_MS,
  type AskInput,
  type TracerLike
} from './islandController'
import type { CodeTrace, TraceReply } from './trace'

const TRACE: CodeTrace = {
  language: 'python',
  code: 'n = 5',
  entities: [{ id: 'n', name: 'n', kind: 'value', indexOf: null }],
  steps: [
    {
      line: 1,
      endLine: 1,
      focus: '',
      kind: 'declare',
      result: '',
      reads: [],
      updates: [{ entity: 'n', value: { scalar: '5', items: [], entries: [], rows: [] } }]
    },
    { line: 1, endLine: 1, focus: '', kind: 'other', result: '', reads: ['n'], updates: [] }
  ]
}

const SPOT = { displayId: 1, left: 100, width: 300, top: 200, lineHeight: 20, lines: 1 }

class FakeTracer implements TracerLike {
  asked: AskInput[] = []
  followUps: string[] = []
  replies: TraceReply[] = []
  pending: ((r: TraceReply) => void) | null = null
  hold = false
  async ask(input: AskInput): Promise<TraceReply> {
    this.asked.push(input)
    return this.next()
  }
  async followUp(text: string): Promise<TraceReply> {
    this.followUps.push(text)
    return this.next()
  }
  private next(): Promise<TraceReply> {
    if (this.hold) return new Promise((r) => (this.pending = r))
    return Promise.resolve(this.replies.shift() ?? { message: 'Plain text.', trace: null })
  }
}

function setup(opts: { tracer?: FakeTracer | null; animate?: boolean } = {}) {
  const tracer = opts.tracer === undefined ? new FakeTracer() : opts.tracer
  const views: IslandView[] = []
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = []
  let now = 1000
  const controller = new IslandController(
    {
      makeTracer: () => tracer,
      capture: async () => ({ image: { data: 'SCREEN', mediaType: 'image/jpeg' }, spot: SPOT }),
      emit: (v) => views.push(v),
      schedule: (fn, ms) => {
        const t = { fn, ms, cancelled: false }
        timers.push(t)
        return () => (t.cancelled = true)
      },
      now: () => now
    },
    opts.animate ?? true
  )
  const pending = () => timers.filter((t) => !t.cancelled)
  const fire = (): number => {
    const t = pending()[0]
    if (!t) throw new Error('no timer pending')
    t.cancelled = true
    now += t.ms
    t.fn()
    return t.ms
  }
  return { tracer, views, pending, controller, fire, last: () => views[views.length - 1], wait: (ms: number) => (now += ms) }
}

describe('IslandController', () => {
  it('Animate on: thinking -> the answer and the animation on the code, step by step, then it clears', async () => {
    const { controller, tracer, views, fire, last } = setup()
    tracer!.replies.push({ message: 'Watch `n`.', trace: TRACE })
    await controller.ask('n = 5')
    expect(views[0].phase).toBe('thinking')
    expect(tracer!.asked[0]).toEqual({ snippet: 'n = 5', image: { data: 'SCREEN', mediaType: 'image/jpeg' }, animate: true })
    expect(last()).toMatchObject({ phase: 'answer', spot: SPOT, playback: { index: -1, playing: true } })
    expect(last().messages).toEqual([{ role: 'clueless', text: 'Watch `n`.' }])
    expect(fire()).toBe(INTRO_MS)
    expect(last().playback).toMatchObject({ index: 0, playing: true })
    expect(fire()).toBe(STEP_MS)
    expect(last().playback).toMatchObject({ index: 1, playing: false }) // finished on the last step
    expect(fire()).toBe(FINISHED_MS)
    expect(last()).toMatchObject({ phase: 'answer', playback: null }) // the text stays
    controller.replay()
    expect(last().playback).toMatchObject({ index: -1, playing: true })
    controller.close()
    expect(last()).toMatchObject({ phase: 'idle', playback: null, messages: [] })
  })

  it('pause, step by hand, and play on', async () => {
    const { controller, tracer, pending, fire, last } = setup()
    tracer!.replies.push({ message: 'Watch.', trace: TRACE })
    await controller.ask('n = 5')
    fire() // intro over
    controller.pause()
    expect(last().playback).toMatchObject({ index: 0, playing: false })
    expect(pending()).toHaveLength(0)
    controller.step(+1)
    expect(last().playback?.index).toBe(1)
    controller.step(+1)
    expect(last().playback?.index).toBe(1) // stays on the last step
    controller.step(-1)
    controller.play()
    expect(last().playback).toMatchObject({ index: 0, playing: true })
    fire()
    expect(last().playback).toMatchObject({ index: 1, playing: false })
  })

  it('with voice on, a step lasts until the panel has read it aloud (but never less than a moment)', async () => {
    const { controller, tracer, pending, fire, wait, last } = setup()
    controller.setNarrated(true)
    tracer!.replies.push({ message: 'Watch.', trace: TRACE })
    await controller.ask('n = 5')
    const nonce = last().playback!.nonce
    controller.stepDone(nonce, -1) // the intro was read
    expect(fire()).toBe(MIN_STEP_MS) // no time had passed: wait the minimum
    expect(last().playback?.index).toBe(0)
    controller.stepDone(nonce + 1, 0) // an old run's narration: ignored
    expect(pending().at(-1)?.ms).toBeGreaterThan(MIN_STEP_MS) // still the long safety timer
    wait(1500)
    controller.stepDone(nonce, 0)
    expect(fire()).toBe(0) // read for longer than the minimum: go on right away
    expect(last().playback).toMatchObject({ index: 1, playing: false })
  })

  it('stops the animation when the page scrolls, and Replay brings it back', async () => {
    const { controller, tracer, last } = setup()
    tracer!.replies.push({ message: 'Watch.', trace: TRACE })
    await controller.ask('n = 5')
    controller.scrolled()
    expect(last()).toMatchObject({ playback: null, notice: SCROLLED_NOTICE })
    controller.replay()
    expect(last()).toMatchObject({ notice: null, playback: { index: -1 } })
  })

  it('Animate off: text only, and follow-ups continue the conversation', async () => {
    const { controller, tracer, pending, last } = setup({ animate: false })
    tracer!.replies.push({ message: 'It sets n.', trace: TRACE })
    await controller.ask('n = 5')
    expect(last()).toMatchObject({ phase: 'answer', playback: null })
    expect(tracer!.asked[0].animate).toBe(false)
    expect(pending()).toHaveLength(0)
    await controller.followUp('why 5?')
    expect(tracer!.followUps).toEqual(['why 5?'])
    expect(last().messages.map((m) => m.role)).toEqual(['clueless', 'student', 'clueless'])
  })

  it('turning Animate off takes the animation off the screen', async () => {
    const { controller, tracer, last } = setup()
    tracer!.replies.push({ message: 'Watch.', trace: TRACE })
    await controller.ask('n = 5')
    controller.setAnimate(false)
    expect(last()).toMatchObject({ animate: false, playback: null, phase: 'answer' })
  })

  it('drops a reply that arrives after the card was closed', async () => {
    const { controller, tracer, last } = setup()
    tracer!.hold = true
    const asking = controller.ask('n = 5')
    await Promise.resolve()
    await Promise.resolve()
    controller.close()
    tracer!.pending?.({ message: 'late', trace: TRACE })
    await asking
    expect(last().phase).toBe('idle')
    expect(last().messages).toEqual([])
  })

  it('explains what to do when there is no Claude key', async () => {
    const { controller, last } = setup({ tracer: null })
    await controller.ask('n = 5')
    expect(last()).toMatchObject({ phase: 'answer', error: NO_KEY_MESSAGE })
  })

  it('keeps both switches across questions', async () => {
    const { controller, last } = setup()
    controller.setAskOnHighlight(false)
    await controller.ask('n = 5')
    controller.close()
    expect(last()).toMatchObject({ askOnHighlight: false, animate: true })
  })
})
