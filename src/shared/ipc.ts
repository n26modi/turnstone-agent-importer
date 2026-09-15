import type {
  AgentSuggestion,
  AnalysisProgress,
  AnalysisResult,
  CreationPlan,
  GeneratedOutputManifest,
  ImportResult,
  MergeResult,
  SetupStyle,
} from './schemas'

export const IPC_CHANNELS = {
  scanHistories: 'histories:scan',
  loadSampleHistories: 'histories:sample',
  analyzeHistories: 'histories:analyze',
  analysisProgress: 'histories:analysis-progress',
  mergeAgents: 'agents:merge',
  chooseDestination: 'agents:choose-destination',
  planCreation: 'agents:plan-creation',
  createAgents: 'agents:create',
  revealAgents: 'agents:reveal',
} as const

export interface TurnstoneDesktopApi {
  scanHistories(): Promise<ImportResult>
  loadSampleHistories(): Promise<ImportResult>
  analyzeHistories(setupStyle: SetupStyle): Promise<AnalysisResult>
  onAnalysisProgress(listener: (progress: AnalysisProgress) => void): () => void
  mergeAgents(first: AgentSuggestion, second: AgentSuggestion): Promise<MergeResult>
  chooseDestination(): Promise<string | null>
  planCreation(agents: AgentSuggestion[]): Promise<CreationPlan>
  createAgents(): Promise<GeneratedOutputManifest>
  revealAgents(): Promise<void>
}
