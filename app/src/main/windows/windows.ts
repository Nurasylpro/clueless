// The floating overlay panel and the full-screen "select an area" window.
import { app, BrowserWindow, screen, shell, type Display } from 'electron'
import { join } from 'node:path'
import type { Rect } from '../../shared/contracts'

/** The window wraps the panel (plus an 8px margin for its shadow) and follows its height. */
export const PANEL_WIDTH = 416
const MIN_WIDTH = 320
const MAX_WIDTH = 960
const MARGIN = 16

// macOS: a 'panel' window floats over full-screen apps and appears on every Space, and it takes
// keyboard focus without activating the app, so a full-screen browser isn't switched away from.
const PANEL_TYPE = process.platform === 'darwin' ? { type: 'panel' } : {}

const webPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}

export function loadRenderer(win: BrowserWindow, hash = ''): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(hash ? `${devUrl}#${hash}` : devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
}

export function createOverlay(): BrowserWindow {
  const work = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: 180, // the panel reports its real height right after it renders
    x: work.x + work.width - PANEL_WIDTH - 16,
    y: work.y + 16,
    title: 'Clueless',
    show: false,
    frame: false,
    transparent: true, // transparent windows can't be resized natively: the panel's own grips resize it
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    ...PANEL_TYPE,
    webPreferences
  })
  // 'screen-saver' keeps it above full-screen windows (and above browsers in F11 on Windows).
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  // Don't call win.setContentProtection(true): it hides the window from screen sharing, and
  // Clueless should stay visible.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  loadRenderer(win)
  return win
}

/** Make the window exactly as tall as the panel, keeping it on screen. */
export function fitPanelHeight(win: BrowserWindow, panelHeight: number): void {
  if (!Number.isFinite(panelHeight)) return
  const [x, y] = win.getPosition()
  const work = screen.getDisplayNearestPoint({ x, y }).workArea
  const height = Math.max(48, Math.min(Math.round(panelHeight) + MARGIN, work.height - 16))
  const [width, current] = win.getSize()
  if (Math.abs(current - height) < 2) return
  const top = Math.max(work.y, Math.min(y, work.y + work.height - height)) // grow downward, never off-screen
  win.setBounds({ x, y: top, width, height })
}

/** The student dragged a side edge. `anchor` is the edge that stays put; the window stays on screen. */
export function resizePanelWidth(win: BrowserWindow, width: number, anchor: 'left' | 'right'): void {
  if (!Number.isFinite(width)) return
  const b = win.getBounds()
  const work = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea
  const w = Math.round(Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH, work.width - 16)))
  if (w === b.width) return
  const x = anchor === 'right' ? b.x + b.width - w : b.x
  win.setBounds({ x: Math.max(work.x, Math.min(x, work.x + work.width - w)), y: b.y, width: w, height: b.height })
}

// ---------- area selection ----------

let finishSelection: ((rect: Rect | null) => void) | null = null

/** Show a dimmed full-screen layer on `display` and let the student drag a box. */
export function selectArea(display: Display): Promise<Rect | null> {
  finishSelection?.(null)
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      ...PANEL_TYPE,
      webPreferences
    })
    win.setAlwaysOnTop(true, 'screen-saver', 1) // one level above the panel
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })

    const done = (rect: Rect | null): void => {
      if (finishSelection !== done) return
      finishSelection = null
      if (!win.isDestroyed()) win.close()
      resolve(rect)
    }
    finishSelection = done
    win.on('closed', () => done(null))
    win.once('ready-to-show', () => {
      win.setBounds(display.bounds) // macOS may nudge it below the menu bar on creation
      win.show()
      win.focus()
    })
    loadRenderer(win, 'select')
  })
}

export function resolveAreaSelection(rect: Rect | null): void {
  finishSelection?.(rect)
}

// ---------- the island ----------

export type IslandMode = 'pill' | 'card' | 'full'

/** The island: one see-through window that is the pill (top center), the pill + a text card, or
 *  the whole screen during an animation. It shows without taking focus, so the app the student
 *  is in (and their highlight) stays active. */
export function createIsland(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 64,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    title: 'Clueless',
    ...PANEL_TYPE,
    webPreferences
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  // Never call win.setContentProtection(true): Clueless stays visible on screen share by design.
  loadRenderer(win, 'island')
  return win
}

/** Pill and card: `size` is the content, centered at the top of the display. Full: the whole display. */
export function placeIsland(win: BrowserWindow, display: Display, mode: IslandMode, size: { width: number; height: number }): void {
  if (mode === 'full') {
    win.setBounds(display.bounds)
    return
  }
  const work = display.workArea
  const width = Math.min(Math.ceil(size.width), work.width)
  const height = Math.min(Math.ceil(size.height), work.height - 16)
  win.setBounds({ x: Math.round(work.x + (work.width - width) / 2), y: work.y + 6, width, height })
}

export const ASK_BUTTON_SIZE = { width: 104, height: 48 }

/** The little "Ask" button that appears next to the cursor after a highlight. Never takes focus. */
export function createAskButton(): BrowserWindow {
  const win = new BrowserWindow({
    ...ASK_BUTTON_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    ...PANEL_TYPE,
    webPreferences
  })
  win.setAlwaysOnTop(true, 'screen-saver', 2) // above the island
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  loadRenderer(win, 'ask')
  return win
}

/** Just below and right of where the mouse was released, kept on screen. */
export function placeAskButton(win: BrowserWindow, at: { x: number; y: number }, display: Display): void {
  const work = display.workArea
  const { width, height } = ASK_BUTTON_SIZE
  const x = Math.max(work.x, Math.min(at.x + 6, work.x + work.width - width))
  const y = Math.max(work.y, Math.min(at.y + 12, work.y + work.height - height))
  win.setBounds({ x, y, width, height })
}
