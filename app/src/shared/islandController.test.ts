import { describe, expect, it } from 'vitest'
import type { IslandView } from './contracts'
import { IslandController, NO_KEY_MESSAGE, READ_BEFORE_ANIMATION_MS, type AskInput, type TracerLike } from './islandController'
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
    }
  ]
}

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
  const controller = new IslandController(
    {
      makeTracer: () => tracer,
      capture: async () => ({ data: 'SCREEN', mediaType: 'image/jpeg' }),
      emit: (v) => views.push(v),
      schedule: (fn, ms) => {
        const t = { fn, ms, cancelled: false }
        timers.push(t)
        return () => (t.cancelled = true)
      },
      now: () => 1000
    },
    opts.animate ?? true
  )
  const fire = (): void => {
    const t = timers.find((x) => !x.cancelled)
    if (!t) throw new Error('no timer pending')
    t.cancelled = true
    t.fn()
  }
  return { tracer, views, timers, controller, fire, last: () => views[views.length - 1] }
}

describe('IslandController', () => {
  it('Animate on: thinking -> text for 4 s -> full-screen animation -> click closes it', async () => {
    const { controller, tracer, views, timers, fire, last } = setup()
    tracer!.replies.push({ message: 'Watch `n`.', trace: TRACE })
    await controller.ask('n = 5')
    expect(views[0].phase).toBe('thinking')
    expect(tracer!.asked[0]).toEqual({ snippet: 'n = 5', image: { data: 'SCREEN', mediaType: 'image/jpeg' }, animate: true })
    expect(last().phase).toBe('reading')
    expect(last().messages).toEqual([{ role: 'clueless', text: 'Watch `n`.' }])
    expect(timers.at(-1)?.ms).toBe(READ_BEFORE_ANIMATION_MS)
    fire()
    expect(last().phase).toBe('playing')
    expect(last().trace?.steps).toHaveLength(1)
    controller.finishAnimation()
    expect(last().phase).toBe('idle')
  })

  it('Animate off: the text stays until it is closed, and follow-ups continue the conversation', async () => {
    const { controller, tracer, timers, last } = setup({ animate: false })
    await controller.ask('n = 5')
    expect(last().phase).toBe('answer')
    expect(tracer!.asked[0].animate).toBe(false)
    expect(timers.filter((t) => !t.cancelled)).toHaveLength(0)
    await controller.followUp('why 5?')
    expect(tracer!.followUps).toEqual(['why 5?'])
    expect(last().messages.map((m) => m.role)).toEqual(['clueless', 'student', 'clueless'])
    controller.closeCard()
    expect(last().phase).toBe('idle')
  })

  it('Animate on but not code: the text closes by itself, but waits while the mouse is on it', async () => {
    const { controller, fire, last } = setup()
    await controller.ask('Given an integer array nums...')
    expect(last().phase).toBe('answer')
    controller.holdCard(true)
    fire() // reading time is up, but the mouse is on the card
    expect(last().phase).toBe('answer')
    controller.holdCard(false)
    fire()
    expect(last().phase).toBe('idle')
  })

  it('drops a reply that arrives after the card was closed', async () => {
    const { controller, tracer, last } = setup()
    tracer!.hold = true
    const asking = controller.ask('n = 5')
    await Promise.resolve()
    await Promise.resolve()
    controller.closeCard()
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
})
