import { mkdtempSync, writeFileSync } from 'node:fs'
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

  it('saves to disk and loads back', () => {
    const file = tmpFile()
    const a = new MemoryStore(file)
    a.recordGap('physics', { type: 'concept_gap', topic: 'components of gravity on a ramp' })
    const b = new MemoryStore(file)
    expect(b.view().gaps[0].topic).toBe('components of gravity on a ramp')
  })

  it('loads files from before flashcards were removed', () => {
    const file = tmpFile()
    writeFileSync(file, JSON.stringify({ version: 1, gaps: [], cards: [{ id: 'c1' }], sessions: [] }))
    expect(new MemoryStore(file).view()).toEqual({ gaps: [], sessions: 0 })
  })
})
