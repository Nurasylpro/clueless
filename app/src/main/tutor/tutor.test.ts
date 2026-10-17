import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { fromWire, parseReply, replySchema, Tutor, TutorError } from './tutor'

/** Walk a JSON schema and count what the structured-outputs limits count. */
function schemaStats(schema: unknown) {
  let unions = 0
  let optional = 0
  let openObjects = 0
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (Array.isArray(n.anyOf) || Array.isArray(n.type) || Array.isArray(n.oneOf)) unions++
    if (n.type === 'object' && n.properties) {
      const required = new Set((n.required as string[]) ?? [])
      optional += Object.keys(n.properties as object).filter((k) => !required.has(k)).length
      if (n.additionalProperties !== false) openObjects++
    }
    Object.values(n).forEach((v) => (Array.isArray(v) ? v.forEach(walk) : walk(v)))
  }
  walk(schema)
  return { unions, optional, openObjects }
}

const wireTurn = {
  kind: 'question',
  message: 'What do you get?',
  hintLevel: 7,
  verdict: 'none',
  plan: [{ id: 1, text: 'Integrate', status: 'current' }],
  gap: { type: 'none', topic: '' },
  expects: 'math',
  choices: [],
  visual: { caption: '', frames: [] },
  check: { kind: 'antiderivative', reference: 'x^2*e^x', variable: 'x', unit: '' }
}

describe('reply schema', () => {
  it('stays inside the structured-outputs limits (16 unions, 24 optional, closed objects)', () => {
    const stats = schemaStats(replySchema)
    expect(stats.unions).toBeLessThanOrEqual(4)
    expect(stats.optional).toBe(0)
    expect(stats.openObjects).toBe(0)
    expect(JSON.stringify(replySchema)).not.toContain('"oneOf"')
  })
})

describe('fromWire / parseReply', () => {
  it('turns placeholders into nulls and clamps the hint level', () => {
    const reply = parseReply(
      JSON.stringify({
        problem: { subject: 'math', title: 't', summary: 's', language: '', hiddenSolution: 'h' },
        turn: wireTurn,
        recap: null
      })
    )
    expect(reply.problem?.language).toBeNull()
    expect(reply.turn.gap).toBeNull()
    expect(reply.turn.visual).toBeNull()
    expect(reply.turn.hintLevel).toBe(5)
    expect(reply.turn.check).toEqual({ kind: 'antiderivative', reference: 'x^2*e^x', variable: 'x', unit: null })
  })

  it('drops checks without a reference', () => {
    const reply = fromWire({
      problem: null,
      turn: { ...wireTurn, check: { kind: 'units', reference: ' ', variable: '', unit: 'm' } } as never,
      recap: null
    })
    expect(reply.turn.check).toBeNull()
  })

  it('rejects garbage', () => {
    expect(() => parseReply('not json')).toThrow(TutorError)
    expect(() => parseReply('{"turn":{}}')).toThrow(TutorError)
  })
})

describe('Tutor', () => {
  function fakeClient(replies: unknown[]) {
    const calls: Record<string, unknown>[] = []
    const client = {
      beta: {
        messages: {
          create: async (params: Record<string, unknown>) => {
            calls.push(structuredClone(params))
            return {
              content: [
                { type: 'thinking', thinking: '', signature: 'sig' },
                { type: 'text', text: JSON.stringify(replies.shift()) }
              ],
              stop_reason: 'end_turn',
              usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 }
            }
          }
        }
      }
    }
    return { client: client as unknown as Anthropic, calls }
  }

  it('sends the screenshot, the schema and caching, and keeps the history append-only', async () => {
    const { client, calls } = fakeClient([
      { problem: { subject: 'math', title: 't', summary: 's', language: '', hiddenSolution: 'h' }, turn: wireTurn, recap: null },
      { problem: null, turn: wireTurn, recap: null }
    ])
    const tutor = new Tutor(client, 'claude-opus-5-5')
    const first = await tutor.start({ image: { data: 'AAAA', mediaType: 'image/jpeg' }, history: 'python list of sets (recall_slip, 3x)' })
    expect(first.problem?.title).toBe('t')

    const req = calls[0]
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.cache_control).toEqual({ type: 'ephemeral' })
    expect(req.fallbacks).toBe('default')
    expect((req.output_config as { effort: string }).effort).toBe('medium')
    expect((req.output_config as { format: { type: string } }).format.type).toBe('json_schema')
    const content = (req.messages as { content: { type: string; text?: string }[] }[])[0].content
    expect(content[0].type).toBe('image')
    expect(content[1].text).toContain('[NEW PROBLEM]')
    expect(content[1].text).toContain('[STUDENT HISTORY] python list of sets')

    await tutor.send({ tag: 'STUDENT', text: 'x^2 e^x', notes: ['[CHECKER] matches'] })
    const second = calls[1]
    expect((second.output_config as { effort: string }).effort).toBe('low')
    const msgs = second.messages as { role: string; content: { type: string; text?: string }[] }[]
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(msgs[1].content[0].type).toBe('thinking') // Claude's full reply is kept as-is
    expect(msgs[2].content[0].text).toBe('[CHECKER] matches\n[STUDENT] x^2 e^x')
  })

  it('turns a refusal into a friendly error', async () => {
    const client = {
      beta: {
        messages: {
          create: async () => ({ content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } })
        }
      }
    } as unknown as Anthropic
    await expect(new Tutor(client).start({ text: 'p' })).rejects.toMatchObject({ code: 'refusal' })
  })
})
