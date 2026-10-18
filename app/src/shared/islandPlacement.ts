/** Coordinates are display-independent pixels, including displays left/above the primary one. */
export interface Area { x: number; y: number; width: number; height: number }
export interface IslandAnchor { x: number; y: number }

export function islandBounds(work: Area, size: { width: number; height: number }, anchor?: IslandAnchor): Area {
  const margin = 6
  const width = Math.min(Math.ceil(size.width), Math.max(1, work.width - margin * 2))
  const height = Math.min(Math.ceil(size.height), Math.max(1, work.height - margin * 2))
  const center = anchor?.x ?? work.x + work.width / 2
  const top = anchor?.y ?? work.y + margin
  return {
    x: Math.round(Math.max(work.x + margin, Math.min(center - width / 2, work.x + work.width - width - margin))),
    y: Math.round(Math.max(work.y + margin, Math.min(top, work.y + work.height - height - margin))),
    width,
    height
  }
}
