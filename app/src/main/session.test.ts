import { describe, expect, it, vi } from 'vitest'
import type { SessionView, TutorReplyT, TutorTurn } from '../shared/contracts'
import { MemoryStore } from './memory/store'
import { SessionController } from './session'
import type { SendInput, StartInput, TutorLike } from './tutor/tutor'

const turn = (over: Partial<TutorTurn> = {}): TutorTurn => ({
  kind: 'question',
  message: 'What do you get?',
  hintLevel: 0,
  verdict: 'none',
  plan: [{ id: 1, text: 'Integrate by parts', status: 'current' }],
  gap: null,
  expects: 'math',
  choices: [],
  visual: null,
  check: null,
  ...over
})

class FakeTutor implements TutorLike {
  sent: SendInput[] = []
  replies: TutorReplyT[] = []
  async start(_: StartInput): Promise<TutorReplyT> {
    return {
      problem: { subject: 'math', title: '∫ x² eˣ dx', summary: 'Integrate', language: null, hiddenSolution: 'SECRET' },
      turn: turn({ check: { kind: 'antiderivative', reference: 'x^2*e^x', variable: 'x', unit: null } }),
      recap: null
    }
  }
  async send(input: SendInput): Promise<TutorReplyT> {
    this.sent.push(input)
    return this.replies.shift() ?? { problem: null, turn: turn(), recap: null }
  }
}

function setup() {
  const tutor = new FakeTutor()
  const views: (SessionView | null)[] = []
  const memory = new MemoryStore(null)
  const stuck = { start: vi.fn(), stop: vi.fn(), snooze: vi.fn(), noteActivity: vi.fn(), noteWrongStreak: vi.fn() }
  const controller = new SessionController({
    makeTutor: () => tutor,
    memory,
    captureScreen: async () => ({ data: 'AAAA', mediaType: 'image/jpeg' }),
    emit: (v) => views.push(v),
    stuck
  })
  return { tutor, views, memory, stuck, controller, last: () => views[views.length - 1]! }
}

describe('SessionController', () => {
  it('never sends the hidden solution or the check reference to the UI', async () => {
    const { controller, views } = setup()
    await controller.startProblem({ text: 'integrate x^2 e^x' })
    const json = JSON.stringify(views)
    expect(json).not.toContain('SECRET')
    expect(json).not.toContain('x^2*e^x')
  })

  it('runs the math checker on the answer and tells the tutor the result', async () => {
    const { controller, tutor, last } = setup()
    await controller.startProblem({ text: 'integrate' })
    tutor.replies.push({ problem: null, turn: turn({ kind: 'feedback', verdict: 'incorrect' }), recap: null })
    await controller.send('x^2 e^x - 2x e^x - 2e^x + C', 'math')
    expect(tutor.sent[0].notes?.join()).toContain('does NOT equal the integrand')
    const student = last()!.thread.find((t) => t.role === 'student')
    expect(student && student.role === 'student' && student.check?.status).toBe('mismatch')
    expect(last()!.wrongStreak).toBe(1)
  })

  it('unlocks Reveal only after 3 answers', async () => {
    const { controller, tutor, last } = setup()
    await controller.startProblem({ text: 'p' })
    for (let i = 0; i < 3; i++) {
      tutor.replies.push({ problem: null, turn: turn({ verdict: 'incorrect' }), recap: null })
      await controller.action('reveal') // ignored while locked
      expect(tutor.sent.some((s) => s.tag === 'REVEAL')).toBe(false)
      await controller.send(`try ${i}`, 'text')
    }
    expect(last()!.revealAllowed).toBe(true)
    await controller.action('reveal')
    expect(tutor.sent.at(-1)?.tag).toBe('REVEAL')
  })

  it('records gaps and turns the recap into flashcards', async () => {
    const { controller, tutor, memory, last } = setup()
    await controller.startProblem({ text: 'p' })
    tutor.replies.push({
      problem: null,
      turn: turn({ kind: 'recall_card', gap: { type: 'recall_slip', topic: 'integration by parts formula' } }),
      recap: null
    })
    await controller.send('what is the formula again', 'recall')
    tutor.replies.push({
      problem: null,
      turn: turn({ kind: 'solved' }),
      recap: {
        explainBack: 'Why u = x²?',
        gaps: [{ type: 'recall_slip', topic: 'integration by parts formula' }],
        flashcards: [{ front: '∫u dv = ?', back: 'uv − ∫v du' }],
        similarProblem: '∫ x² cos x dx'
      }
    })
    await controller.action('finish')
    expect(last()!.recap?.cardsAdded).toBe(1)
    expect(memory.view().gaps[0].topic).toBe('integration by parts formula')
    expect(memory.view().sessions).toBe(1)
  })

  it('keeps the error and lets the student retry', async () => {
    const { controller, tutor, last } = setup()
    await controller.startProblem({ text: 'p' })
    const original = tutor.send.bind(tutor)
    tutor.send = async () => {
      throw new Error('Claude is rate-limiting us.')
    }
    await controller.action('hint')
    expect(last()!.error).toBe('Claude is rate-limiting us.')
    tutor.send = original
    await controller.action('retry')
    expect(last()!.error).toBeNull()
    expect(tutor.sent.at(-1)?.tag).toBe('HINT')
  })
})
