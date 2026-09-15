import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS } from '../shared/ipc'
import {
  AgentSuggestionSchema,
  SetupStyleSchema,
  type AgentSuggestion,
  type AnalysisResult,
  type CreationPlan,
  type GeneratedOutputManifest,
  type ImportResult,
} from '../shared/schemas'
import { analyzeConversations } from './intelligence/pipeline'
import { mergeAgentSuggestions } from './intelligence/review'
import { createAgentFolders, defaultOutputDestination, planAgentCreation } from './output/writer'
import { sampleImportResult } from './sample'
import { scanHistories } from './sources/discovery'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
app.setName('Turnstone Agent Importer')
app.setPath('userData', path.join(app.getPath('appData'), 'Turnstone Agent Importer'))
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let latestImport: ImportResult | null = null
let latestAnalysis: AnalysisResult | null = null
let selectedDestination = defaultOutputDestination()
let latestPlan: CreationPlan | null = null
let plannedAgents: AgentSuggestion[] = []
let latestManifest: GeneratedOutputManifest | null = null

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
      latestAnalysis = await analyzeConversations(
        latestImport.conversations,
        setupStyle,
        (progress) => {
          if (!event.sender.isDestroyed())
            event.sender.send(IPC_CHANNELS.analysisProgress, progress)
        },
      )
      return latestAnalysis
    })
    ipcMain.handle(IPC_CHANNELS.mergeAgents, async (_event, rawFirst, rawSecond) => {
      if (!latestImport || !latestAnalysis)
        throw new Error('Analyze histories before merging Agents.')
      return mergeAgentSuggestions(
        AgentSuggestionSchema.parse(rawFirst),
        AgentSuggestionSchema.parse(rawSecond),
        latestAnalysis,
        latestImport.conversations,
      )
    })
    ipcMain.handle(IPC_CHANNELS.chooseDestination, async () => {
      const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const options: OpenDialogOptions = {
        title: 'Choose where to create Turnstone Agents',
        defaultPath: selectedDestination,
        properties: ['openDirectory', 'createDirectory'],
      }
      const choice = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options)
      if (choice.canceled || !choice.filePaths[0]) return null
      selectedDestination = path.resolve(choice.filePaths[0])
      latestPlan = null
      plannedAgents = []
      return selectedDestination
    })
    ipcMain.handle(IPC_CHANNELS.planCreation, async (_event, rawAgents: unknown) => {
      const agents = AgentSuggestionSchema.array().min(1).max(5).parse(rawAgents)
      latestPlan = await planAgentCreation(agents, selectedDestination)
      plannedAgents = agents
      return latestPlan
    })
    ipcMain.handle(IPC_CHANNELS.createAgents, async () => {
      if (!latestPlan || plannedAgents.length === 0) {
        throw new Error('Review the folder plan before creating Agents.')
      }
      latestManifest = await createAgentFolders(latestPlan, plannedAgents)
      return latestManifest
    })
    ipcMain.handle(IPC_CHANNELS.revealAgents, () => {
      const created = latestManifest?.agents.find((agent) => agent.status === 'created')
      if (!created) throw new Error('No created Agent folder is available to reveal.')
      shell.showItemInFolder(created.path)
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
