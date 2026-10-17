import { describe, expect, it } from 'vitest'
import { checkAnswer, normalize } from './check'

describe('normalize', () => {
  it('turns typed math into math.js syntax', () => {
    expect(normalize('y = x²·eˣ − 2x eˣ')).toBe('x^2*e^x - 2x e^x')
    expect(normalize('a = 4.9 m/s²')).toBe('4.9 m/s^2')
    expect(normalize('√x + π')).toBe('sqrt(x) + pi')
  })
})

describe('antiderivative', () => {
  const check = { kind: 'antiderivative' as const, reference: 'x^2*e^x', variable: 'x', unit: null }

  it('accepts a correct antiderivative, with or without + C', () => {
    expect(checkAnswer(check, 'x^2 e^x - 2x e^x + 2e^x + C').status).toBe('match')
    expect(checkAnswer(check, 'e^x (x^2 - 2x + 2)').status).toBe('match')
  })

  it('catches the sign error from the demo', () => {
    expect(checkAnswer(check, 'x^2 e^x - 2x e^x - 2e^x + C').status).toBe('mismatch')
  })
})

describe('equivalent', () => {
  const check = { kind: 'equivalent' as const, reference: '(x+1)^2', variable: 'x', unit: null }

  it('matches algebraically equal forms', () => {
    expect(checkAnswer(check, 'x^2 + 2x + 1').status).toBe('match')
    expect(checkAnswer(check, 'x^2 + 1').status).toBe('mismatch')
  })

  it('handles ln and plain numbers', () => {
    expect(checkAnswer({ kind: 'equivalent', reference: 'log(x)', variable: 'x', unit: null }, 'ln(x)').status).toBe('match')
    expect(checkAnswer({ kind: 'equivalent', reference: '1/2', variable: null, unit: null }, '0.5').status).toBe('match')
  })

  it('reports gibberish as unparseable', () => {
    expect(checkAnswer(check, 'x +* (').status).toBe('unparseable')
  })
})

describe('units', () => {
  const check = { kind: 'units' as const, reference: '4.905 m/s^2', variable: null, unit: 'm/s^2' }

  it('accepts a rounded value with the right units', () => {
    expect(checkAnswer(check, '4.9 m/s^2').status).toBe('match')
    expect(checkAnswer(check, 'a = 4.9 m/s²').status).toBe('match')
  })

  it('flags wrong values, wrong units and missing units', () => {
    expect(checkAnswer(check, '8.5 m/s^2').status).toBe('mismatch')
    expect(checkAnswer(check, '4.9 m/s').status).toBe('wrong_units')
    expect(checkAnswer(check, '4.9').status).toBe('missing_units')
  })
})
