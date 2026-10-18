import { describe, expect, it } from 'vitest'
import { DEMO_EXAMPLES, demoReplyFor, EARLY_RETURN, WRONG_CONDITION } from './fixtures'
import { finishMessage } from './traceExpression'
import { valuesAt } from './traceState'

describe('code examples for the browser preview', () => {
  it('replays each full example, tolerating clipboard indentation and line endings', () => {
    for (const example of DEMO_EXAMPLES) {
      const indented = example.reply.trace.code.split('\n').map((line) => `    ${line}`).join('\r\n')
      expect(demoReplyFor(indented)).toBe(example.reply)
      const lines = example.reply.trace.code.split('\n')
      for (const step of example.reply.trace.steps) {
        expect(lines[step.line - 1]).toContain(step.focus)
      }
    }
  })

  it('does not replay an unrelated program or a partial selection', () => {
    expect(demoReplyFor('x = 123\nprint(x)')).toBeUndefined()
    expect(demoReplyFor('seen = set()')).toBeUndefined()
  })

  it('shows the wrong condition returning true on distinct numbers without celebrating', () => {
    const trace = WRONG_CONDITION.trace
    const values = valuesAt(trace, trace.steps.length - 1)
    expect(values.nums.items).toEqual(['1', '2', '3', '4'])
    expect(values.seen.items).toEqual([])
    expect(trace.steps.at(-1)?.result).toBe('True')
    expect(finishMessage(trace).celebrate).toBe(false)
    expect(finishMessage(trace).detail).toBe('Expected False · Returned True')
  })

  it('shows an early return with only the first item processed', () => {
    const trace = EARLY_RETURN.trace
    expect(valuesAt(trace, trace.steps.length - 1).seen.items).toEqual(['3'])
    expect(trace.steps.filter((step) => step.kind === 'loop')).toHaveLength(1)
    expect(finishMessage(trace).detail).toBe('Expected True · Returned False')
  })
})
