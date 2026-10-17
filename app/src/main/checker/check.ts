// Answer checker: math.js decides whether a math/physics answer is right, so a correct answer
// is never marked wrong because of an AI arithmetic slip.
import { all, create, type MathNode } from 'mathjs'
import type { AnswerCheck, CheckResult } from '../../shared/contracts'
import { normalize } from '../../shared/mathText'

export { normalize }

const math = create(all, {})

const CONSTANTS = new Set(['e', 'pi', 'i', 'E', 'PI', 'Infinity', 'NaN', 'true', 'false', 'null'])

/** Remove a trailing "+ C" (constant of integration). */
function dropConstant(expr: string): string {
  return expr.replace(/\+\s*C\s*$/, '').trim()
}

function symbols(node: MathNode): string[] {
  const names = new Set<string>()
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode' && !(parent?.type === 'FunctionNode' && path === 'fn')) {
      const name = (n as unknown as { name: string }).name
      if (!CONSTANTS.has(name) && !(name in math)) names.add(name)
    }
  })
  return [...names]
}

/** Compare two expressions at random points. Every free symbol gets the same random value in both. */
function sameFunction(a: MathNode, b: MathNode): boolean {
  const vars = [...new Set([...symbols(a), ...symbols(b)])]
  const fa = a.compile()
  const fb = b.compile()
  let tested = 0
  for (let attempt = 0; attempt < 40 && tested < 6; attempt++) {
    const scope: Record<string, number> = {}
    for (const v of vars) scope[v] = 0.3 + Math.random() * 2.4 // positive: safe for log/sqrt
    const va = fa.evaluate(scope)
    const vb = fb.evaluate(scope)
    if (typeof va !== 'number' || typeof vb !== 'number' || !isFinite(va) || !isFinite(vb)) continue
    tested++
    if (Math.abs(va - vb) > 1e-6 * Math.max(1, Math.abs(va), Math.abs(vb))) return false
  }
  return tested >= 3
}

export function checkAnswer(check: AnswerCheck, studentInput: string): CheckResult {
  const student = normalize(studentInput)
  if (!student) return { status: 'unparseable', detail: 'The answer was empty.' }
  try {
    if (check.kind === 'units') return checkUnits(check, student)

    const variable = check.variable || 'x'
    if (check.kind === 'antiderivative') {
      const derivative = math.derivative(math.parse(student), variable)
      const integrand = math.parse(normalize(check.reference))
      return sameFunction(derivative, integrand)
        ? { status: 'match', detail: "The derivative of the student's answer equals the integrand." }
        : { status: 'mismatch', detail: "The derivative of the student's answer does NOT equal the integrand." }
    }

    const ok = sameFunction(math.parse(dropConstant(student)), math.parse(dropConstant(normalize(check.reference))))
    return ok
      ? { status: 'match', detail: "The student's answer is equivalent to the reference." }
      : { status: 'mismatch', detail: "The student's answer is NOT equivalent to the reference." }
  } catch (err) {
    return { status: 'unparseable', detail: `math.js couldn't read the answer (${(err as Error).message}).` }
  }
}

function checkUnits(check: AnswerCheck, student: string): CheckResult {
  const expected = math.evaluate(normalize(check.reference))
  const got = math.evaluate(student)
  const unit = check.unit || (math.isUnit(expected) ? expected.formatUnits() : '')

  if (!math.isUnit(got)) {
    if (typeof got === 'number' && math.isUnit(expected) && close(got, expected.toNumber(unit))) {
      return { status: 'missing_units', detail: `The number is right but the student gave no units (expected ${unit}).` }
    }
    return typeof got === 'number'
      ? { status: 'missing_units', detail: `The student gave a number with no units (expected ${unit}).` }
      : { status: 'unparseable', detail: "math.js couldn't read the answer." }
  }
  let value: number
  try {
    value = got.toNumber(unit)
  } catch {
    return { status: 'wrong_units', detail: `The student's units (${got.formatUnits()}) don't match ${unit}.` }
  }
  const target = math.isUnit(expected) ? expected.toNumber(unit) : Number(expected)
  return close(value, target)
    ? { status: 'match', detail: `The value and units are right (within 2%).` }
    : { status: 'mismatch', detail: `The units are right but the value is off (more than 2% from the reference).` }
}

/** 2% tolerance: students round g to 9.8 or 10 differently. */
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.02 * Math.max(Math.abs(a), Math.abs(b), 1e-9)
}
