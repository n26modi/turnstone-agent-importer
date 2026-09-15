import path from 'node:path'
import {
  NormalizedConversationSchema,
  type Diagnostic,
  type NormalizedContentBlock,
  type NormalizedMessage,
  type SourceReference,
} from '../../shared/schemas'
import { readJsonLines } from './jsonl'
import {
  asBoolean,
  asString,
  deriveTitle,
  isRecord,
  projectName,
  textBlock,
  unknownBlockDiagnostic,
} from './utils'

interface ClaudeParseResult {
  conversation: ReturnType<typeof NormalizedConversationSchema.parse>
  diagnostics: Diagnostic[]
}

interface PendingMessage extends NormalizedMessage {
  order: number
}

const ignoredContentTypes = new Set(['thinking', 'tool_use', 'tool_result'])

function parseClaudeContent(
  content: unknown,
  sourcePath: string,
  line: number,
  diagnostics: Diagnostic[],
): NormalizedContentBlock[] {
  if (typeof content === 'string') {
    const block = textBlock(content)
    return block ? [block] : []
  }

  if (!Array.isArray(content)) return []
  const blocks: NormalizedContentBlock[] = []

  for (const rawBlock of content) {
    if (!isRecord(rawBlock)) continue
    const type = asString(rawBlock.type) ?? 'unknown'

    if (type === 'text') {
      const block = textBlock(rawBlock.text)
      if (block) blocks.push(block)
      continue
    }

    if (type === 'image') {
      const source = isRecord(rawBlock.source) ? rawBlock.source : undefined
      blocks.push({ type: 'image-reference', mediaType: asString(source?.media_type) })
      continue
    }

    if (!ignoredContentTypes.has(type)) {
      diagnostics.push(unknownBlockDiagnostic('Claude Code', type, sourcePath, line))
    }
  }

  return blocks
}

function sourceReference(
  conversationId: string,
  record: Record<string, unknown>,
  line: number,
): SourceReference {
  return {
    provider: 'claude-code',
    conversationId,
    recordId: asString(record.uuid),
    timestamp: asString(record.timestamp),
    line,
  }
}

export async function parseClaudeConversation(sourcePath: string): Promise<ClaudeParseResult> {
  const jsonl = await readJsonLines(sourcePath)
  const diagnostics = [...jsonl.diagnostics]
  const records = jsonl.records.filter(
    (entry): entry is { line: number; value: Record<string, unknown> } => isRecord(entry.value),
  )

  const firstSessionId = records
    .map(({ value }) => asString(value.sessionId))
    .find((value): value is string => Boolean(value))
  const conversationId = firstSessionId ?? path.basename(sourcePath, '.jsonl')
  const messages: PendingMessage[] = []
  const assistantMessages = new Map<string, PendingMessage>()
  const seenRecordIds = new Set<string>()
  const timestamps: string[] = []
  const versions = new Set<string>()
  let cwd: string | undefined
  let gitBranch: string | undefined
  let customTitle: string | undefined
  let aiTitle: string | undefined
  let firstUserText: string | undefined

  for (const { line, value: record } of records) {
    const timestamp = asString(record.timestamp)
    if (timestamp) timestamps.push(timestamp)
    cwd ??= asString(record.cwd)
    gitBranch ??= asString(record.gitBranch)
    const version = asString(record.version)
    if (version) versions.add(version)

    const type = asString(record.type)
    if (type === 'custom-title') customTitle = asString(record.customTitle) ?? customTitle
    if (type === 'ai-title') aiTitle = asString(record.aiTitle) ?? aiTitle

    if (type !== 'user' && type !== 'assistant') continue
    if (
      asBoolean(record.isMeta) ||
      asBoolean(record.isCompactSummary) ||
      asBoolean(record.isVisibleInTranscriptOnly) ||
      asBoolean(record.isSidechain)
    ) {
      continue
    }

    const recordId = asString(record.uuid)
    if (recordId && seenRecordIds.has(recordId)) {
      diagnostics.push({
        level: 'warning',
        code: 'duplicate-record',
        message: 'Skipped a duplicate Claude Code record.',
        path: sourcePath,
        line,
      })
      continue
    }
    if (recordId) seenRecordIds.add(recordId)

    if (!isRecord(record.message)) continue
    const role = asString(record.message.role)
    if (role !== type) continue
    const content = parseClaudeContent(record.message.content, sourcePath, line, diagnostics)
    if (content.length === 0) continue

    const reference = sourceReference(conversationId, record, line)
    if (type === 'user') {
      const firstTextBlock = content.find((block) => block.type === 'text')
      if (firstTextBlock?.type === 'text') firstUserText ??= firstTextBlock.text
      messages.push({
        id: recordId ?? `user-${line}`,
        role: 'user',
        content,
        timestamp,
        sourceReferences: [reference],
        order: line,
      })
      continue
    }

    const messageId = asString(record.message.id) ?? recordId ?? `assistant-${line}`
    const existing = assistantMessages.get(messageId)
    if (existing) {
      existing.content.push(...content)
      existing.sourceReferences.push(reference)
      continue
    }

    const message: PendingMessage = {
      id: messageId,
      role: 'assistant',
      content,
      timestamp,
      sourceReferences: [reference],
      order: line,
    }
    assistantMessages.set(messageId, message)
    messages.push(message)
  }

  messages.sort((a, b) => a.order - b.order)
  timestamps.sort()
  const fallbackTitle = cwd
    ? (projectName(cwd) ?? 'Claude Code conversation')
    : 'Claude Code conversation'

  const conversation = NormalizedConversationSchema.parse({
    id: conversationId,
    provider: 'claude-code',
    title: deriveTitle(customTitle ?? aiTitle ?? firstUserText, fallbackTitle),
    startedAt: timestamps[0],
    updatedAt: timestamps.at(-1),
    project: projectName(cwd),
    cwd,
    gitBranch,
    sourcePath,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      sourceReferences: message.sourceReferences,
    })),
    metadata: {
      recordCount: String(records.length),
      versions: [...versions].sort().join(', '),
    },
  })

  return { conversation, diagnostics }
}
