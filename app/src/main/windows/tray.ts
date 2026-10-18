// Menu-bar (macOS) / system-tray (Windows) icon. Clueless runs in the background: this is where
// you show or hide the island and quit.
import { Menu, nativeImage, Tray } from 'electron'
import { MAC1X, MAC2X, WIN } from './trayIcons'

export interface TrayActions {
  toggle(): void
  quit(): void
  hotkey: string
}

export function createTray(actions: TrayActions): Tray {
  let icon
  if (process.platform === 'darwin') {
    icon = nativeImage.createFromDataURL(MAC1X)
    icon.addRepresentation({ scaleFactor: 2, dataURL: MAC2X })
    icon.setTemplateImage(true) // macOS colors it to match the menu bar
  } else {
    icon = nativeImage.createFromDataURL(WIN)
  }

  const tray = new Tray(icon)
  tray.setToolTip('Clueless')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / hide Clueless', accelerator: actions.hotkey, click: actions.toggle },
      { type: 'separator' },
      { label: 'Quit Clueless', role: 'quit', click: actions.quit }
    ])
  )
  // Windows: a left click toggles the island (the menu is on right click).
  if (process.platform === 'win32') tray.on('click', actions.toggle)
  return tray
}
