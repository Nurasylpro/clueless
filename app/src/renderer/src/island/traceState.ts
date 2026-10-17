// Pure helpers for playing a trace: every entity's value at a step, and exactly what changed.
// The app works out the changes itself (Claude only sends full values), so a highlight is never
// on the wrong cell.
import type { CodeTrace, EntityValue } from '../../../shared/trace'

export type Values = Record<string, EntityValue>

export interface Change {
  added: boolean // first value (the entity appears)
  scalar: boolean // a value entity changed
  indices: number[] // array cells that changed
  cells: string[] // grid cells that changed, as "r,c"
  items: string[] // set items that are new
  keys: string[] // map keys that are new or changed
}

/** Values after steps 0..index have run. index -1 = before anything ran. */
export function valuesAt(trace: CodeTrace, index: number): Values {
  const values: Values = {}
  for (const step of trace.steps.slice(0, index + 1)) {
    for (const u of step.updates) values[u.entity] = u.value
  }
  return values
}

/** What step `index` changed, per entity. */
export function changesAt(trace: CodeTrace, index: number): Record<string, Change> {
  const step = trace.steps[index]
  if (!step) return {}
  const before = valuesAt(trace, index - 1)
  const out: Record<string, Change> = {}
  for (const u of step.updates) out[u.entity] = diff(before[u.entity], u.value)
  return out
}

function diff(prev: EntityValue | undefined, next: EntityValue): Change {
  const change: Change = { added: !prev, scalar: false, indices: [], cells: [], items: [], keys: [] }
  if (!prev) return change
  change.scalar = prev.scalar !== next.scalar
  next.items.forEach((v, i) => {
    if (prev.items[i] !== v) change.indices.push(i)
  })
  const had = new Set(prev.items)
  change.items = next.items.filter((v) => !had.has(v))
  next.rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (prev.rows[r]?.[c] !== v) change.cells.push(`${r},${c}`)
    })
  )
  const oldMap = new Map(prev.entries.map((e) => [e.key, e.value]))
  change.keys = next.entries.filter((e) => oldMap.get(e.key) !== e.value).map((e) => e.key)
  return change
}

/** Which pass of its loop a loop step is (1 = first time the header runs). */
export function loopPass(trace: CodeTrace, index: number): number {
  const step = trace.steps[index]
  if (!step || step.kind !== 'loop') return 0
  return trace.steps.slice(0, index + 1).filter((s) => s.kind === 'loop' && s.line === step.line).length
}

/** Index variables pointing into an array: { arrayId: [{ name, index }] }, from their current values. */
export function pointersAt(trace: CodeTrace, values: Values): Record<string, { name: string; index: number }[]> {
  const out: Record<string, { name: string; index: number }[]> = {}
  for (const e of trace.entities) {
    if (!e.indexOf || e.kind !== 'value') continue
    const target = trace.entities.find((t) => t.id === e.indexOf)
    const index = Number(values[e.id]?.scalar)
    if (target?.kind !== 'array' || !Number.isInteger(index)) continue
    if (index < 0 || index >= (values[target.id]?.items.length ?? 0)) continue
    ;(out[target.id] ??= []).push({ name: e.name, index })
  }
  return out
}
