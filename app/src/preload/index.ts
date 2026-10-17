// Exposes a small, typed API to the UI as `window.clueless`. The UI never touches Node or IPC directly.
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type CluelessApi } from '../shared/contracts'

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
  areaCancel: () => ipcRenderer.send(IPC.areaCancel)
}

contextBridge.exposeInMainWorld('clueless', api)
