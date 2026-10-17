import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MemoryStore } from './store'

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'clueless-')), 'memory.json')

describe('MemoryStore', () => {
  it('counts repeat gaps by topic, ignoring case and spacing', () => {
    const m = new MemoryStore(null)
    m.recordGap('coding', { type: 'recall_slip', topic: 'Python list of sets' })
    const rec = m.recordGap('coding', { type: 'recall_slip', topic: 'python  list of sets' })
    expect(rec.timesSeen).toBe(2)
    expect(m.historySummary()).toBe('Python list of sets (recall_slip, 2x)')
  })

  it('makes new flashcards due now, and pushes them out after a good review', () => {
    const now = new Date('2026-10-17T12:00:00Z')
    const m = new MemoryStore(null)
    expect(m.addCards('math', 'integration by parts', [{ front: 'Pick u for ∫x eˣ dx?', back: 'u = x' }], now)).toBe(1)
    expect(m.addCards('math', 'integration by parts', [{ front: 'Pick u for ∫x eˣ dx?', back: 'dup' }], now)).toBe(0)
    const [card] = m.view(now).dueCards
    expect(card.front).toBe('Pick u for ∫x eˣ dx?')
    m.rate(card.id, 3, now)
    expect(m.view(now).dueCards).toHaveLength(0)
    expect(m.view(new Date('2026-11-30T12:00:00Z')).dueCards).toHaveLength(1)
  })

  it('saves to disk and loads back, dates included', () => {
    const file = tmpFile()
    const now = new Date('2026-10-17T12:00:00Z')
    const a = new MemoryStore(file)
    a.recordGap('physics', { type: 'concept_gap', topic: 'components of gravity on a ramp' })
    a.addCards('physics', 'ramp', [{ front: 'a on a frictionless ramp?', back: 'g·sin θ' }], now)
    const b = new MemoryStore(file)
    expect(b.view(now).gaps[0].topic).toBe('components of gravity on a ramp')
    expect(b.view(now).dueCards[0].due).toBe(now.toISOString())
  })
})
