import { describe, expect, it } from 'vitest'
import { narrateStep, sayCode } from './narrate'
import type { CodeTrace, EntityValue } from './trace'

const v = (part: Partial<EntityValue>): EntityValue => ({ scalar: '', items: [], entries: [], rows: [], ...part })

const TWO_SUM: CodeTrace = {
  language: 'python',
  code: [
    'class Solution:',
    '    def twoSum(self, nums, target):',
    '        seen = {}',
    '        for i, n in enumerate(nums):',
    '            if target - n in seen:',
    '                return [seen[target - n], i]',
    '            seen[n] = i'
  ].join('\n'),
  entities: [
    { id: 'nums', name: 'nums', kind: 'array', indexOf: null },
    { id: 'target', name: 'target', kind: 'value', indexOf: null },
    { id: 'seen', name: 'seen', kind: 'map', indexOf: null },
    { id: 'i', name: 'i', kind: 'value', indexOf: null },
    { id: 'n', name: 'n', kind: 'value', indexOf: null }
  ],
  steps: [
    { line: 2, endLine: 2, focus: '', kind: 'call', result: '', reads: [], updates: [{ entity: 'nums', value: v({ items: ['2', '7', '11'] }) }, { entity: 'target', value: v({ scalar: '9' }) }] },
    { line: 3, endLine: 3, focus: '', kind: 'assign', result: '', reads: [], updates: [{ entity: 'seen', value: v({}) }] },
    { line: 4, endLine: 4, focus: 'for i, n in enumerate(nums)', kind: 'loop', result: '', reads: ['nums'], updates: [{ entity: 'i', value: v({ scalar: '0' }) }, { entity: 'n', value: v({ scalar: '2' }) }] },
    { line: 5, endLine: 5, focus: 'target - n in seen', kind: 'condition', result: 'false', reads: [], updates: [] },
    { line: 7, endLine: 7, focus: '', kind: 'assign', result: '', reads: [], updates: [{ entity: 'seen', value: v({ entries: [{ key: '2', value: '0' }] }) }] },
    { line: 4, endLine: 4, focus: 'for i, n in enumerate(nums)', kind: 'loop', result: '', reads: [], updates: [{ entity: 'i', value: v({ scalar: '1' }) }, { entity: 'n', value: v({ scalar: '7' }) }] },
    { line: 5, endLine: 5, focus: 'target - n in seen', kind: 'condition', result: 'true', reads: [], updates: [] },
    { line: 6, endLine: 6, focus: '', kind: 'return', result: '[0, 1]', reads: [], updates: [] },
    { line: 6, endLine: 6, focus: '', kind: 'other', result: 'IndexError: list index out of range', reads: [], updates: [] }
  ]
}

describe('narrateStep', () => {
  it('says each step in a few words, on screen and out loud', () => {
    const lines = TWO_SUM.steps.map((_, i) => narrateStep(TWO_SUM, i))
    expect(lines.map((l) => l.text)).toEqual([
      'Start with nums = [2, 7, 11] and target = 9.',
      'seen = {}.',
      'The loop starts: i = 0 and n = 2.',
      'target - n in seen? No.',
      'seen[2] = 0.',
      'Next pass: i = 1 and n = 7.',
      'target - n in seen? Yes.',
      'Return [0, 1].',
      'It crashes here: IndexError: list index out of range'
    ])
    expect(lines.map((l) => l.speech)).toEqual([
      'Start with nums as the list 2, 7, 11 and target as 9.',
      'seen starts as an empty dictionary.',
      'The loop starts: i starts as 0 and n starts as 2.',
      'Is target minus n in seen? No.',
      'seen gets 2, mapped to 0.',
      'Next pass: i is now 1 and n is now 7.',
      'Is target minus n in seen? Yes.',
      'Return the list 0, 1.',
      'It crashes here. IndexError, list index out of range.'
    ])
  })
})

describe('sayCode', () => {
  it('turns code symbols into words', () => {
    expect(sayCode('nums[i] >= best')).toBe('nums at i is at least best')
    expect(sayCode('len(stack) == 0')).toBe('the length of stack equals 0')
    expect(sayCode('x not in seen')).toBe('x is not in seen')
  })
})
