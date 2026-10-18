import { describe, expect, it } from 'vitest'
import { CONTAINS_DUPLICATE } from './fixtures'
import { changesAt, loopPass, pointersAt, valuesAt } from './traceState'

const trace = CONTAINS_DUPLICATE.trace

describe('trace playback helpers', () => {
  it('accumulates values step by step', () => {
    expect(valuesAt(trace, -1)).toEqual({})
    const v = valuesAt(trace, 5) // after the first seen.add(n)
    expect(v.nums.items).toEqual(['3', '1', '4', '1'])
    expect(v.seen.items).toEqual(['3'])
    expect(v.n.scalar).toBe('3')
  })

  it('works out exactly what changed', () => {
    expect(changesAt(trace, 0).nums.added).toBe(true)
    expect(changesAt(trace, 5).seen.items).toEqual(['3']) // seen.add(3)
    expect(changesAt(trace, 7).n).toMatchObject({ added: false, scalar: true }) // n = 1
    expect(changesAt(trace, 4)).toEqual({}) // the `if` changes nothing
  })

  it('counts loop passes and points index variables at array cells', () => {
    const loops = trace.steps.map((_, i) => loopPass(trace, i)).filter(Boolean)
    expect(loops).toEqual([1, 2, 3, 4])
    expect(pointersAt(trace, valuesAt(trace, 10))).toEqual({ nums: [{ name: 'i', index: 2 }] })
  })
})
