// Clueless main process: windows, hotkeys, screen capture and IPC.
// Two ways in:
//   - the tutor panel (the main app): Ctrl/Cmd+Shift+Space reads the screen, +2 selects an area, +1 voice
//   - the island (Ctrl/Cmd+Shift+3): highlight code anywhere, click Ask, watch it run step by step
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  shell,
  systemPreferences,
  type Display,
  type NativeImage,
  type Rectangle
} from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  IPC,
  ISLAND_IPC,
  type AppStatus,
  type IslandView,
  type CardRating,
  type InputKind,
  type Rect,
  type SessionView,
  type StagePlay,
  type StageShow,
  type StepIntent,
  type Subject,
  type UserAction,
  type WindowMode
} from '../shared/contracts'
import { IslandController, type ScreenImage } from '../shared/islandController'
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
import { SelectionWatcher, type Point } from './island/selection'
import { Tracer } from './island/tracer'
import { MemoryStore } from './memory/store'
import { SessionController, type AreaCapture } from './session'
import { StuckDetector } from './stuck/detector'
import { createTransport, providerInfo } from './tutor/provider'
import { Tutor, type ImageInput } from './tutor/tutor'
import { VoiceManager, type SocketLike } from './voice/deepgram'
import { ElevenLabs } from './voice/elevenlabs'
import { createTray } from './windows/tray'
import {
  createAskButton,
  createIsland,
  createOverlay,
  createStage,
  fitPanelHeight,
  placeAskButton,
  placeIsland,
  resizePanelWidth,
  resolveAreaSelection,
  selectArea,
  setPanelMode,
  type IslandMode
} from './windows/windows'

const HOTKEYS = { ask: 'CommandOrControl+Shift+Space', area: 'CommandOrControl+Shift+2' }
const VOICE_HOTKEY = 'CommandOrControl+Shift+1'
const ISLAND_HOTKEY = 'CommandOrControl+Shift+3'
const ASK_BUTTON_MS = 4000
const SMOKE = process.env.CLUELESS_SMOKE === '1'

let overlay: BrowserWindow | null = null
let stage: BrowserWindow | null = null // code-mode animations, drawn over the student's code
let stageLoaded = false
let stageShow: StageShow | null = null
let island: BrowserWindow | null = null
let askButton: BrowserWindow | null = null
let islandDisplay: Display
let islandMode: IslandMode = 'pill'
let contentSize = { width: 320, height: 64 } // what the island's UI measured for the pill / card
let pendingSnippet: string | null = null
let askTimer: NodeJS.Timeout | null = null
let capturing = false
const hotkeyErrors: string[] = []

const userEnvFile = (): string => join(app.getPath('userData'), '.env')
const log = (line: string): void => console.log(`[clueless] ${line}`)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const contains = (r: Rectangle, p: Point): boolean => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height

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
  // No app.focus() here: on macOS the panel takes keyboard focus without activating the app,
  // so a full-screen browser stays in its own Space instead of being switched away from.
  overlay.show()
  overlay.focus()
}

function toggleOverlay(): void {
  if (overlay?.isVisible()) overlay.hide()
  else showOverlay()
}

/** Clueless's own windows that are on screen right now. */
function ownVisibleWindows(): BrowserWindow[] {
  return [overlay, stage, island, askButton].filter((w): w is BrowserWindow => Boolean(w && !w.isDestroyed() && w.isVisible()))
}

/** Hide Clueless's own windows (without losing their place) while the screen is captured. */
async function withPanelHidden<T>(fn: () => Promise<T>): Promise<T> {
  const own = ownVisibleWindows()
  if (own.length) {
    own.forEach((w) => w.setOpacity(0))
    await sleep(150)
  }
  try {
    return await fn()
  } finally {
    own.forEach((w) => !w.isDestroyed() && w.setOpacity(1))
  }
}

/** Let the student drag a box on the display under the mouse, then capture that display.
 *  null = cancelled; `full` is null if the capture failed. */
async function pickArea(): Promise<{ full: NativeImage | null; rect: Rect; display: Display } | null> {
  const display = activeDisplay()
  const own = ownVisibleWindows()
  own.forEach((w) => w.setOpacity(0))
  try {
    const rect: Rect | null = await selectArea(display)
    if (!rect || rect.width < 8 || rect.height < 8) return null
    await sleep(200) // let the selection layer disappear before capturing
    return { full: await captureDisplay(display), rect, display }
  } finally {
    own.forEach((w) => !w.isDestroyed() && w.setOpacity(1))
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

// ---------- the island: highlight code -> Ask -> text, then the step-by-step animation ----------

const islandController = new IslandController({
  makeTracer: () => {
    loadKeys() // pick up a key added since launch
    const transport = createTransport()
    return transport ? new Tracer(transport, log) : null
  },
  capture: captureForIsland,
  emit: (view) => {
    if (island && !island.isDestroyed()) island.webContents.send(ISLAND_IPC.view, view)
    applyIslandMode(islandModeFor(view))
  },
  schedule: (fn, ms) => {
    const t = setTimeout(fn, ms)
    return () => clearTimeout(t)
  },
  now: () => Date.now()
})

function islandModeFor(view: IslandView): IslandMode {
  return view.phase === 'playing' ? 'full' : view.phase === 'idle' ? 'pill' : 'card'
}

function applyIslandMode(mode: IslandMode): void {
  if (!island || island.isDestroyed()) return
  const wasFull = islandMode === 'full'
  islandMode = mode
  placeIsland(island, islandDisplay, mode, contentSize)
  if (mode === 'full' && !wasFull) island.focus() // so Esc reaches the animation
}

/** A screenshot of the display the student is working on, with Clueless's own windows hidden. */
async function captureForIsland(): Promise<ScreenImage | null> {
  try {
    return await withPanelHidden(async () => {
      const image = await captureDisplay(islandDisplay)
      return image ? toModelImage(image) : null
    })
  } catch (err) {
    log(`capture failed: ${(err as Error).message}`)
    return null
  }
}

const watcher = new SelectionWatcher({
  isOwnWindowAt: (p) =>
    [overlay, island, askButton].some((w) => w && !w.isDestroyed() && w.isVisible() && contains(w.getBounds(), p)),
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

function onIslandAsk(): void {
  const snippet = pendingSnippet
  const at = askButton?.getBounds()
  hideAskButton()
  if (!snippet) return
  if (at) islandDisplay = screen.getDisplayMatching(at)
  void islandController.ask(snippet)
}

function showIsland(): void {
  if (!island) return
  islandDisplay = activeDisplay()
  applyIslandMode(islandModeFor(islandController.current))
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
  islandController.closeCard()
  island?.hide()
}

function toggleIsland(): void {
  if (island?.isVisible()) hideIsland()
  else showIsland()
}

// ---------- wiring ----------

let controller: SessionController
let stuck: StuckDetector
let voice: VoiceManager
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

  voice = new VoiceManager({
    apiKey: () => {
      loadKeys() // pick up a key added since launch
      return process.env.DEEPGRAM_API_KEY?.trim() || undefined
    },
    events: {
      transcript: (t) => toUi(IPC.voiceTranscript, t),
      state: (e) => toUi(IPC.voiceState, e)
    },
    // Node's built-in WebSocket (no extra package).
    makeSocket: (url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike
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
  ipcMain.on(IPC.step, (_e, arg: { id: number; intent: StepIntent }) => {
    if (typeof arg?.id === 'number' && ['stuck', 'revisit', 'claim'].includes(arg.intent)) void controller.step(arg.id, arg.intent)
  })
  ipcMain.on(IPC.setSubject, (_e, subject: Subject) => controller.setSubject(subject))
  // Compact needs nothing here (the panel shrinks to its header and fitHeight follows it);
  // 'wide' makes room for the explain-mode animation pane.
  ipcMain.on(IPC.windowMode, (_e, mode: WindowMode) => {
    if (overlay && (mode === 'compact' || mode === 'expanded' || mode === 'wide')) setPanelMode(overlay, mode)
  })
  ipcMain.on(IPC.fitHeight, (_e, px: number) => {
    if (overlay && typeof px === 'number') fitPanelHeight(overlay, px)
  })
  ipcMain.on(IPC.resizeWidth, (_e, arg: { width: number; anchor: 'left' | 'right' }) => {
    if (overlay && typeof arg?.width === 'number') resizePanelWidth(overlay, arg.width, arg.anchor === 'left' ? 'left' : 'right')
  })
  ipcMain.on(IPC.hide, () => overlay?.hide())
  ipcMain.on(IPC.quit, () => app.quit())
  ipcMain.on(IPC.openScreenSettings, () => openScreenSettings())
  ipcMain.on(IPC.areaDone, (_e, rect: Rect) => resolveAreaSelection(rect))
  ipcMain.on(IPC.areaCancel, () => resolveAreaSelection(null))
  ipcMain.on(IPC.stagePlay, (_e, play: unknown) => {
    if (isStagePlay(play)) playOnScreen(play)
  })
  ipcMain.on(IPC.stageStop, () => stopOnScreen())

  ipcMain.handle(ISLAND_IPC.getView, () => islandController.current)
  ipcMain.on(ISLAND_IPC.setAnimate, (_e, on: unknown) => islandController.setAnimate(Boolean(on)))
  ipcMain.on(ISLAND_IPC.followUp, (_e, text: unknown) => {
    if (typeof text === 'string') void islandController.followUp(text.slice(0, 2000))
  })
  ipcMain.on(ISLAND_IPC.closeCard, () => islandController.closeCard())
  ipcMain.on(ISLAND_IPC.finish, () => islandController.finishAnimation())
  ipcMain.on(ISLAND_IPC.hide, () => hideIsland())
  ipcMain.on(ISLAND_IPC.hold, (_e, hold: unknown) => islandController.holdCard(Boolean(hold)))
  ipcMain.on(ISLAND_IPC.ask, () => onIslandAsk())
  ipcMain.on(ISLAND_IPC.resize, (_e, size: { width: number; height: number }) => {
    if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height) || size.width < 1 || size.height < 1) return
    contentSize = { width: size.width, height: size.height }
    if (island && islandMode !== 'full') placeIsland(island, islandDisplay, islandMode, contentSize)
  })
  ipcMain.handle(IPC.voiceMicAccess, async () => {
    // macOS asks the student once; Windows uses its own privacy setting and Chromium handles it.
    if (process.platform !== 'darwin') return true
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  const elevenLabs = new ElevenLabs(
    () => {
      loadKeys() // pick up a key added since launch
      return process.env
    },
    fetch,
    log
  )
  ipcMain.handle(IPC.voiceTts, (_e, req: unknown) => elevenLabs.speak(req))
  ipcMain.on(IPC.voiceStart, (_e, id: unknown) => voice.start(id))
  ipcMain.on(IPC.voiceAudio, (_e, arg: { id?: unknown; chunk?: unknown }) => voice.audio(arg?.id, arg?.chunk))
  ipcMain.on(IPC.voiceStop, (_e, id: unknown) => voice.stop(id))
  ipcMain.on(IPC.voiceCancel, (_e, id: unknown) => voice.cancel(id))

  overlay = createOverlay()
  overlay.on('closed', () => {
    voice.cancelAll()
    overlay = null
  })
  // A reload (or crash) of the UI drops its recorder: close the Deepgram side too.
  overlay.webContents.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) voice.cancelAll()
  })
  overlay.webContents.on('render-process-gone', () => voice.cancelAll())

  islandDisplay = activeDisplay()
  island = createIsland()
  island.on('closed', () => (island = null))
  askButton = createAskButton()

  keepAlive.push(createTray({
    ask: () => void ask('screen'),
    selectArea: () => void ask('area'),
    toggle: toggleOverlay,
    toggleIsland,
    quit: () => app.quit(),
    hotkeys: { ...HOTKEYS, island: ISLAND_HOTKEY }
  }))

  if (SMOKE) {
    // `CLUELESS_SMOKE=1 npm start`: load the panel and the island hidden, check both rendered, quit.
    overlay.webContents.once('did-finish-load', async () => {
      await sleep(2500)
      const ready = 'Boolean(document.querySelector("[data-app-ready]"))'
      const panelOk = await overlay?.webContents.executeJavaScript(ready)
      const islandOk = await island?.webContents.executeJavaScript(ready)
      const ok = Boolean(panelOk && islandOk)
      console.log(ok ? 'SMOKE OK' : `SMOKE FAIL: panel ${panelOk ? 'ok' : 'did not render'}, island ${islandOk ? 'ok' : 'did not render'}`)
      app.exit(ok ? 0 : 1)
    })
    return
  }

  // Launching while a full-screen app is in front: the window is created before macOS has finished
  // turning Clueless into a menu-bar app, so it can land on the desktop Space only. Re-join every
  // Space (full-screen ones included) once that's settled, then show it the same way the hotkey does.
  overlay.once('ready-to-show', () =>
    setTimeout(() => {
      overlay?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
      showOverlay()
    }, 800)
  )
  for (const [name, accelerator] of Object.entries(HOTKEYS)) {
    const ok = globalShortcut.register(accelerator, () => void ask(name === 'area' ? 'area' : 'screen'))
    if (!ok) hotkeyErrors.push(`${accelerator} is taken by another app`)
  }
  const voiceOk = globalShortcut.register(VOICE_HOTKEY, () => {
    showOverlay()
    toUi(IPC.voiceToggle, null)
  })
  if (!voiceOk) hotkeyErrors.push(`${VOICE_HOTKEY} is taken by another app`)
  if (!globalShortcut.register(ISLAND_HOTKEY, toggleIsland)) hotkeyErrors.push(`${ISLAND_HOTKEY} is taken by another app`)
  log(`ready. Ask: ${HOTKEYS.ask}  Select area: ${HOTKEYS.area}  Voice: ${VOICE_HOTKEY}  Island: ${ISLAND_HOTKEY}`)
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
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    voice?.cancelAll()
    watcher.stop()
  })
}
