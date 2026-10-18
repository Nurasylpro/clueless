import { describe, expect, it } from 'vitest'
import { isSelectGesture } from './gesture'

describe('isSelectGesture', () => {
  it('a drag selects, a plain click does not', () => {
    expect(isSelectGesture({ x: 100, y: 100 }, { x: 260, y: 140, clicks: 1 })).toBe(true)
    expect(isSelectGesture({ x: 100, y: 100 }, { x: 102, y: 101, clicks: 1 })).toBe(false)
  })

  it('double and triple clicks select a word or a line', () => {
    expect(isSelectGesture({ x: 100, y: 100 }, { x: 100, y: 100, clicks: 2 })).toBe(true)
    expect(isSelectGesture(null, { x: 100, y: 100, clicks: 3 })).toBe(true)
  })
})
