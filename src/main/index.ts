import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerProjectHandlers } from './handlers/projects'
import { registerModuleHandlers } from './handlers/modules'
import { registerRequirementHandlers } from './handlers/requirements'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerProjectHandlers()
  registerModuleHandlers()
  registerRequirementHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
