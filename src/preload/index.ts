import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type TurnstoneDesktopApi } from '../shared/ipc'
import type {
  AgentSuggestion,
  AnalysisProgress,
  AnalysisResult,
  CreationPlan,
  GeneratedOutputManifest,
  ImportResult,
  MergeResult,
  SetupStyle,
} from '../shared/schemas'

const api: TurnstoneDesktopApi = {
  async scanHistories() {
    return ipcRenderer.invoke(IPC_CHANNELS.scanHistories) as Promise<ImportResult>
  },
  async loadSampleHistories() {
    return ipcRenderer.invoke(IPC_CHANNELS.loadSampleHistories) as Promise<ImportResult>
  },
  async analyzeHistories(setupStyle: SetupStyle) {
    return ipcRenderer.invoke(IPC_CHANNELS.analyzeHistories, setupStyle) as Promise<AnalysisResult>
  },
  onAnalysisProgress(listener: (progress: AnalysisProgress) => void) {
    const handler = (_event: IpcRendererEvent, progress: AnalysisProgress) => listener(progress)
    ipcRenderer.on(IPC_CHANNELS.analysisProgress, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.analysisProgress, handler)
  },
  async mergeAgents(first: AgentSuggestion, second: AgentSuggestion) {
    return ipcRenderer.invoke(IPC_CHANNELS.mergeAgents, first, second) as Promise<MergeResult>
  },
  async chooseDestination() {
    return ipcRenderer.invoke(IPC_CHANNELS.chooseDestination) as Promise<string | null>
  },
  async planCreation(agents: AgentSuggestion[]) {
    return ipcRenderer.invoke(IPC_CHANNELS.planCreation, agents) as Promise<CreationPlan>
  },
  async createAgents() {
    return ipcRenderer.invoke(IPC_CHANNELS.createAgents) as Promise<GeneratedOutputManifest>
  },
  async revealAgents() {
    await ipcRenderer.invoke(IPC_CHANNELS.revealAgents)
  },
}

contextBridge.exposeInMainWorld('turnstone', api)
