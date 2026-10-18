import { describe, expect, it } from 'vitest'
import { CONTAINS_DUPLICATE } from './fixtures'
import { finishMessage, momentAt, stepDuration } from './traceExpression'

const trace = CONTAINS_DUPLICATE.trace

describe('expressive trace moments', () => {
  it('keeps ordinary steps quiet and emphasizes a changed condition once', () => {
    expect(momentAt(trace, -1)).toBeNull()
    expect(momentAt(trace, 4)).toBeNull() // first false
    expect(momentAt(trace, 8)).toBeNull() // false again
    expect(momentAt(trace, 16)?.title).toBe('Now this condition is true')
    expect(stepDuration(trace, 16, 2400)).toBe(3400)
    expect(stepDuration(trace, 8, 2400)).toBe(2400)
  })

  it('lets a returned result land without calling it correct', () => {
    expect(momentAt(trace, 17)?.title).toBe('Here’s the result')
    expect(finishMessage({ ...trace, outcome: undefined }).celebrate).toBe(false)
    expect(finishMessage({ ...trace, outcome: undefined }).detail).toBe('Returned True')
  })

  it('celebrates only an assessed example match, including a correct false result', () => {
    expect(finishMessage(trace).celebrate).toBe(true)
    expect(finishMessage({ ...trace, outcome: { status: 'matched', expected: 'False', actual: 'False', evidence: 'Distinct input' } }).celebrate).toBe(true)
    expect(finishMessage({ ...trace, outcome: { status: 'mismatch', expected: 'False', actual: 'True', evidence: 'Distinct input' } }).celebrate).toBe(false)
    expect(finishMessage({ ...trace, steps: trace.steps.slice(0, 2), outcome: undefined }).title).toBe('End of this walkthrough')
  })
})
