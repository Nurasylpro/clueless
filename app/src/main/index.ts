// Clueless main process. Runs in the background; Ctrl/Cmd+Shift+2 shows the island (a pill at the
// top of the screen). While it shows, highlighting text anywhere brings up an Ask button next to
// the cursor. Ask -> Claude reads the highlight (and the screen) -> a short text in the island ->
// with Animate on, 4 s later the island fills the screen and animates the code step by step.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, type Display, type Rectangle } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ISLAND_IPC, type IslandView } from '../shared/contracts'
import { IslandController, type ScreenImage } from '../shared/islandController'
import { activeDisplay, captureDisplay, toModelImage } from './capture/capture'
import { loadEnvFiles } from './env'
import { SelectionWatcher, type Point } from './island/selection'
import { Tracer } from './island/tracer'
import { createTransport } from './tutor/provider'
import { createTray } from './windows/tray'
import { createAskButton, createIsland, placeAskButton, placeIsland, type IslandMode } from './windows/windows'

const HOTKEY = 'CommandOrControl+Shift+2'
const ASK_BUTTON_MS = 4000
const SMOKE = process.env.CLUELESS_SMOKE === '1'

let island: BrowserWindow | null = null
let askButton: BrowserWindow | null = null
let islandDisplay: Display
let islandMode: IslandMode = 'pill'
let contentSize = { width: 320, height: 64 } // what the island's UI measured for the pill / card
let pendingSnippet: string | null = null
let askTimer: NodeJS.Timeout | null = null

const log = (line: string): void => console.log(`[clueless] ${line}`)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const contains = (r: Rectangle, p: Point): boolean => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height

function loadKeys(): void {
  // Dev: app/.env. Installed app: the .env in the user data folder.
  loadEnvFiles([join(process.cwd(), '.env'), join(app.getAppPath(), '.env'), join(app.getPath('userData'), '.env')])
}

// ---------- the controller ----------

const controller = new IslandController({
  makeTracer: () => {
    loadKeys() // pick up a key added since launch
    const transport = createTransport()
    return transport ? new Tracer(transport, log) : null
  },
  capture: captureForClaude,
  emit: (view) => {
    if (island && !island.isDestroyed()) island.webContents.send(ISLAND_IPC.view, view)
    applyMode(modeFor(view))
  },
  schedule: (fn, ms) => {
    const t = setTimeout(fn, ms)
    return () => clearTimeout(t)
  },
  now: () => Date.now()
})

function modeFor(view: IslandView): IslandMode {
  return view.phase === 'playing' ? 'full' : view.phase === 'idle' ? 'pill' : 'card'
}

function applyMode(mode: IslandMode): void {
  if (!island || island.isDestroyed()) return
  const wasFull = islandMode === 'full'
  islandMode = mode
  placeIsland(island, islandDisplay, mode, contentSize)
  if (mode === 'full' && !wasFull) island.focus() // so Esc reaches the animation
}

/** A screenshot of the display the student is working on, with Clueless's own windows hidden. */
async function captureForClaude(): Promise<ScreenImage | null> {
  const own = [island, askButton].filter((w): w is BrowserWindow => Boolean(w && !w.isDestroyed() && w.isVisible()))
  own.forEach((w) => w.setOpacity(0))
  await sleep(150)
  try {
    const image = await captureDisplay(islandDisplay)
    return image ? toModelImage(image) : null
  } catch (err) {
    log(`capture failed: ${(err as Error).message}`)
    return null
  } finally {
    own.forEach((w) => !w.isDestroyed() && w.setOpacity(1))
  }
}

// ---------- highlight -> Ask button ----------

const watcher = new SelectionWatcher({
  isOwnWindowAt: (p) =>
    [island, askButton].some((w) => w && !w.isDestroyed() && w.isVisible() && contains(w.getBounds(), p)),
  paused: () => islandMode === 'full',
  onSelection: (text, at) => {
    pendingSnippet = text
    showAskButton(at)
  },
  onOtherInput: (at) => {
    if (!askButton?.isVisible()) return
    if (!at || !contains(askButton.getBounds(), at)) hideAskButton()
  }
})

function showAskButton(at: Point): void {
  if (!askButton || askButton.isDestroyed()) return
  placeAskButton(askButton, at, screen.getDisplayNearestPoint(at))
  askButton.showInactive()
  armAskTimer()
}

/** The button goes away after a few seconds, unless the mouse is on it. */
function armAskTimer(): void {
  if (askTimer) clearTimeout(askTimer)
  askTimer = setTimeout(() => {
    if (askButton?.isVisible() && contains(askButton.getBounds(), screen.getCursorScreenPoint())) armAskTimer()
    else hideAskButton()
  }, ASK_BUTTON_MS)
}

function hideAskButton(): void {
  if (askTimer) clearTimeout(askTimer)
  askTimer = null
  if (askButton && !askButton.isDestroyed()) askButton.hide()
}

function onAsk(): void {
  const snippet = pendingSnippet
  const at = askButton?.getBounds()
  hideAskButton()
  if (!snippet) return
  if (at) islandDisplay = screen.getDisplayMatching(at)
  void controller.ask(snippet)
}

// ---------- show / hide ----------

function showIsland(): void {
  if (!island) return
  islandDisplay = activeDisplay()
  applyMode(modeFor(controller.current))
  island.showInactive() // keep the student's app (and its highlight) focused
  try {
    watcher.start()
  } catch (err) {
    log(`can't watch for highlights: ${(err as Error).message}`)
  }
}

function hideIsland(): void {
  watcher.stop()
  hideAskButton()
  controller.closeCard()
  island?.hide()
}

function toggleIsland(): void {
  if (island?.isVisible()) hideIsland()
  else showIsland()
}

// ---------- wiring ----------

const keepAlive: unknown[] = [] // the tray icon disappears if it's garbage-collected

function setup(): void {
  loadKeys()
  // An overlay, not a regular app: no dock icon on macOS (the menu-bar icon replaces it).
  if (process.platform === 'darwin') app.dock?.hide()
  // Copy, paste and select all in the follow-up box come from the Edit menu's roles.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(process.platform === 'darwin' ? [{ role: 'appMenu' }, { role: 'editMenu' }] : [{ role: 'editMenu' }])
  )

  ipcMain.handle(ISLAND_IPC.getView, () => controller.current)
  ipcMain.on(ISLAND_IPC.setAnimate, (_e, on: unknown) => controller.setAnimate(Boolean(on)))
  ipcMain.on(ISLAND_IPC.followUp, (_e, text: unknown) => {
    if (typeof text === 'string') void controller.followUp(text.slice(0, 2000))
  })
  ipcMain.on(ISLAND_IPC.closeCard, () => controller.closeCard())
  ipcMain.on(ISLAND_IPC.finish, () => controller.finishAnimation())
  ipcMain.on(ISLAND_IPC.hide, () => hideIsland())
  ipcMain.on(ISLAND_IPC.hold, (_e, hold: unknown) => controller.holdCard(Boolean(hold)))
  ipcMain.on(ISLAND_IPC.ask, () => onAsk())
  ipcMain.on(ISLAND_IPC.resize, (_e, size: { width: number; height: number }) => {
    if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height) || size.width < 1 || size.height < 1) return
    contentSize = { width: size.width, height: size.height }
    if (island && islandMode !== 'full') placeIsland(island, islandDisplay, islandMode, contentSize)
  })

  islandDisplay = activeDisplay()
  island = createIsland()
  island.on('closed', () => (island = null))
  askButton = createAskButton()
  keepAlive.push(createTray({ toggle: toggleIsland, quit: () => app.quit(), hotkey: HOTKEY }))

  if (SMOKE) {
    // `CLUELESS_SMOKE=1 npm start`: load the island hidden, check the UI rendered, quit.
    island.webContents.once('did-finish-load', async () => {
      await sleep(1500)
      const ok = await island?.webContents.executeJavaScript('Boolean(document.querySelector("[data-app-ready]"))')
      console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL: UI did not render')
      app.exit(ok ? 0 : 1)
    })
    return
  }

  island.once('ready-to-show', () => showIsland())
  if (!globalShortcut.register(HOTKEY, toggleIsland)) log(`${HOTKEY} is taken by another app`)
  log(`ready. Show / hide the island: ${HOTKEY}`)
}

// Smoke runs use their own data folder, so they don't collide with a running copy.
if (SMOKE) app.setPath('userData', join(tmpdir(), `clueless-smoke-${process.pid}`))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showIsland())
  app.whenReady().then(setup)
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    watcher.stop()
  })
}
