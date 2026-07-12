import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerProjectHandlers } from './handlers/projects'
import { registerModuleHandlers } from './handlers/modules'
import { registerRequirementHandlers } from './handlers/requirements'
import { registerHeadingHandlers } from './handlers/headings'
import { registerCustomFieldHandlers } from './handlers/requirementCustomFields'
import { registerConnectionCustomFieldHandlers } from './handlers/connectionCustomFields'
import { registerAcceptanceCriteriaHandlers } from './handlers/acceptanceCriteria'
import { registerElementTypeHandlers } from './handlers/elementTypes'
import { registerConnectionTypeHandlers } from './handlers/connectionTypes'
import { registerElementHandlers } from './handlers/elements'
import { registerConnectionHandlers } from './handlers/connections'
import { registerElementLinkHandlers } from './handlers/elementLinks'
import { registerConnectionLinkHandlers } from './handlers/connectionLinks'
import { registerRequirementLinkHandlers } from './handlers/requirementLinks'
import { registerSearchHandlers } from './handlers/search'
import { registerArchitectureHandlers } from './handlers/architectures'

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
  win.webContents.openDevTools()
}

app.whenReady().then(() => {
  registerProjectHandlers()
  registerModuleHandlers()
  registerRequirementHandlers()
  registerHeadingHandlers()
  registerCustomFieldHandlers()
  registerConnectionCustomFieldHandlers()
  registerAcceptanceCriteriaHandlers()
  registerElementTypeHandlers()
  registerConnectionTypeHandlers()
  registerElementHandlers()
  registerConnectionHandlers()
  registerElementLinkHandlers()
  registerConnectionLinkHandlers()
  registerRequirementLinkHandlers()
  registerSearchHandlers()
  registerArchitectureHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
