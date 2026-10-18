import { describe, expect, it } from 'vitest'
import { traceEffort } from './tracer'

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
