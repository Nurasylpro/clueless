// Clueless main process: windows, hotkeys, screen capture and IPC around the session controller.
import Anthropic from '@anthropic-ai/sdk'
import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import {
  IPC,
  type AppStatus,
  type CardRating,
  type InputKind,
  type Rect,
  type SessionView,
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
import { SessionController } from './session'
import { StuckDetector } from './stuck/detector'
import { DEFAULT_MODEL, Tutor, type ImageInput } from './tutor/tutor'
import { createOverlay, resolveAreaSelection, selectArea, setPanelMode } from './windows/windows'

const HOTKEYS = { ask: 'CommandOrControl+Shift+Space', area: 'CommandOrControl+Shift+2' }
const SMOKE = process.env.CLUELESS_SMOKE === '1'

let overlay: BrowserWindow | null = null
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
  return {
    platform: process.platform,
    model: process.env.CLUELESS_MODEL || DEFAULT_MODEL,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
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

let client: Anthropic | null = null
function makeTutor(): Tutor | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  client ??= new Anthropic({ apiKey })
  return new Tutor(client, process.env.CLUELESS_MODEL || DEFAULT_MODEL, log)
}

function showOverlay(): void {
  if (!overlay) return
  if (panelMode === 'compact') setMode('expanded')
  overlay.show()
  if (process.platform === 'darwin') app.focus({ steal: true })
  overlay.focus()
}

function setMode(mode: WindowMode): void {
  panelMode = mode
  if (overlay) setPanelMode(overlay, mode)
}

/** Hide the panel (without losing its place) while the screen is captured. */
async function withPanelHidden<T>(fn: () => Promise<T>): Promise<T> {
  const win = overlay
  const visible = Boolean(win?.isVisible())
  if (win && visible) {
    win.setOpacity(0)
    await sleep(150)
  }
  try {
    return await fn()
  } finally {
    if (win && visible && !win.isDestroyed()) win.setOpacity(1)
  }
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
      const display = activeDisplay()
      overlay?.setOpacity(0)
      const rect: Rect | null = await selectArea(display)
      if (!rect || rect.width < 8 || rect.height < 8) {
        overlay?.setOpacity(1)
        return
      }
      await sleep(200) // let the selection layer disappear before capturing
      const full = await captureDisplay(display)
      overlay?.setOpacity(1)
      image = full ? toModelImage(cropToRect(full, rect, display)) : null
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

function setup(): void {
  loadKeys()
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

  overlay = createOverlay()
  overlay.on('closed', () => (overlay = null))

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

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showOverlay())
  app.whenReady().then(setup)
  app.on('activate', () => showOverlay())
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
