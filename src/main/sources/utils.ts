import path from 'node:path'
import type {
  Diagnostic,
  NormalizedContentBlock,
  NormalizedConversation,
} from '../../shared/schemas'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function asBoolean(value: unknown): boolean {
  return value === true
}

export function cleanText(value: string): string {
  return value
    .split('\u0000')
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export function textBlock(value: unknown): NormalizedContentBlock | undefined {
  const text = typeof value === 'string' ? cleanText(value) : ''
  return text ? { type: 'text', text } : undefined
}

export function deriveTitle(text: string | undefined, fallback: string): string {
  if (!text) return fallback
  const title = cleanText(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) return fallback
  return title.length > 78 ? `${title.slice(0, 75).trimEnd()}…` : title
}

export function projectName(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined
  const name = path.basename(cwd)
  return name && name !== path.parse(cwd).root ? name : undefined
}

export function dateRange(conversations: NormalizedConversation[]): {
  startedAt?: string
  updatedAt?: string
} {
  const starts = conversations.flatMap((conversation) =>
    conversation.startedAt ? [conversation.startedAt] : [],
  )
  const updates = conversations.flatMap((conversation) =>
    conversation.updatedAt ? [conversation.updatedAt] : [],
  )

  return {
    startedAt: starts.sort()[0],
    updatedAt: updates.sort().at(-1),
  }
}

export function unknownBlockDiagnostic(
  providerName: string,
  blockType: string,
  sourcePath: string,
  line: number,
): Diagnostic {
  return {
    level: 'warning',
    code: 'unknown-content-block',
    message: `${providerName} content block “${blockType}” was skipped.`,
    path: sourcePath,
    line,
  }
}
