// Full-screen layer for "select just the problem": drag a box, Esc to cancel.
import { useEffect, useState, type MouseEvent } from 'react'
import { api } from '../api'

interface Point {
  x: number
  y: number
}

export function AreaSelector() {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') api.areaCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rect =
    start && end
      ? {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y)
        }
      : null

  const point = (e: MouseEvent): Point => ({ x: e.clientX, y: e.clientY })

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      onMouseDown={(e) => {
        setStart(point(e))
        setEnd(point(e))
      }}
      onMouseMove={(e) => start && setEnd(point(e))}
      onMouseUp={() => {
        if (rect && rect.width >= 8 && rect.height >= 8) api.areaDone(rect)
        else {
          setStart(null)
          setEnd(null)
        }
      }}
    >
      {rect ? (
        <div
          className="absolute rounded-sm border-2 border-claude-500"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.35)'
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/35" />
      )}
      <div className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 rounded-full bg-zinc-900/90 px-4 py-2 text-sm text-white shadow-lg">
        Drag around the problem · <span className="text-zinc-400">Esc to cancel</span>
      </div>
    </div>
  )
}
