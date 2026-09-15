import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS } from '../shared/ipc'
import { SetupStyleSchema, type ImportResult } from '../shared/schemas'
import { analyzeConversations } from './intelligence/pipeline'
import { sampleImportResult } from './sample'
import { scanHistories } from './sources/discovery'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let latestImport: ImportResult | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f4f1e9',
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Renderer failed to load', { errorCode, errorDescription })
  })
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('Preload failed', { preloadPath, error })
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(currentDirectory, '../renderer/index.html'))
  }
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const existingWindow = BrowserWindow.getAllWindows()[0]
    if (!existingWindow) return

    if (existingWindow.isMinimized()) existingWindow.restore()
    existingWindow.show()
    existingWindow.focus()
  })

  app.whenReady().then(() => {
    ipcMain.handle(IPC_CHANNELS.scanHistories, async () => {
      latestImport = await scanHistories()
      return latestImport
    })
    ipcMain.handle(IPC_CHANNELS.loadSampleHistories, () => {
      latestImport = sampleImportResult()
      return latestImport
    })
    ipcMain.handle(IPC_CHANNELS.analyzeHistories, async (event, rawSetupStyle: unknown) => {
      const setupStyle = SetupStyleSchema.parse(rawSetupStyle)
      if (!latestImport) throw new Error('Import conversation history before starting analysis.')
      return analyzeConversations(latestImport.conversations, setupStyle, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.analysisProgress, progress)
      })
    })
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
