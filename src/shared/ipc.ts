import type { ImportResult } from './schemas'

export const IPC_CHANNELS = {
  scanHistories: 'histories:scan',
} as const

export interface TurnstoneDesktopApi {
  scanHistories(): Promise<ImportResult>
}
