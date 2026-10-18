// Clueless main process. Runs in the background as a small island (a pill at the top of the
// screen): Ctrl/Cmd+Shift+2 shows or hides it, Ctrl/Cmd+Shift+1 starts the mic.
// While it shows, highlighting text anywhere brings up an Ask button next to the cursor.
// Ask (or a question typed / said in the island) -> Claude reads it and the screen ->
// Animate on and code: the island fills the screen and plays the code step by step, each step
// shown in one line on top (and read aloud with Voice on). Otherwise the answer opens in the card.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, systemPreferences, type Display, type Rectangle } from 'electron'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { IPC, ISLAND_IPC, type IslandView } from '../shared/contracts'
import { IslandController, type ScreenImage } from '../shared/islandController'
import { codeNames } from '../shared/trace'
import { islandBounds, type IslandAnchor } from '../shared/islandPlacement'
import { activeDisplay, captureDisplay, toModelImage } from './capture/capture'
import { loadEnvFiles } from './env'
import { SelectionWatcher, type Point } from './island/selection'
import { Tracer } from './island/tracer'
import { PythonRunner } from './run/python'
import { createTransport } from './tutor/provider'
import { VoiceManager, type SocketLike } from './voice/deepgram'
import { ElevenLabs } from './voice/elevenlabs'
import { createTray } from './windows/tray'
import { createAskButton, createIsland, placeAskButton, placeIsland, type IslandMode } from './windows/windows'

const HOTKEY = 'CommandOrControl+Shift+2' // show / hide the island
const MIC_HOTKEY = 'CommandOrControl+Shift+1' // start (or stop) talking
const ASK_BUTTON_MS = 4000
const SMOKE = process.env.CLUELESS_SMOKE === '1'

let island: BrowserWindow | null = null
let askButton: BrowserWindow | null = null
let islandDisplay: Display
let islandMode: IslandMode = 'pill'
let contentSize = { width: 320, height: 64 } // what the island's UI measured for the pill / card
let pendingSnippet: string | null = null
let askTimer: NodeJS.Timeout | null = null
let runner: PythonRunner | null = null
const islandAnchors = new Map<number, IslandAnchor>()
let placedBounds: Rectangle | null = null

const log = (line: string): void => console.log(`[clueless] ${line}`)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const contains = (r: Rectangle, p: Point): boolean => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height

function loadKeys(): void {
  // Dev: app/.env. Installed app: the .env in the user data folder.
  loadEnvFiles([join(process.cwd(), '.env'), join(app.getAppPath(), '.env'), join(app.getPath('userData'), '.env')])
}

function toIsland(channel: string, payload: unknown): void {
  if (island && !island.isDestroyed()) island.webContents.send(channel, payload)
}

/** Runs Python highlights (Pyodide). Unpacked from the asar in the built app, since it reads its own files. */
function pythonRunner(): PythonRunner {
  runner ??= new PythonRunner(join(app.getAppPath(), 'node_modules', 'pyodide').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`))
  return runner
}

// ---------- the controller ----------

const controller = new IslandController({
  makeTracer: () => {
    loadKeys() // pick up a key added since launch
    const transport = createTransport()
    return transport ? new Tracer(transport, pythonRunner(), log) : null
  },
  capture: captureForClaude,
  emit: (view) => {
    toIsland(ISLAND_IPC.view, view)
    applyMode(modeFor(view))
  },
  schedule: (fn, ms) => {
    const t = setTimeout(fn, ms)
    return () => clearTimeout(t)
  },
  now: () => Date.now()
})

function modeFor(view: IslandView): IslandMode {
  return view.phase === 'playing' ? 'full' : view.expanded ? 'card' : 'pill'
}

function applyMode(mode: IslandMode): void {
  if (!island || island.isDestroyed()) return
  const wasFull = islandMode === 'full'
  islandMode = mode
  placedBounds = mode === 'full' ? islandDisplay.bounds : islandBounds(islandDisplay.workArea, contentSize, islandAnchors.get(islandDisplay.id))
  placeIsland(island, islandDisplay, mode, contentSize, islandAnchors.get(islandDisplay.id))
  if (mode === 'full' && !wasFull) island.focus() // so Space, ← and Esc reach the animation
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
  voice.cancelAll()
  controller.hide()
  island?.hide() // the UI notices it's hidden and stops talking
}

function toggleIsland(): void {
  if (island?.isVisible()) hideIsland()
  else showIsland()
}

// ---------- voice: talking (Deepgram) and being read to (ElevenLabs, or the computer's voice) ----------

const voice = new VoiceManager({
  apiKey: () => {
    loadKeys() // pick up a key added since launch
    return process.env.DEEPGRAM_API_KEY?.trim() || undefined
  },
  events: {
    transcript: (t) => toIsland(IPC.voiceTranscript, t),
    state: (e) => toIsland(IPC.voiceState, e)
  },
  // Node's built-in WebSocket (no extra package).
  makeSocket: (url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike,
  // Listen harder for the names in the code being discussed ("seen", not "scene").
  keyterms: () => {
    const view = controller.current
    return codeNames(view.trace?.code ?? view.snippet ?? '')
  }
})

const elevenLabs = new ElevenLabs(
  () => {
    loadKeys()
    return process.env
  },
  fetch,
  log
)

/** The mic hotkey: bring the island up if it's hidden, then start (or stop) listening. */
function onMicHotkey(): void {
  if (!island?.isVisible()) showIsland()
  toIsland(ISLAND_IPC.micToggle, null)
}

// ---------- wiring ----------

const keepAlive: unknown[] = [] // the tray icon disappears if it's garbage-collected

function setup(): void {
  loadKeys()
  // An overlay, not a regular app: no dock icon on macOS (the menu-bar icon replaces it).
  if (process.platform === 'darwin') app.dock?.hide()
  // Copy, paste and select all in the island's text box come from the Edit menu's roles.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(process.platform === 'darwin' ? [{ role: 'appMenu' }, { role: 'editMenu' }] : [{ role: 'editMenu' }])
  )

  ipcMain.handle(ISLAND_IPC.getView, () => controller.current)
  ipcMain.on(ISLAND_IPC.setAnimate, (_e, on: unknown) => controller.setAnimate(Boolean(on)))
  ipcMain.on(ISLAND_IPC.setVoice, (_e, on: unknown) => controller.setVoice(Boolean(on)))
  ipcMain.on(ISLAND_IPC.setExpanded, (_e, open: unknown) => controller.setExpanded(Boolean(open)))
  ipcMain.on(ISLAND_IPC.askText, (_e, text: unknown) => {
    if (typeof text === 'string') void controller.askText(text.slice(0, 2000))
  })
  ipcMain.on(ISLAND_IPC.guide, () => {
    hideAskButton()
    void controller.startGuidance()
  })
  ipcMain.on(ISLAND_IPC.replay, () => controller.replay())
  ipcMain.on(ISLAND_IPC.finish, () => controller.finishAnimation())
  ipcMain.on(ISLAND_IPC.hold, (_e, hold: unknown) => controller.holdCard(Boolean(hold)))
  ipcMain.on(ISLAND_IPC.ask, () => onAsk())
  ipcMain.on(ISLAND_IPC.resize, (_e, size: { width: number; height: number }) => {
    if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height) || size.width < 1 || size.height < 1) return
    contentSize = { width: size.width, height: size.height }
    if (island && islandMode !== 'full') applyMode(islandMode)
  })

  ipcMain.handle(IPC.voiceMicAccess, async () => {
    // macOS asks the student once; Windows uses its own privacy setting and Chromium handles it.
    if (process.platform !== 'darwin') return true
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  ipcMain.handle(IPC.voiceTts, (_e, req: unknown) => elevenLabs.speak(req))
  ipcMain.on(IPC.voiceStart, (_e, id: unknown) => voice.start(id))
  ipcMain.on(IPC.voiceAudio, (_e, arg: { id?: unknown; chunk?: unknown }) => voice.audio(arg?.id, arg?.chunk))
  ipcMain.on(IPC.voiceStop, (_e, id: unknown) => voice.stop(id))
  ipcMain.on(IPC.voiceCancel, (_e, id: unknown) => voice.cancel(id))

  islandDisplay = activeDisplay()
  island = createIsland()
  // Native dragging only changes the remembered anchor; automatic resizes must not recenter it.
  island.on('moved', () => {
    if (!island || islandMode === 'full') return
    const bounds = island.getBounds()
    if (placedBounds && bounds.x === placedBounds.x && bounds.y === placedBounds.y) return
    islandDisplay = screen.getDisplayMatching(bounds)
    islandAnchors.set(islandDisplay.id, { x: bounds.x + bounds.width / 2, y: bounds.y })
    applyMode(islandMode) // keep the grip and card inside this display's work area
  })
  screen.on('display-metrics-changed', () => {
    islandDisplay = screen.getDisplayNearestPoint({ x: islandDisplay.workArea.x, y: islandDisplay.workArea.y })
    applyMode(islandMode)
  })
  island.on('closed', () => {
    voice.cancelAll()
    island = null
  })
  // A reload (or crash) of the UI drops its recorder: close the Deepgram side too.
  island.webContents.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) voice.cancelAll()
  })
  island.webContents.on('render-process-gone', () => voice.cancelAll())
  askButton = createAskButton()
  keepAlive.push(createTray({ toggle: toggleIsland, quit: () => app.quit(), hotkey: HOTKEY }))

  if (SMOKE) {
    // `CLUELESS_SMOKE=1 npm start`: load the island hidden, check the UI rendered, quit.
    island.webContents.once('did-finish-load', async () => {
      await sleep(1500)
      const ok = await island?.webContents.executeJavaScript('Boolean(document.querySelector("[data-app-ready]"))')
      console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL: UI did not render')
      // CLUELESS_SMOKE_VOICE=1: also ask for a spoken line from inside the island, the way it reads steps.
      if (ok && process.env.CLUELESS_SMOKE_VOICE === '1') {
        const tts = await island?.webContents.executeJavaScript(
          `window.clueless.tts({ text: 'Is one already in seen? Yes.' }).then((r) => r.ok ? 'ok ' + r.audio.byteLength + ' bytes ' + r.mime : r.reason + ': ' + r.message)`
        )
        console.log(`SMOKE VOICE: ${tts}`)
      }
      app.exit(ok ? 0 : 1)
    })
    return
  }

  pythonRunner().warm() // load Python in the background, so the first run is quick
  island.once('ready-to-show', () => showIsland())
  if (!globalShortcut.register(HOTKEY, toggleIsland)) log(`${HOTKEY} is taken by another app`)
  if (!globalShortcut.register(MIC_HOTKEY, onMicHotkey)) log(`${MIC_HOTKEY} is taken by another app`)
  log(`ready. Show / hide the island: ${HOTKEY}   Talk: ${MIC_HOTKEY}`)
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
    voice.cancelAll()
    runner?.dispose()
  })
}
