import { describe, expect, it } from 'vitest'
import { fromTraceWire, normalizeSnippet, numberLines, type TraceWireT } from './trace'

const value = (over: Partial<TraceWireT['steps'][number]['updates'][number]['value']> = {}) => ({
  scalar: '',
  items: [],
  entries: [],
  rows: [],
  ...over
})

describe('normalizeSnippet', () => {
  it('removes shared indentation, blank edges, CRLF and tabs', () => {
    const copied = '\r\n\r\n        seen = set()\r\n        for n in nums:\r\n\t\t\tseen.add(n)   \r\n\r\n'
    expect(normalizeSnippet(copied)).toBe('seen = set()\nfor n in nums:\n    seen.add(n)')
  })

  it('numbers lines with a fixed width', () => {
    const code = Array.from({ length: 10 }, (_, i) => `x${i}`).join('\n')
    expect(numberLines(code).split('\n')[0]).toBe(' 1 | x0')
    expect(numberLines(code).split('\n')[9]).toBe('10 | x9')
  })
})

describe('fromTraceWire', () => {
  const code = 'n = 5\nwhile n > 0:\n    n -= 1'
  const wire: TraceWireT = {
    message: 'Watch `n` count down.',
    language: 'python',
    entities: [
      { id: 'n', name: 'n', kind: 'value', indexOf: 'missing' },
      { id: 'n', name: 'dup', kind: 'value', indexOf: '' }
    ],
    steps: [
      { line: 1, endLine: 1, focus: 'n = 5', kind: 'declare', result: '', reads: [], updates: [{ entity: 'n', value: value({ scalar: '5' }) }] },
      { line: 2, endLine: 0, focus: 'n > 0', kind: 'condition', result: 'true', reads: ['n', 'ghost'], updates: [] },
      { line: 99, endLine: 99, focus: 'not on the line', kind: 'assign', result: '', reads: [], updates: [{ entity: 'ghost', value: value() }] }
    ],
    run: { setup: '', call: '' }
  }

  it('keeps steps on real lines and drops unknown entities', () => {
    const { message, trace } = fromTraceWire(wire, code)
    expect(message).toBe('Watch `n` count down.')
    expect(trace?.entities).toEqual([{ id: 'n', name: 'n', kind: 'value', indexOf: null }])
    expect(trace?.steps[1]).toMatchObject({ line: 2, endLine: 2, focus: 'n > 0', reads: ['n'] })
    expect(trace?.steps[2]).toMatchObject({ line: 3, endLine: 3, focus: '', updates: [] })
  })

  it('has no trace when there are no steps (Animate off, or not code)', () => {
    expect(fromTraceWire({ ...wire, steps: [] }, code).trace).toBeNull()
    expect(fromTraceWire({ ...wire, entities: [] }, code).trace).toBeNull()
  })
})
