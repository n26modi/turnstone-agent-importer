import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type TurnstoneDesktopApi } from '../shared/ipc'
import type { ImportResult } from '../shared/schemas'

const api: TurnstoneDesktopApi = {
  async scanHistories() {
    return ipcRenderer.invoke(IPC_CHANNELS.scanHistories) as Promise<ImportResult>
  },
}

contextBridge.exposeInMainWorld('turnstone', api)
