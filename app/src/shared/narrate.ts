// One short line per trace step, made from the step itself (no model call): shown under the
// animation and, with voice on, read aloud. The animation moves on when the line has been read,
// so voice and picture stay in step.
import type { CodeTrace, EntityKind, EntityValue } from './trace'

export interface Narration {
  text: string // shown on screen; code stays code
  speech: string // read aloud; symbols turned into words
}

export function narrateStep(trace: CodeTrace, index: number): Narration {
  const step = trace.steps[index]
  if (!step) return { text: '', speech: '' }
  const before = valuesBefore(trace, index)
  const kinds = new Map(trace.entities.map((e) => [e.id, e.kind]))
  const names = new Map(trace.entities.map((e) => [e.id, e.name]))
  const changes = step.updates.map((u) => describeUpdate(names.get(u.entity) ?? u.entity, kinds.get(u.entity) ?? 'value', before[u.entity], u.value))
  const line = trace.code.split('\n')[step.line - 1]?.trim() ?? ''

  switch (step.kind) {
    case 'call': {
      const parts = step.updates.map((u) => describeValue(names.get(u.entity) ?? u.entity, kinds.get(u.entity) ?? 'value', u.value))
      return join('Start with', parts, '.')
    }
    case 'loop': {
      const pass = trace.steps.slice(0, index + 1).filter((s) => s.kind === 'loop' && s.line === step.line).length
      if (!changes.length) return { text: 'The loop is done.', speech: 'The loop is done.' }
      return join(pass === 1 ? 'The loop starts:' : 'Next pass:', changes.map(asIs), '.')
    }
    case 'condition': {
      const yes = /^true$/i.test(step.result)
      const asked = step.focus || line.replace(/^(if|elif|while)\s+/, '').replace(/:$/, '')
      return { text: `${asked}? ${yes ? 'Yes.' : 'No.'}`, speech: `Is ${sayCode(asked)}? ${yes ? 'Yes.' : 'No.'}` }
    }
    case 'return':
      return step.result
        ? { text: `Return ${step.result}.`, speech: `Return ${sayValue(step.result)}.` }
        : { text: 'Return.', speech: 'Return.' }
    default: {
      if (step.kind === 'other' && /^[A-Z]\w*(Error|Exception)\b/.test(step.result)) {
        return { text: `It crashes here: ${step.result}`, speech: `It crashes here. ${step.result.replace(/:/, ',')}.` }
      }
      if (changes.length) return join('', changes, '.')
      if (/^break\b/.test(line)) return { text: 'Break out of the loop.', speech: 'Break out of the loop.' }
      if (/^continue\b/.test(line)) return { text: 'Skip to the next pass.', speech: 'Skip to the next pass.' }
      return { text: line, speech: sayCode(line) }
    }
  }
}

function valuesBefore(trace: CodeTrace, index: number): Record<string, EntityValue> {
  const values: Record<string, EntityValue> = {}
  for (const s of trace.steps.slice(0, index)) for (const u of s.updates) values[u.entity] = u.value
  return values
}

const asIs = (n: Narration): Narration => n

function join(lead: string, parts: Narration[], end: string): Narration {
  const glue = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  const text = glue(parts.map((p) => p.text))
  const speech = glue(parts.map((p) => p.speech))
  return { text: `${lead ? `${lead} ` : ''}${text}${end}`.trim(), speech: `${lead ? `${lead} ` : ''}${speech}${end}`.trim() }
}

/** "nums = [2, 7]" for the start of a run. */
function describeValue(name: string, kind: EntityKind, v: EntityValue): Narration {
  const shown = show(kind, v)
  return { text: `${name} = ${shown}`, speech: `${name} as ${sayWhole(kind, v).replace(/^is /, '')}` }
}

/** What changed, in a few words: "seen gets 2 → 0", "nums[3] becomes 5", "add 5 to seen". */
function describeUpdate(name: string, kind: EntityKind, prev: EntityValue | undefined, next: EntityValue): Narration {
  if (!prev) return { text: `${name} = ${show(kind, next)}`, speech: `${name} starts as ${sayWhole(kind, next).replace(/^(is|=) /, '')}` }
  if (kind === 'value') return { text: `${name} = ${next.scalar}`, speech: `${name} is now ${sayValue(next.scalar)}` }
  if (kind === 'map') {
    const old = new Map(prev.entries.map((e) => [e.key, e.value]))
    const changed = next.entries.filter((e) => old.get(e.key) !== e.value)
    if (changed.length === 1) {
      const e = changed[0]
      return { text: `${name}[${e.key}] = ${e.value}`, speech: `${name} gets ${sayValue(e.key)}, mapped to ${sayValue(e.value)}` }
    }
  }
  if (kind === 'set') {
    const had = new Set(prev.items)
    const added = next.items.filter((i) => !had.has(i))
    if (added.length === 1) return { text: `add ${added[0]} to ${name}`, speech: `add ${sayValue(added[0])} to ${name}` }
  }
  if (kind === 'array' && prev.items.length === next.items.length) {
    const at = next.items.map((v, i) => (prev.items[i] !== v ? i : -1)).filter((i) => i >= 0)
    if (at.length === 1) return { text: `${name}[${at[0]}] = ${next.items[at[0]]}`, speech: `${name} at ${at[0]} becomes ${sayValue(next.items[at[0]])}` }
  }
  if (kind === 'array' && next.items.length === prev.items.length + 1 && prev.items.every((v, i) => next.items[i] === v)) {
    const added = next.items[next.items.length - 1]
    return { text: `append ${added} to ${name}`, speech: `append ${sayValue(added)} to ${name}` }
  }
  return { text: `${name} = ${show(kind, next)}`, speech: `${name} is now ${sayWhole(kind, next).replace(/^(is|=) /, '')}` }
}

function show(kind: EntityKind, v: EntityValue): string {
  if (kind === 'value') return v.scalar
  if (kind === 'grid') return `${v.rows.length}×${Math.max(0, ...v.rows.map((r) => r.length))} grid`
  if (kind === 'map') return `{${v.entries.map((e) => `${e.key}: ${e.value}`).join(', ')}}`
  if (kind === 'set') return `{${v.items.join(', ')}}`
  return `[${v.items.join(', ')}]`
}

/** The whole value, said briefly: "is 9", "is the list 2, 7, 11", "is an empty set". */
function sayWhole(kind: EntityKind, v: EntityValue): string {
  if (kind === 'value') return `is ${sayValue(v.scalar)}`
  if (kind === 'grid') return `is a ${v.rows.length} by ${Math.max(0, ...v.rows.map((r) => r.length))} grid`
  const count = kind === 'map' ? v.entries.length : v.items.length
  const noun = kind === 'map' ? 'dictionary' : kind === 'set' ? 'set' : 'list'
  if (!count) return `is an empty ${noun}`
  if (count > 6) return `is a ${noun} of ${count} items`
  if (kind === 'map') return `is the ${noun} ${v.entries.map((e) => `${sayValue(e.key)} to ${sayValue(e.value)}`).join(', ')}`
  return `is the ${noun} ${v.items.map(sayValue).join(', ')}`
}

function sayValue(v: string): string {
  const t = v.trim()
  if (/^'.*'$|^".*"$/.test(t)) return t.length === 3 ? `the letter ${t[1]}` : `the text ${t.slice(1, -1)}`
  if (t === '[]') return 'an empty list'
  if (t === '{}') return 'an empty dictionary'
  if (/^\[.*\]$/.test(t)) return `the list ${t.slice(1, -1)}`
  return sayCode(t)
}

const SPOKEN: [RegExp, string][] = [
  [/\bnot in\b/g, ' is not in '],
  [/\bis not\b/g, ' is not '],
  [/==/g, ' equals '],
  [/!=/g, ' is not equal to '],
  [/<=/g, ' is at most '],
  [/>=/g, ' is at least '],
  [/</g, ' is less than '],
  [/>/g, ' is greater than '],
  [/\/\//g, ' divided by '],
  [/\*\*/g, ' to the power of '],
  [/(\w)\s*-\s*(\w)/g, '$1 minus $2'],
  [/\+/g, ' plus '],
  [/\*/g, ' times '],
  [/%/g, ' mod '],
  [/\blen\(([^()]+)\)/g, 'the length of $1'],
  [/(\w)\[([^\]]+)\]/g, '$1 at $2'],
  [/[()[\]{}:]/g, ' '],
  [/_/g, ' ']
]

/** Code read out loud: `target - n in seen` -> "target minus n in seen". */
export function sayCode(code: string): string {
  let out = code
  for (const [re, to] of SPOKEN) out = out.replace(re, to)
  return out.replace(/\s+/g, ' ').trim()
}
