import { z } from 'zod'

export const ProviderSchema = z.enum(['claude-code', 'codex'])
export type Provider = z.infer<typeof ProviderSchema>

export const DiagnosticSchema = z.object({
  level: z.enum(['info', 'warning', 'error']),
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  line: z.number().int().positive().optional(),
})
export type Diagnostic = z.infer<typeof DiagnosticSchema>

export const SourceReferenceSchema = z.object({
  provider: ProviderSchema,
  conversationId: z.string(),
  recordId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  line: z.number().int().positive().optional(),
})
export type SourceReference = z.infer<typeof SourceReferenceSchema>

export const NormalizedContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1) }),
  z.object({ type: z.literal('image-reference'), mediaType: z.string().optional() }),
])
export type NormalizedContentBlock = z.infer<typeof NormalizedContentBlockSchema>

export const NormalizedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.array(NormalizedContentBlockSchema).min(1),
  timestamp: z.string().datetime().optional(),
  sourceReferences: z.array(SourceReferenceSchema).min(1),
})
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>

export const NormalizedConversationSchema = z.object({
  id: z.string(),
  provider: ProviderSchema,
  title: z.string().min(1),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  project: z.string().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  sourcePath: z.string(),
  messages: z.array(NormalizedMessageSchema),
  metadata: z.record(z.string(), z.string()).default({}),
})
export type NormalizedConversation = z.infer<typeof NormalizedConversationSchema>

export const DiscoveredSourceSchema = z.object({
  provider: ProviderSchema,
  path: z.string(),
  status: z.enum(['found', 'missing', 'empty', 'error']),
  conversationCount: z.number().int().nonnegative(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  diagnostics: z.array(DiagnosticSchema),
})
export type DiscoveredSource = z.infer<typeof DiscoveredSourceSchema>

export const ImportResultSchema = z.object({
  sources: z.array(DiscoveredSourceSchema),
  conversations: z.array(NormalizedConversationSchema),
  diagnostics: z.array(DiagnosticSchema),
})
export type ImportResult = z.infer<typeof ImportResultSchema>

export const SetupStyleSchema = z.enum(['automatic', 'review'])
export type SetupStyle = z.infer<typeof SetupStyleSchema>

export const PreparedConversationSchema = z.object({
  conversationId: z.string(),
  provider: ProviderSchema,
  title: z.string(),
  project: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  excerpts: z.array(
    z.object({
      messageId: z.string(),
      role: z.enum(['user', 'assistant']),
      text: z.string(),
      sourceReferences: z.array(SourceReferenceSchema),
    }),
  ),
})
export type PreparedConversation = z.infer<typeof PreparedConversationSchema>

export const ConversationSummarySchema = z.object({
  conversationId: z.string(),
  project: z.string().nullable(),
  goals: z.array(z.string()),
  durableFacts: z.array(z.string()),
  decisions: z.array(z.string()),
  toolsAndWorkflows: z.array(z.string()),
  preferences: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  candidateResponsibilities: z.array(z.string()),
})
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

export const AgentConfidenceSchema = z.enum([
  'Strong pattern',
  'Focused project',
  'Worth reviewing',
])
export type AgentConfidence = z.infer<typeof AgentConfidenceSchema>

export const AgentEvidenceSchema = z.object({
  conversationId: z.string(),
  title: z.string(),
  provider: ProviderSchema,
  timestamp: z.string().datetime().nullable(),
  excerpt: z.string(),
})
export type AgentEvidence = z.infer<typeof AgentEvidenceSchema>

export const BrainFileNameSchema = z.enum([
  'README.md',
  'context.md',
  'patterns.md',
  'key-decisions.md',
  'open-questions.md',
])

export const BrainFileSchema = z.object({
  name: BrainFileNameSchema,
  content: z.string(),
})
export type BrainFile = z.infer<typeof BrainFileSchema>

export const BrainFileListSchema = z
  .array(BrainFileSchema)
  .length(5)
  .refine((files) => new Set(files.map((file) => file.name)).size === 5, {
    message: 'Brain files must contain each required file exactly once.',
  })

export const AgentSuggestionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  purpose: z.string().min(1),
  topics: z.array(z.string()).max(5),
  confidence: AgentConfidenceSchema,
  conversationIds: z.array(z.string()).min(1),
  evidence: z.array(AgentEvidenceSchema).min(1),
  brainFiles: BrainFileListSchema,
})
export type AgentSuggestion = z.infer<typeof AgentSuggestionSchema>

export const AnalysisProgressSchema = z.object({
  step: z.enum(['preparing', 'summarizing', 'clustering', 'synthesizing', 'complete']),
  label: z.string(),
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
})
export type AnalysisProgress = z.infer<typeof AnalysisProgressSchema>

export const AnalysisResultSchema = z.object({
  setupStyle: SetupStyleSchema,
  mode: z.enum(['openai', 'mixed', 'deterministic']),
  summaries: z.array(ConversationSummarySchema),
  agents: z.array(AgentSuggestionSchema).min(1).max(5),
  diagnostics: z.array(DiagnosticSchema),
})
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>
