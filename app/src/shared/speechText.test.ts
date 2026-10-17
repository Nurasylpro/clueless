import { describe, expect, it } from 'vitest'
import { speakMath, speechChunks, toSpeech } from './speechText'

describe('speakMath', () => {
  it('reads common math aloud', () => {
    expect(speakMath('x^2 + 3x = 7')).toBe('x squared plus 3x equals 7')
    expect(speakMath('\\frac{a}{b}')).toBe('a over b')
    expect(speakMath('\\sqrt{x+1}')).toBe('the square root of x plus 1')
    expect(speakMath('\\int x^2 e^x \\, dx')).toBe('the integral of x squared e to the power of x d x')
    expect(speakMath('e^{2x}')).toBe('e to the power of 2x')
    expect(speakMath('a_i \\le b_{n+1}')).toBe('a sub i is less than or equal to b sub n plus 1')
    expect(speakMath('\\theta = \\pi / 2')).toBe('theta equals pi over 2')
    expect(speakMath('-3')).toBe('negative 3')
    expect(speakMath('n - 1')).toBe('n minus 1')
    expect(speakMath('\\frac{\\sqrt{2}}{2}')).toBe('the square root of 2 over 2')
  })
})

describe('toSpeech', () => {
  it('drops Markdown and LaTeX markup', () => {
    const md = [
      '## Step 1',
      'What happens to **both sides** when you subtract $3$?',
      '- Try $2x + 3 = 7$',
      '- Use `seen = set()`',
      '```python',
      'for x in nums: pass',
      '```'
    ].join('\n')
    const spoken = toSpeech(md)
    expect(spoken).toBe(
      'Step 1. What happens to both sides when you subtract 3? Try 2x plus 3 equals 7. Use seen = set(). (see the code block).'
    )
    expect(spoken).not.toMatch(/[*$`#\\]/)
  })

  it('handles display math and links', () => {
    expect(toSpeech('Recall $$\\int u\\,dv = uv - \\int v\\,du$$ from [the notes](https://x.y)')).toBe(
      'Recall the integral of u d v equals uv minus the integral of v d u. from the notes.'
    )
  })

  it('leaves plain sentences alone', () => {
    expect(toSpeech('Which number repeats? Look at row 3.')).toBe('Which number repeats? Look at row 3.')
  })
})

describe('speechChunks', () => {
  it('groups sentences under the limit and splits long ones', () => {
    expect(speechChunks('One. Two. Three.', 9)).toEqual(['One. Two.', 'Three.'])
    const long = 'word '.repeat(100).trim() + '.'
    const parts = speechChunks(long, 50)
    expect(parts.every((p) => p.length <= 50)).toBe(true)
    expect(parts.join(' ')).toBe(long)
  })
})
