import type {
  NormalizedConversation,
  NormalizedMessage,
  PreparedConversation,
} from '../../shared/schemas'

const MAX_CONVERSATION_CHARACTERS = 6_500
const MAX_EXCERPT_CHARACTERS = 1_600
const generatedPrefixes = [
  '<environment_context>',
  '<permissions instructions>',
  '<collaboration_mode>',
]
const signalPattern =
  /\b(decid|because|require|prefer|must|should|blocked|error|fix|implement|build|next|todo|question|architecture|workflow)\w*/i

export function redactSecrets(text: string): string {
  return text
    .replace(
      /-----BEGIN ((?:[A-Z0-9]+ )?PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/g,
      '[private key removed]',
    )
    .replace(
      /((?:["']?)[\w-]*(?:api[_-]?key|token|secret|password)[\w-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      '$1[secret removed]',
    )
    .replace(
      /\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[oprsu]_[a-zA-Z0-9]{16,}|github_pat_[a-zA-Z0-9_]{16,}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
      '[secret removed]',
    )
    .replace(/\bBearer\s+[a-zA-Z0-9._~+/-]{8,}={0,2}/gi, 'Bearer [secret removed]')
    .trim()
}

function messageText(message: NormalizedMessage): string {
  return redactSecrets(
    message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n'),
  )
}

function excerptScore(
  message: NormalizedMessage,
  text: string,
  index: number,
  total: number,
): number {
  let score = message.role === 'user' ? 4 : 1
  if (signalPattern.test(text)) score += 3
  if (index < 2) score += 2
  if (index >= total - 2) score += 2
  return score
}

export function prepareConversation(conversation: NormalizedConversation): PreparedConversation {
  const candidates = conversation.messages.flatMap((message, index) => {
    const text = messageText(message)
    if (!text || generatedPrefixes.some((prefix) => text.startsWith(prefix))) return []
    return [
      {
        message,
        index,
        text,
        score: excerptScore(message, text, index, conversation.messages.length),
      },
    ]
  })

  const selectedIndexes = new Set<number>()
  for (const candidate of candidates.slice(0, 2)) selectedIndexes.add(candidate.index)
  for (const candidate of candidates.slice(-2)) selectedIndexes.add(candidate.index)
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score).slice(0, 8)) {
    selectedIndexes.add(candidate.index)
  }

  let usedCharacters = 0
  const selected = candidates
    .filter((candidate) => selectedIndexes.has(candidate.index))
    .sort((a, b) => a.index - b.index)
  const excerpts = selected.flatMap(({ message, text }, index) => {
    const remaining = MAX_CONVERSATION_CHARACTERS - usedCharacters
    if (remaining <= 0) return []
    // Reserve room for every selected excerpt, including recent unresolved work.
    const fairShare = Math.floor(remaining / (selected.length - index))
    const excerpt = text.slice(0, Math.min(MAX_EXCERPT_CHARACTERS, fairShare)).trim()
    if (!excerpt) return []
    usedCharacters += excerpt.length
    return [
      {
        messageId: message.id,
        role: message.role,
        text: excerpt,
        sourceReferences: message.sourceReferences,
      },
    ]
  })

  return {
    conversationId: conversation.id,
    provider: conversation.provider,
    title: redactSecrets(conversation.title),
    project: conversation.project ? redactSecrets(conversation.project) : null,
    startedAt: conversation.startedAt ?? null,
    excerpts,
  }
}

export function prepareConversations(
  conversations: NormalizedConversation[],
): PreparedConversation[] {
  return conversations
    .map(prepareConversation)
    .filter((conversation) => conversation.excerpts.length > 0)
}
