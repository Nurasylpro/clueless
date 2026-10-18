// Did a mouse press + release just select text? (No Electron imports, so it's unit-tested.)

export interface Press {
  x: number
  y: number
}

export interface Release extends Press {
  clicks: number // 2 = double click (selects a word), 3 = triple click (a line)
}

/** A drag of a few pixels, or a double / triple click, is how people highlight text. */
export function isSelectGesture(down: Press | null, up: Release, minDrag = 6): boolean {
  if (up.clicks >= 2) return true
  if (!down) return false
  return Math.hypot(up.x - down.x, up.y - down.y) >= minDrag
}
