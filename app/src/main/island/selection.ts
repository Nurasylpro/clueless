// Notices when the student finishes highlighting text in any app, and reads what they highlighted.
// Runs only while the island is showing. Apps don't share their selection, so on a select gesture
// we press Ctrl/Cmd+C for the student, read the clipboard, and put their clipboard back.
import { clipboard, ClipboardItem, screen, type ClipboardBookmark } from 'electron'
import { uIOhook, UiohookKey, type UiohookMouseEvent } from 'uiohook-napi'
import { isSelectGesture, type Press } from './gesture'

export interface Point {
  x: number
  y: number
}

export interface SelectionHandlers {
  /** True when the point (DIP) is on one of Clueless's own windows: those clicks are ignored. */
  isOwnWindowAt(p: Point): boolean
  /** Highlighting is off right now (for example, during the full-screen animation). */
  paused(): boolean
  /** Text was highlighted; `at` is the cursor (DIP) where the mouse was released. */
  onSelection(text: string, at: Point): void
  /** Any other click or key press: the Ask button should go away. */
  onOtherInput(at: Point | null): void
}

const LEFT_BUTTON = 1
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class SelectionWatcher {
  private listening = false
  private running = false
  private down: Press | null = null
  private probing = false

  constructor(private readonly handlers: SelectionHandlers) {}

  start(): void {
    if (this.running) return
    if (!this.listening) {
      uIOhook.on('mousedown', (e) => this.onDown(e))
      uIOhook.on('mouseup', (e) => void this.onUp(e))
      uIOhook.on('keydown', () => {
        if (this.running && !this.probing) this.handlers.onOtherInput(null)
      })
      this.listening = true
    }
    uIOhook.start()
    this.running = true
  }

  stop(): void {
    if (!this.running) return
    uIOhook.stop()
    this.running = false
    this.down = null
  }

  private onDown(e: UiohookMouseEvent): void {
    if (!this.running || this.probing) return
    const at = screen.getCursorScreenPoint()
    if (e.button !== LEFT_BUTTON || this.handlers.isOwnWindowAt(at)) {
      this.down = null
      return
    }
    this.down = { x: e.x, y: e.y }
    this.handlers.onOtherInput(at)
  }

  private async onUp(e: UiohookMouseEvent): Promise<void> {
    if (!this.running || this.probing || e.button !== LEFT_BUTTON || this.handlers.paused()) return
    const down = this.down
    this.down = null
    const at = screen.getCursorScreenPoint()
    if (this.handlers.isOwnWindowAt(at)) return
    if (!isSelectGesture(down, { x: e.x, y: e.y, clicks: e.clicks })) return
    await sleep(60) // let the app finish updating its selection
    const text = await this.copySelection()
    if (text) this.handlers.onSelection(text, at)
  }

  /** Press Ctrl/Cmd+C for the student, read what got copied, then restore their clipboard. */
  private async copySelection(): Promise<string | null> {
    this.probing = true
    const saved = await saveClipboard()
    const marker = `⁣clueless-${Date.now()}`
    try {
      await clipboard.writeText(marker)
      uIOhook.keyTap(UiohookKey.C, [process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl])
      for (let i = 0; i < 12; i++) {
        await sleep(40)
        const text = await clipboard.readText()
        if (text !== marker) return text.trim() ? text : null
      }
      return null // nothing was selected (the copy didn't change the clipboard)
    } finally {
      await restoreClipboard(saved)
      await sleep(30) // swallow the key events our own Ctrl+C produced
      this.probing = false
    }
  }
}

/** Copy everything on the clipboard (every format) so it can be put back exactly. */
async function saveClipboard(): Promise<ClipboardItem[]> {
  try {
    const items = await clipboard.read()
    return await Promise.all(
      items.map(async (item) => {
        const data: Record<string, string | Blob | ClipboardBookmark> = {}
        for (const type of item.types) {
          try {
            data[type] = await item.getType(type)
          } catch {
            // a format that can't be read back is skipped
          }
        }
        return new ClipboardItem(data)
      })
    )
  } catch {
    return []
  }
}

async function restoreClipboard(saved: ClipboardItem[]): Promise<void> {
  try {
    if (saved.length) await clipboard.write(saved)
    else clipboard.clear()
  } catch {
    clipboard.clear()
  }
}
