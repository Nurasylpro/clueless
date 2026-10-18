import { describe, expect, it } from 'vitest'
import { islandBounds } from './islandPlacement'

describe('island placement', () => {
  const work = { x: -1920, y: -100, width: 1920, height: 1040 }

  it('centers by default on displays with negative coordinates', () => {
    expect(islandBounds(work, { width: 400, height: 70 })).toEqual({ x: -1160, y: -94, width: 400, height: 70 })
  })

  it('keeps the chosen center when switching between pill and card', () => {
    const anchor = { x: -700, y: 80 }
    const pill = islandBounds(work, { width: 400, height: 70 }, anchor)
    const card = islandBounds(work, { width: 580, height: 480 }, anchor)
    expect(pill.x + pill.width / 2).toBe(card.x + card.width / 2)
    expect(card.y).toBe(80)
  })

  it('keeps an expanded card and oversized content within the work area', () => {
    for (const size of [{ width: 580, height: 480 }, { width: 4000, height: 3000 }]) {
      const b = islandBounds(work, size, { x: 10000, y: 10000 })
      expect(b.x).toBeGreaterThanOrEqual(work.x)
      expect(b.y).toBeGreaterThanOrEqual(work.y)
      expect(b.x + b.width).toBeLessThanOrEqual(work.x + work.width)
      expect(b.y + b.height).toBeLessThanOrEqual(work.y + work.height)
    }
  })
})
