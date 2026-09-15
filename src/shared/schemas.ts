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
