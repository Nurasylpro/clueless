// Menu-bar (macOS) / system-tray (Windows) icon. On macOS Clueless has no dock icon (that's what
// lets it float over full-screen apps), so this is where you show it, ask, or quit.
import { Menu, nativeImage, Tray } from 'electron'
import { MAC1X, MAC2X, WIN } from './trayIcons'

export interface TrayActions {
  ask(): void
  selectArea(): void
  toggle(): void
  quit(): void
  hotkeys: { ask: string; area: string }
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
      { label: 'Read my screen', accelerator: actions.hotkeys.ask, click: actions.ask },
      { label: 'Select just the problem', accelerator: actions.hotkeys.area, click: actions.selectArea },
      { label: 'Show / hide Clueless', click: actions.toggle },
      { type: 'separator' },
      { label: 'Quit Clueless', role: 'quit', click: actions.quit }
    ])
  )
  // Windows: a left click toggles the panel (the menu is on right click).
  if (process.platform === 'win32') tray.on('click', actions.toggle)
  return tray
}
