import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type TurnstoneDesktopApi } from '../shared/ipc'
import type { AnalysisProgress, AnalysisResult, ImportResult, SetupStyle } from '../shared/schemas'

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
}

contextBridge.exposeInMainWorld('turnstone', api)
