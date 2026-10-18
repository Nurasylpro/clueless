import { describe, expect, it } from 'vitest'
import type { IslandView } from './contracts'
import { IslandController, NO_KEY_MESSAGE, type AskInput, type ScreenQuestion, type TracerLike } from './islandController'
import type { CodeTrace, TraceReply } from './trace'

const TRACE: CodeTrace = {
  intro: 'Watch n.',
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
      updates: [{ entity: 'n', value: { scalar: '5', items: [], entries: [], rows: [] } }],
      say: 'n starts at 5.'
    }
  ]
}

class FakeTracer implements TracerLike {
  asked: AskInput[] = []
  screen: ScreenQuestion[] = []
  followUps: string[] = []
  replies: TraceReply[] = []
  pending: ((r: TraceReply) => void) | null = null
  hold = false
  async ask(input: AskInput): Promise<TraceReply> {
    this.asked.push(input)
    return this.next()
  }
  async askScreen(input: ScreenQuestion): Promise<TraceReply> {
    this.screen.push(input)
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

function setup(opts: { tracer?: FakeTracer | null; animate?: boolean; voice?: boolean } = {}) {
  const tracer = opts.tracer === undefined ? new FakeTracer() : opts.tracer
  const views: IslandView[] = []
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = []
  let made = 0
  const controller = new IslandController(
    {
      makeTracer: () => {
        made++
        return tracer
      },
      capture: async () => ({ data: 'SCREEN', mediaType: 'image/jpeg' }),
      emit: (v) => views.push(v),
      schedule: (fn, ms) => {
        const t = { fn, ms, cancelled: false }
        timers.push(t)
        return () => (t.cancelled = true)
      },
      now: () => 1000
    },
    { animate: opts.animate ?? true, voice: opts.voice ?? false }
  )
  const fire = (): void => {
    const t = timers.find((x) => !x.cancelled)
    if (!t) throw new Error('no timer pending')
    t.cancelled = true
    t.fn()
  }
  return { tracer, views, timers, controller, fire, last: () => views[views.length - 1], made: () => made }
}

describe('IslandController', () => {
  it('Animate on: the animation starts right away, with no text screen first; the recap waits in the card', async () => {
    const { controller, tracer, views, last } = setup()
    tracer!.replies.push({ message: 'The loop counts down to 0.', trace: TRACE })
    await controller.ask('n = 5')
    expect(views[0].phase).toBe('thinking')
    expect(tracer!.asked[0]).toEqual({ snippet: 'n = 5', image: { data: 'SCREEN', mediaType: 'image/jpeg' }, animate: true })
    expect(last()).toMatchObject({ phase: 'playing', expanded: false, playId: 1 })
    expect(views.some((v) => v.phase === 'answer')).toBe(false)
    controller.finishAnimation()
    expect(last()).toMatchObject({ phase: 'idle', expanded: false })
    // Expand afterwards: the recap is there, and the animation can be watched again.
    controller.setExpanded(true)
    expect(last().messages.at(-1)).toEqual({ role: 'clueless', text: 'The loop counts down to 0.' })
    expect(last().recapAt).toBe(0)
    controller.replay()
    expect(last()).toMatchObject({ phase: 'playing', expanded: false, playId: 2 })
  })

  it('Animate off: the card opens with the text and stays; typed follow-ups continue the same conversation', async () => {
    const { controller, tracer, timers, last } = setup({ animate: false })
    await controller.ask('n = 5')
    expect(last()).toMatchObject({ phase: 'answer', expanded: true })
    expect(tracer!.asked[0].animate).toBe(false)
    expect(timers.filter((t) => !t.cancelled)).toHaveLength(0)
    await controller.askText('why 5?')
    expect(tracer!.followUps).toEqual(['why 5?'])
    expect(last().messages.map((m) => m.role)).toEqual(['clueless', 'student', 'clueless'])
    controller.setExpanded(false)
    expect(last()).toMatchObject({ expanded: false })
  })

  it('a question with nothing highlighted is about the screen, and can still be animated', async () => {
    const { controller, tracer, last } = setup()
    tracer!.replies.push({ message: 'Recap.', trace: TRACE })
    await controller.askText('what does this loop do?')
    expect(tracer!.screen[0]).toEqual({ question: 'what does this loop do?', image: { data: 'SCREEN', mediaType: 'image/jpeg' }, animate: true })
    expect(last()).toMatchObject({ phase: 'playing', snippet: null })
  })

  it('Animate on but not code: the text closes by itself, but waits while it is hovered or read aloud', async () => {
    const { controller, fire, last } = setup()
    await controller.ask('Given an integer array nums...')
    expect(last()).toMatchObject({ phase: 'answer', expanded: true })
    controller.holdCard(true)
    fire() // reading time is up, but the card is held
    expect(last().expanded).toBe(true)
    controller.holdCard(false)
    fire()
    expect(last()).toMatchObject({ phase: 'idle', expanded: false })
  })

  it('stores the Voice switch for the UI, which does the reading aloud', () => {
    const { controller, last } = setup({ voice: false })
    controller.setVoice(true)
    expect(last().voice).toBe(true)
  })

  it('hiding drops a reply still on its way', async () => {
    const { controller, tracer, last } = setup()
    tracer!.hold = true
    const asking = controller.ask('n = 5')
    await Promise.resolve()
    await Promise.resolve()
    controller.hide()
    tracer!.pending?.({ message: 'late', trace: TRACE })
    await asking
    expect(last()).toMatchObject({ phase: 'idle', expanded: false, messages: [] })
  })

  it('a new highlight starts a new conversation', async () => {
    const { controller, made } = setup({ animate: false })
    await controller.ask('a = 1')
    await controller.ask('b = 2')
    expect(made()).toBe(2)
  })

  it('explains what to do when there is no Claude key', async () => {
    const { controller, last } = setup({ tracer: null })
    await controller.ask('n = 5')
    expect(last()).toMatchObject({ phase: 'answer', expanded: true, error: NO_KEY_MESSAGE })
  })
})
