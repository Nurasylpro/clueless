// Clueless main process: windows, hotkeys, screen capture and IPC around the session controller.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, shell, type Display, type NativeImage } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  IPC,
  type AppStatus,
  type CardRating,
  type InputKind,
  type Rect,
  type SessionView,
  type StagePlay,
  type StageShow,
  type Subject,
  type UserAction,
  type WindowMode
} from '../shared/contracts'
import {
  activeDisplay,
  captureDisplay,
  cropToRect,
  grayThumbnail,
  screenAccess,
  toModelImage,
  windowTitles
} from './capture/capture'
import { loadEnvFiles } from './env'
import { MemoryStore } from './memory/store'
import { SessionController, type AreaCapture } from './session'
import { StuckDetector } from './stuck/detector'
import { createTransport, providerInfo } from './tutor/provider'
import { Tutor, type ImageInput } from './tutor/tutor'
import { createTray } from './windows/tray'
import { createOverlay, createStage, resolveAreaSelection, selectArea, setPanelMode } from './windows/windows'

const HOTKEYS = { ask: 'CommandOrControl+Shift+Space', area: 'CommandOrControl+Shift+2' }
const SMOKE = process.env.CLUELESS_SMOKE === '1'

let overlay: BrowserWindow | null = null
let stage: BrowserWindow | null = null // code-mode animations, drawn over the student's code
let stageLoaded = false
let stageShow: StageShow | null = null
let panelMode: WindowMode = 'expanded'
let capturing = false
const hotkeyErrors: string[] = []

const userEnvFile = (): string => join(app.getPath('userData'), '.env')
const log = (line: string): void => console.log(`[clueless] ${line}`)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function loadKeys(): void {
  // Dev: app/.env. Installed app: the .env in the user data folder (shown in the UI).
  loadEnvFiles([join(process.cwd(), '.env'), join(app.getAppPath(), '.env'), userEnvFile()])
}

function status(): AppStatus {
  const ai = providerInfo()
  return {
    platform: process.platform,
    provider: ai?.provider ?? null,
    model: ai?.model ?? null,
    region: ai?.region ?? null,
    hasDeepgramKey: Boolean(process.env.DEEPGRAM_API_KEY),
    screenAccess: screenAccess(),
    hotkeys: HOTKEYS,
    hotkeyErrors,
    envFile: app.isPackaged ? userEnvFile() : join(process.cwd(), '.env')
  }
}

function toUi(channel: string, payload: unknown): void {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload)
}

function makeTutor(): Tutor | null {
  const transport = createTransport() // Claude API or Bedrock, from the env
  return transport ? new Tutor(transport, log) : null
}

function showOverlay(): void {
  if (!overlay) return
  if (panelMode === 'compact') setMode('expanded')
  // No app.focus() here: on macOS the panel takes keyboard focus without activating the app,
  // so a full-screen browser stays in its own Space instead of being switched away from.
  overlay.show()
  overlay.focus()
}

function toggleOverlay(): void {
  if (overlay?.isVisible()) overlay.hide()
  else showOverlay()
}

function setMode(mode: WindowMode): void {
  panelMode = mode
  if (overlay) setPanelMode(overlay, mode)
}

/** Make Clueless's own windows invisible (or visible again), so captures only see the student's screen. */
function setOwnWindowsOpacity(opacity: number): void {
  for (const win of [overlay, stage]) if (win && !win.isDestroyed()) win.setOpacity(opacity)
}

/** Hide the panel (without losing its place) while the screen is captured. */
async function withPanelHidden<T>(fn: () => Promise<T>): Promise<T> {
  const visible = Boolean(overlay?.isVisible() || stage?.isVisible())
  if (visible) {
    setOwnWindowsOpacity(0)
    await sleep(150)
  }
  try {
    return await fn()
  } finally {
    if (visible) setOwnWindowsOpacity(1)
  }
}

/** Let the student drag a box on the display under the mouse, then capture that display.
 *  null = cancelled; `full` is null if the capture failed. */
async function pickArea(): Promise<{ full: NativeImage | null; rect: Rect; display: Display } | null> {
  const display = activeDisplay()
  setOwnWindowsOpacity(0)
  try {
    const rect: Rect | null = await selectArea(display)
    if (!rect || rect.width < 8 || rect.height < 8) return null
    await sleep(200) // let the selection layer disappear before capturing
    return { full: await captureDisplay(display), rect, display }
  } finally {
    setOwnWindowsOpacity(1)
  }
}

/** "Animate my code": select the code, then capture the whole screen and the close-up. */
async function captureArea(): Promise<AreaCapture | null> {
  if (capturing) return null
  capturing = true
  try {
    const picked = await pickArea()
    showOverlay()
    if (!picked) return null
    if (!picked.full) {
      controller.fail("Couldn't capture your screen. On macOS, allow Screen Recording for Clueless and restart it.")
      return null
    }
    return {
      screen: toModelImage(picked.full),
      crop: toModelImage(cropToRect(picked.full, picked.rect, picked.display)),
      area: { displayId: picked.display.id, rect: picked.rect }
    }
  } finally {
    capturing = false
  }
}

// ---------- code-mode animation stage ----------

function isStagePlay(value: unknown): value is StagePlay {
  const p = value as StagePlay | null
  const r = p?.area?.rect
  return Boolean(
    p &&
      Array.isArray(p.visual?.frames) &&
      typeof p.area.displayId === 'number' &&
      r &&
      [r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function sendStage(): void {
  if (stage && !stage.isDestroyed() && stageLoaded) stage.webContents.send(IPC.stageShow, stageShow)
}

function playOnScreen(play: StagePlay): void {
  const display = screen.getAllDisplays().find((d) => d.id === play.area.displayId) ?? activeDisplay()
  if (!stage || stage.isDestroyed()) {
    const win = createStage(display)
    stage = win
    stageLoaded = false
    win.webContents.once('did-finish-load', () => {
      stageLoaded = true
      sendStage()
    })
    win.on('closed', () => {
      if (stage === win) stage = null
    })
  }
  stage.setBounds(display.bounds)
  // Tell the stage where the panel is, so the animation doesn't land under it.
  const panel = overlay?.isVisible() ? overlay.getBounds() : null
  const avoid = panel && {
    x: panel.x - display.bounds.x,
    y: panel.y - display.bounds.y,
    width: panel.width,
    height: panel.height
  }
  stageShow = { ...play, avoid }
  sendStage()
  stage.showInactive()
}

function stopOnScreen(): void {
  stageShow = null
  sendStage()
  if (stage && !stage.isDestroyed()) stage.hide()
}

async function captureScreen(): Promise<ImageInput | null> {
  return withPanelHidden(async () => {
    const image = await captureDisplay(activeDisplay())
    return image ? toModelImage(image) : null
  })
}

async function ask(kind: 'screen' | 'area'): Promise<void> {
  if (capturing) return
  capturing = true
  try {
    loadKeys() // pick up a key added since launch
    toUi(IPC.status, status())
    if (screenAccess() === 'denied') {
      showOverlay()
      controller.fail('Clueless needs screen access to read your problem. Use the button above to allow it.')
      return
    }
    let image: ImageInput | null = null
    if (kind === 'area') {
      const picked = await pickArea()
      if (!picked) return
      image = picked.full ? toModelImage(cropToRect(picked.full, picked.rect, picked.display)) : null
    } else {
      image = await captureScreen()
    }
    showOverlay()
    if (!image) {
      controller.fail("Couldn't capture your screen. On macOS, allow Screen Recording for Clueless and restart it.")
      return
    }
    await controller.startProblem({ image })
  } finally {
    capturing = false
  }
}

function openScreenSettings(): void {
  if (process.platform === 'darwin') {
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  }
}

// ---------- wiring ----------

let controller: SessionController
let stuck: StuckDetector
const keepAlive: unknown[] = [] // the tray icon disappears if it's garbage-collected

function setup(): void {
  loadKeys()
  if (process.platform === 'darwin') {
    // An overlay, not a regular app: no dock icon (the menu-bar icon replaces it). Together with
    // the panel window type this lets Clueless float over full-screen apps without macOS
    // switching Spaces.
    app.dock?.hide()
  }
  // Copy, paste, select all and undo in the text boxes come from the app menu's Edit roles.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      process.platform === 'darwin' ? [{ role: 'appMenu' }, { role: 'editMenu' }] : [{ role: 'editMenu' }]
    )
  )
  const store = new MemoryStore(join(app.getPath('userData'), 'clueless-memory.json'))

  stuck = new StuckDetector({
    thumbnail: () => grayThumbnail(activeDisplay()),
    windowTitles,
    isCluelessFocused: () => Boolean(overlay?.isFocused()),
    onChange: (state) => controller.setStuck(state)
  })

  controller = new SessionController({
    makeTutor,
    memory: store,
    captureScreen,
    captureArea,
    emit: (view: SessionView | null) => toUi(IPC.session, view),
    stuck
  })

  ipcMain.handle(IPC.getStatus, () => status())
  ipcMain.handle(IPC.getSession, () => controller.current)
  ipcMain.handle(IPC.getMemory, () => store.view())
  ipcMain.handle(IPC.rateCard, (_e, arg: { id: string; rating: CardRating }) => {
    if (typeof arg?.id === 'string' && [1, 2, 3, 4].includes(arg.rating)) store.rate(arg.id, arg.rating)
    return store.view()
  })
  ipcMain.on(IPC.ask, (_e, mode: 'screen' | 'area') => void ask(mode === 'area' ? 'area' : 'screen'))
  ipcMain.on(IPC.askText, (_e, text: string) => {
    if (typeof text !== 'string' || !text.trim()) return
    loadKeys()
    toUi(IPC.status, status())
    void controller.startProblem({ text: text.slice(0, 8000) })
  })
  ipcMain.on(IPC.send, (_e, arg: { text: string; as: InputKind }) => {
    if (typeof arg?.text === 'string') void controller.send(arg.text.slice(0, 4000), arg.as)
  })
  ipcMain.on(IPC.action, (_e, action: UserAction) => void controller.action(action))
  ipcMain.on(IPC.setSubject, (_e, subject: Subject) => controller.setSubject(subject))
  ipcMain.on(IPC.windowMode, (_e, mode: WindowMode) => setMode(mode === 'compact' ? 'compact' : 'expanded'))
  ipcMain.on(IPC.hide, () => overlay?.hide())
  ipcMain.on(IPC.quit, () => app.quit())
  ipcMain.on(IPC.openScreenSettings, () => openScreenSettings())
  ipcMain.on(IPC.areaDone, (_e, rect: Rect) => resolveAreaSelection(rect))
  ipcMain.on(IPC.areaCancel, () => resolveAreaSelection(null))
  ipcMain.on(IPC.stagePlay, (_e, play: unknown) => {
    if (isStagePlay(play)) playOnScreen(play)
  })
  ipcMain.on(IPC.stageStop, () => stopOnScreen())

  overlay = createOverlay()
  overlay.on('closed', () => (overlay = null))
  keepAlive.push(createTray({
    ask: () => void ask('screen'),
    selectArea: () => void ask('area'),
    toggle: toggleOverlay,
    quit: () => app.quit(),
    hotkeys: HOTKEYS
  }))

  if (SMOKE) {
    // `CLUELESS_SMOKE=1 npm start`: load the real window hidden, check the UI rendered, quit.
    overlay.webContents.once('did-finish-load', async () => {
      await sleep(1500)
      const ok = await overlay?.webContents.executeJavaScript('Boolean(document.querySelector("[data-app-ready]"))')
      console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL: UI did not render')
      app.exit(ok ? 0 : 1)
    })
    return
  }

  overlay.once('ready-to-show', () => overlay?.show())
  for (const [name, accelerator] of Object.entries(HOTKEYS)) {
    const ok = globalShortcut.register(accelerator, () => void ask(name === 'area' ? 'area' : 'screen'))
    if (!ok) hotkeyErrors.push(`${accelerator} is taken by another app`)
  }
  log(`ready. Ask: ${HOTKEYS.ask}  Select area: ${HOTKEYS.area}`)
}

// Smoke runs use their own data folder, so they don't collide with a running copy (or its memory file).
if (SMOKE) app.setPath('userData', join(tmpdir(), `clueless-smoke-${process.pid}`))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showOverlay())
  app.whenReady().then(setup)
  app.on('activate', () => showOverlay())
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
