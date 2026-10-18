import type { CodeTrace } from '../../../shared/trace'

export interface TraceMoment {
  title: string
  detail: string
  tone: 'amber' | 'sky'
}

/** Emphasize a change in the path taken, not every ordinary comparison. */
export function momentAt(trace: CodeTrace, index: number): TraceMoment | null {
  const step = trace.steps[index]
  if (!step) return null
  if (step.kind === 'return') {
    return { title: 'Here’s the result', detail: step.result ? `Returned ${step.result}` : 'The function returns here.', tone: 'sky' }
  }
  if (step.kind !== 'condition' || !/^(true|false)$/i.test(step.result)) return null
  const previous = trace.steps.slice(0, index).findLast((s) => s.kind === 'condition' && s.line === step.line && s.focus === step.focus)
  if (!previous || !/^(true|false)$/i.test(previous.result) || previous.result.toLowerCase() === step.result.toLowerCase()) return null
  return {
    title: `Now this condition is ${step.result.toLowerCase()}`,
    detail: 'The outcome changed. Watch which path runs next.',
    tone: 'amber'
  }
}

/** Extra reading time when the control flow changes or the result first appears. */
export function stepDuration(trace: CodeTrace, index: number, base: number): number {
  return base + (momentAt(trace, index) ? 1000 : 0)
}

export function finishMessage(trace: CodeTrace): { title: string; detail: string; celebrate: boolean } {
  if (trace.outcome?.status === 'matched') {
    return { title: 'Nice work — this example matches!', detail: `Expected ${trace.outcome.expected} · Returned ${trace.outcome.actual}`, celebrate: true }
  }
  if (trace.outcome?.status === 'mismatch') {
    return { title: 'The result differs from the example', detail: `Expected ${trace.outcome.expected} · Returned ${trace.outcome.actual}`, celebrate: false }
  }
  const final = trace.steps.at(-1)
  return {
    title: final?.kind === 'return' ? 'You’ve reached the result' : 'End of this walkthrough',
    detail: final?.kind === 'return' && final.result ? `Returned ${final.result}` : 'Take a moment to look at the final state.',
    celebrate: false
  }
}
