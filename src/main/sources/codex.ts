import path from 'node:path'
import {
  NormalizedConversationSchema,
  type Diagnostic,
  type NormalizedMessage,
  type SourceReference,
} from '../../shared/schemas'
import { readJsonLines } from './jsonl'
import {
  asString,
  deriveTitle,
  isRecord,
  projectName,
  textBlock,
  unknownBlockDiagnostic,
} from './utils'

interface CodexParseResult {
  conversation: ReturnType<typeof NormalizedConversationSchema.parse>
  diagnostics: Diagnostic[]
}

interface PendingMessage extends NormalizedMessage {
  order: number
}

const generatedInputPrefixes = [
  '<environment_context>',
  '<permissions instructions>',
  '<collaboration_mode>',
]

function ref(
  conversationId: string,
  recordId: string | undefined,
  timestamp: string | undefined,
  line: number,
): SourceReference {
  return {
    provider: 'codex',
    conversationId,
    recordId,
    timestamp,
    line,
  }
}

function stringContent(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined

  const texts = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const value = asString(item.text) ?? asString(item.content)
    return value ? [value] : []
  })
  return texts.join('\n\n') || undefined
}

export async function parseCodexConversation(
  sourcePath: string,
  indexedTitle?: string,
): Promise<CodexParseResult> {
  const jsonl = await readJsonLines(sourcePath)
  const diagnostics = [...jsonl.diagnostics]
  const records = jsonl.records.filter(
    (entry): entry is { line: number; value: Record<string, unknown> } => isRecord(entry.value),
  )
  const sessionMeta = records
    .map(({ value }) => value)
    .find((record) => record.type === 'session_meta' && isRecord(record.payload))
  const meta = sessionMeta && isRecord(sessionMeta.payload) ? sessionMeta.payload : {}
  const conversationId =
    asString(meta.session_id) ?? asString(meta.id) ?? path.basename(sourcePath, '.jsonl')
  const cwd = asString(meta.cwd)
  const timestamps = records.flatMap(({ value }) => {
    const timestamp = asString(value.timestamp)
    return timestamp ? [timestamp] : []
  })
  const visibleMessages: PendingMessage[] = []
  const fallbackMessages: PendingMessage[] = []
  const seenVisibleIds = new Set<string>()

  for (const { line, value: record } of records) {
    const timestamp = asString(record.timestamp)
    const payload = isRecord(record.payload) ? record.payload : undefined
    if (!payload) continue

    if (
      record.type === 'event_msg' &&
      payload.type === 'item_completed' &&
      isRecord(payload.item)
    ) {
      const item = payload.item
      const itemType = asString(item.type)
      if (itemType !== 'UserMessage' && itemType !== 'AgentMessage') continue

      const content = textBlock(stringContent(item.content))
      if (!content) continue
      const id = asString(item.id) ?? `${itemType}-${line}`
      if (seenVisibleIds.has(id)) {
        diagnostics.push({
          level: 'warning',
          code: 'duplicate-record',
          message: 'Skipped a duplicate Codex item.',
          path: sourcePath,
          line,
        })
        continue
      }
      seenVisibleIds.add(id)
      visibleMessages.push({
        id,
        role: itemType === 'UserMessage' ? 'user' : 'assistant',
        content: [content],
        timestamp,
        sourceReferences: [ref(conversationId, id, timestamp, line)],
        order: line,
      })
      continue
    }

    if (record.type !== 'response_item' || payload.type !== 'message') continue
    const role = asString(payload.role)
    if (role !== 'user' && role !== 'assistant') continue
    const rawContent = Array.isArray(payload.content) ? payload.content : []
    const textParts: string[] = []

    for (const rawBlock of rawContent) {
      if (!isRecord(rawBlock)) continue
      const blockType = asString(rawBlock.type) ?? 'unknown'
      if (blockType === 'input_text' || blockType === 'output_text') {
        const value = asString(rawBlock.text)
        if (value) textParts.push(value)
      } else {
        diagnostics.push(unknownBlockDiagnostic('Codex', blockType, sourcePath, line))
      }
    }

    const combined = textParts.join('\n\n').trim()
    if (!combined) continue
    if (role === 'user' && generatedInputPrefixes.some((prefix) => combined.startsWith(prefix))) {
      continue
    }
    const id = asString(payload.id) ?? `${role}-${line}`
    const content = textBlock(combined)
    if (!content) continue
    fallbackMessages.push({
      id,
      role,
      content: [content],
      timestamp,
      sourceReferences: [ref(conversationId, id, timestamp, line)],
      order: line,
    })
  }

  const selectedMessages = visibleMessages.length > 0 ? visibleMessages : fallbackMessages
  selectedMessages.sort((a, b) => a.order - b.order)
  timestamps.sort()
  const firstUserText = selectedMessages
    .find((message) => message.role === 'user')
    ?.content.find((block) => block.type === 'text')
  const fallbackTitle = projectName(cwd) ?? 'Codex conversation'

  const conversation = NormalizedConversationSchema.parse({
    id: conversationId,
    provider: 'codex',
    title: deriveTitle(
      indexedTitle ?? (firstUserText?.type === 'text' ? firstUserText.text : undefined),
      fallbackTitle,
    ),
    startedAt: timestamps[0],
    updatedAt: timestamps.at(-1),
    project: projectName(cwd),
    cwd,
    sourcePath,
    messages: selectedMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      sourceReferences: message.sourceReferences,
    })),
    metadata: {
      recordCount: String(records.length),
      cliVersion: asString(meta.cli_version) ?? '',
      modelProvider: asString(meta.model_provider) ?? '',
      source: asString(meta.source) ?? '',
    },
  })

  return { conversation, diagnostics }
}
