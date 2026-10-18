import { describe, expect, it } from 'vitest'
import { Tracer, traceEffort } from './tracer'
import type { TutorTransport } from '../tutor/tutor'

describe('traceEffort', () => {
  it('small snippets use medium, bigger ones high, and never max on its own', () => {
    expect(traceEffort('x = 1\ny = x + 1')).toBe('medium')
    const long = Array.from({ length: 60 }, (_, i) => `line${i}()`).join('\n')
    expect(traceEffort(long)).toBe('high')
  })

  it('ignores blank lines when counting', () => {
    expect(traceEffort('a()\n\n\n\nb()\n\n')).toBe('medium')
  })
})

describe('screen coaching transports', () => {
  it.each(['structured', 'tool'] as const)('sends the guide mode and retains context through %s replies', async (mode) => {
    const calls: Record<string, unknown>[] = []
    const wire = {
      message: 'Which part is unclear?', intro: '', language: '', code: '',
      entities: [], steps: [], run: { setup: '', call: '' },
      outcome: { status: 'unknown', expected: '', actual: '', evidence: '' }
    }
    const client = { beta: { messages: { stream: (params: Record<string, unknown>) => {
      calls.push(params)
      return { finalMessage: async () => ({
        stop_reason: mode === 'tool' ? 'tool_use' : 'end_turn',
        content: mode === 'tool'
          ? [{ type: 'tool_use', id: 'reply-1', name: 'reply', input: wire }]
          : [{ type: 'text', text: JSON.stringify(wire) }],
        usage: { input_tokens: 1, output_tokens: 1 }
      }) }
    } } } }
    const tracer = new Tracer({ client, model: 'test', mode, serverFallbacks: false } as unknown as TutorTransport)
    const answer = await tracer.askScreen({ question: 'Help me get unstuck.', image: { data: 'screen', mediaType: 'image/jpeg' }, animate: false, guide: true })
    expect(answer).toEqual({ message: wire.message, trace: null })
    await tracer.followUp('The condition confuses me.', false)
    expect(JSON.stringify(calls[0].messages)).toContain('[GUIDE] [ANIMATE OFF] [SCREEN]')
    expect(JSON.stringify(calls[1].messages)).toContain('The condition confuses me.')
    expect(JSON.stringify(calls[0].system)).toContain('one focused question')
    expect(calls).toHaveLength(2)
  })
})
