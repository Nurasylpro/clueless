// Exposes a small, typed API to the UI as `window.clueless`. The UI never touches Node or IPC directly.
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, ISLAND_IPC, type CluelessApi, type IslandApi } from '../shared/contracts'

function listen<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (_: unknown, value: T): void => cb(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CluelessApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  getSession: () => ipcRenderer.invoke(IPC.getSession),
  onSession: (cb) => listen(IPC.session, cb),
  onStatus: (cb) => listen(IPC.status, cb),
  ask: (mode) => ipcRenderer.send(IPC.ask, mode),
  askText: (text) => ipcRenderer.send(IPC.askText, text),
  send: (input) => ipcRenderer.send(IPC.send, input),
  action: (action) => ipcRenderer.send(IPC.action, action),
  step: (id, intent) => ipcRenderer.send(IPC.step, { id, intent }),
  setSubject: (subject) => ipcRenderer.send(IPC.setSubject, subject),
  setWindowMode: (mode) => ipcRenderer.send(IPC.windowMode, mode),
  fitHeight: (px) => ipcRenderer.send(IPC.fitHeight, px),
  resizeWidth: (width, anchor) => ipcRenderer.send(IPC.resizeWidth, { width, anchor }),
  hide: () => ipcRenderer.send(IPC.hide),
  quit: () => ipcRenderer.send(IPC.quit),
  openScreenSettings: () => ipcRenderer.send(IPC.openScreenSettings),
  getMemory: () => ipcRenderer.invoke(IPC.getMemory),
  rateCard: (id, rating) => ipcRenderer.invoke(IPC.rateCard, { id, rating }),
  areaDone: (rect) => ipcRenderer.send(IPC.areaDone, rect),
  areaCancel: () => ipcRenderer.send(IPC.areaCancel),
  micAccess: () => ipcRenderer.invoke(IPC.voiceMicAccess),
  voiceStart: (id) => ipcRenderer.send(IPC.voiceStart, id),
  voiceAudio: (id, chunk) => ipcRenderer.send(IPC.voiceAudio, { id, chunk }),
  voiceStop: (id) => ipcRenderer.send(IPC.voiceStop, id),
  voiceCancel: (id) => ipcRenderer.send(IPC.voiceCancel, id),
  onVoiceTranscript: (cb) => listen(IPC.voiceTranscript, cb),
  onVoiceState: (cb) => listen(IPC.voiceState, cb),
  onVoiceToggle: (cb) => listen(IPC.voiceToggle, cb),
  tts: (req) => ipcRenderer.invoke(IPC.voiceTts, req)
}

contextBridge.exposeInMainWorld('clueless', api)

// The island and the Ask button. (The mic and the reading voice use `window.clueless`'s voice part.)
const island: IslandApi = {
  getView: () => ipcRenderer.invoke(ISLAND_IPC.getView),
  onView: (cb) => listen(ISLAND_IPC.view, cb),
  setAnimate: (on) => ipcRenderer.send(ISLAND_IPC.setAnimate, on),
  setVoice: (on) => ipcRenderer.send(ISLAND_IPC.setVoice, on),
  setExpanded: (open) => ipcRenderer.send(ISLAND_IPC.setExpanded, open),
  askText: (text) => ipcRenderer.send(ISLAND_IPC.askText, text),
  startGuidance: () => ipcRenderer.send(ISLAND_IPC.guide),
  replay: () => ipcRenderer.send(ISLAND_IPC.replay),
  finishAnimation: () => ipcRenderer.send(ISLAND_IPC.finish),
  resize: (size) => ipcRenderer.send(ISLAND_IPC.resize, size),
  holdCard: (hold) => ipcRenderer.send(ISLAND_IPC.hold, hold),
  ask: () => ipcRenderer.send(ISLAND_IPC.ask),
  onMicToggle: (cb) => listen(ISLAND_IPC.micToggle, cb)
}

contextBridge.exposeInMainWorld('island', island)
