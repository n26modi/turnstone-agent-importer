import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const rendererUrl =
  process.env.ELECTRON_RENDERER_URL ??
  pathToFileURL(path.join(currentDirectory, '../renderer/index.html')).href
app.setName('Turnstone Agent Importer')
app.setPath('userData', path.join(app.getPath('appData'), 'Turnstone Agent Importer'))
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let latestImport: ImportResult | null = null
let latestAnalysis: AnalysisResult | null = null
let selectedDestination = defaultOutputDestination()
let latestPlan: CreationPlan | null = null
let plannedAgents: AgentSuggestion[] = []
let latestManifest: GeneratedOutputManifest | null = null
let isSampleSession = false
let creationInFlight = false

function setImportedHistory(imported: ImportResult, sample: boolean): ImportResult {
  latestImport = imported
  isSampleSession = sample
  latestAnalysis = null
  latestPlan = null
  plannedAgents = []
  latestManifest = null
  return imported
}

function handle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      !event.senderFrame ||
      new URL(event.senderFrame.url).href !== new URL(rendererUrl).href
    ) {
      throw new Error('This request did not come from the Turnstone application.')
    }
    return handler(event, ...args)
  })
}

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
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://'))
      void shell.openExternal(url).catch(() => {
        console.error('Could not open the requested browser link.')
      })
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
    handle(IPC_CHANNELS.scanHistories, async () => setImportedHistory(await scanHistories(), false))
    handle(IPC_CHANNELS.loadSampleHistories, () => setImportedHistory(sampleImportResult(), true))
    handle(IPC_CHANNELS.analyzeHistories, async (event, rawSetupStyle: unknown) => {
      const setupStyle = SetupStyleSchema.parse(rawSetupStyle)
      if (!latestImport) throw new Error('Import conversation history before starting analysis.')
      latestAnalysis = await analyzeConversations(
        latestImport.conversations,
        setupStyle,
        (progress) => {
          if (!event.sender.isDestroyed())
            event.sender.send(IPC_CHANNELS.analysisProgress, progress)
        },
        isSampleSession ? { model: null } : {},
      )
      return latestAnalysis
    })
    handle(IPC_CHANNELS.mergeAgents, async (_event, rawFirst, rawSecond) => {
      if (!latestImport || !latestAnalysis)
        throw new Error('Analyze histories before merging Agents.')
      return mergeAgentSuggestions(
        AgentSuggestionSchema.parse(rawFirst),
        AgentSuggestionSchema.parse(rawSecond),
        latestAnalysis,
        latestImport.conversations,
        isSampleSession ? { model: null } : {},
      )
    })
    handle(IPC_CHANNELS.chooseDestination, async () => {
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
    handle(IPC_CHANNELS.planCreation, async (_event, rawAgents: unknown) => {
      const agents = AgentSuggestionSchema.array().min(1).max(5).parse(rawAgents)
      latestPlan = await planAgentCreation(agents, selectedDestination)
      plannedAgents = agents
      return latestPlan
    })
    handle(IPC_CHANNELS.createAgents, async () => {
      if (!latestPlan || plannedAgents.length === 0 || creationInFlight) {
        throw new Error('Review the folder plan before creating Agents.')
      }
      creationInFlight = true
      try {
        const manifest = await createAgentFolders(latestPlan, plannedAgents)
        latestManifest = {
          ...manifest,
          agents: [
            ...(latestManifest?.agents.filter((agent) => agent.status === 'created') ?? []),
            ...manifest.agents,
          ],
        }
        latestPlan = null
        plannedAgents = []
        return manifest
      } finally {
        creationInFlight = false
      }
    })
    handle(IPC_CHANNELS.revealAgents, () => {
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
