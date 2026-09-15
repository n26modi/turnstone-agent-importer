import type { AnalysisProgress, AnalysisResult, ImportResult, SetupStyle } from './schemas'

export const IPC_CHANNELS = {
  scanHistories: 'histories:scan',
  loadSampleHistories: 'histories:sample',
  analyzeHistories: 'histories:analyze',
  analysisProgress: 'histories:analysis-progress',
} as const

export interface TurnstoneDesktopApi {
  scanHistories(): Promise<ImportResult>
  loadSampleHistories(): Promise<ImportResult>
  analyzeHistories(setupStyle: SetupStyle): Promise<AnalysisResult>
  onAnalysisProgress(listener: (progress: AnalysisProgress) => void): () => void
}
