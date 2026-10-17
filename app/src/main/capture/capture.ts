// Screen capture with Electron's desktopCapturer (works on macOS and Windows).
import { desktopCapturer, screen, systemPreferences, type Display, type NativeImage } from 'electron'
import type { AppStatus, Rect } from '../../shared/contracts'
import type { ImageInput } from '../tutor/tutor'

/** The display under the mouse: that's where the student is working. */
export function activeDisplay(): Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

export async function captureDisplay(display: Display): Promise<NativeImage | null> {
  const { width, height } = display.size
  const sf = display.scaleFactor
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) }
  })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) return null
  return source.thumbnail
}

/** Crop a rectangle given in window (DIP) coordinates out of a full-resolution display capture. */
export function cropToRect(image: NativeImage, rect: Rect, display: Display): NativeImage {
  const img = image.getSize()
  // The capture may not be exactly size * scaleFactor; scale by the real ratio.
  const sx = img.width / display.size.width
  const sy = img.height / display.size.height
  const x = Math.max(0, Math.round(rect.x * sx))
  const y = Math.max(0, Math.round(rect.y * sy))
  return image.crop({
    x,
    y,
    width: Math.min(img.width - x, Math.round(rect.width * sx)),
    height: Math.min(img.height - y, Math.round(rect.height * sy))
  })
}

/** Shrink and compress for Claude: smaller images mean faster, cheaper turns. */
export function toModelImage(image: NativeImage, maxWidth = 1600): ImageInput {
  const { width } = image.getSize()
  const sized = width > maxWidth ? image.resize({ width: maxWidth, quality: 'good' }) : image
  return { data: sized.toJPEG(82).toString('base64'), mediaType: 'image/jpeg' }
}

/** Tiny grayscale thumbnail for stuck detection (never leaves the laptop). */
export async function grayThumbnail(display: Display, width = 96, height = 54): Promise<Uint8Array | null> {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) return null
  const img = source.thumbnail.resize({ width, height })
  const bgra = img.toBitmap() // BGRA on both macOS and Windows
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (bgra[i * 4] * 0.114 + bgra[i * 4 + 1] * 0.587 + bgra[i * 4 + 2] * 0.299) | 0
  }
  return gray
}

/** Titles of open windows. Browser windows carry the current tab's title. */
export async function windowTitles(): Promise<string[]> {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
  return sources.map((s) => s.name)
}

export function screenAccess(): AppStatus['screenAccess'] {
  if (process.platform !== 'darwin') return 'granted'
  const status = systemPreferences.getMediaAccessStatus('screen')
  return status === 'granted' || status === 'denied' || status === 'not-determined' || status === 'restricted'
    ? status
    : 'unknown'
}
