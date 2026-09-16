import { createHash } from 'node:crypto'
import type {
  AgentEvidence,
  AgentSuggestion,
  BrainFile,
  ConversationSummary,
  PreparedConversation,
} from '../../shared/schemas'

const stopWords = new Set([
  'about',
  'after',
  'again',
  'also',
  'been',
  'being',
  'build',
  'could',
  'from',
  'have',
  'into',
  'just',
  'like',
  'more',
  'need',
  'only',
  'should',
  'some',
  'that',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'using',
  'very',
  'want',
  'were',
  'what',
  'when',
  'where',
  'which',
  'will',
  'with',
  'would',
  'your',
])

function sentence(text: string, limit = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const first = clean.split(/(?<=[.!?])\s/)[0] ?? clean
  return first.length > limit ? `${first.slice(0, limit - 1).trimEnd()}…` : first
}

function topics(conversations: PreparedConversation[]): string[] {
  const counts = new Map<string, number>()
  for (const conversation of conversations) {
    for (const excerpt of conversation.excerpts) {
      for (const word of excerpt.text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
        if (stopWords.has(word)) continue
        counts.set(word, (counts.get(word) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([word]) => word)
}

export function deterministicSummary(conversation: PreparedConversation): ConversationSummary {
  const userTexts = conversation.excerpts
    .filter((excerpt) => excerpt.role === 'user')
    .map((item) => item.text)
  const assistantTexts = conversation.excerpts
    .filter((excerpt) => excerpt.role === 'assistant')
    .map((item) => item.text)
  const allText = conversation.excerpts.map((item) => item.text)

  return {
    conversationId: conversation.conversationId,
    project: conversation.project,
    goals: userTexts.slice(0, 2).map((text) => sentence(text)),
    durableFacts: allText
      .filter((text) => /\b(is|uses|has|contains|runs|located)\b/i.test(text))
      .slice(0, 3)
      .map((text) => sentence(text)),
    decisions: allText
      .filter((text) => /\b(decid|chosen|will use|must|should)\w*/i.test(text))
      .slice(0, 3)
      .map((text) => sentence(text)),
    toolsAndWorkflows: topics([conversation]),
    preferences: userTexts
      .filter((text) => /\b(prefer|want|avoid|like)\w*/i.test(text))
      .slice(0, 3)
      .map((text) => sentence(text)),
    unresolvedQuestions: allText
      .filter((text) => /\?|\b(todo|next|unresolved|blocked)\b/i.test(text))
      .slice(-3)
      .map((text) => sentence(text)),
    candidateResponsibilities: [...userTexts, ...assistantTexts]
      .slice(0, 3)
      .map((text) => sentence(text)),
  }
}

function evidenceFor(conversation: PreparedConversation): AgentEvidence {
  const excerpt =
    conversation.excerpts.find((item) => item.role === 'user') ?? conversation.excerpts[0]
  return {
    conversationId: conversation.conversationId,
    title: conversation.title,
    provider: conversation.provider,
    timestamp: excerpt?.sourceReferences[0]?.timestamp ?? conversation.startedAt,
    excerpt: sentence(excerpt?.text ?? conversation.title, 240),
  }
}

function brainFiles(
  name: string,
  purpose: string,
  group: PreparedConversation[],
  summaries: ConversationSummary[],
): BrainFile[] {
  const citations = group
    .map(
      (conversation) =>
        `- ${conversation.title} (${conversation.provider}; ${conversation.conversationId})`,
    )
    .join('\n')
  const relevant = summaries.filter((summary) =>
    group.some((item) => item.conversationId === summary.conversationId),
  )
  const section = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join('\n') : '- Nothing durable identified yet.'

  return [
    {
      name: 'README.md',
      content: `# ${name}\n\n${purpose}\n\n## Responsibilities\n${section(relevant.flatMap((item) => item.candidateResponsibilities).slice(0, 8))}\n\n## Sources\n${citations}`,
    },
    {
      name: 'context.md',
      content: `# Context\n\n${section(relevant.flatMap((item) => item.durableFacts).slice(0, 12))}\n\n## Sources\n${citations}`,
    },
    {
      name: 'patterns.md',
      content: `# Patterns\n\n${section(relevant.flatMap((item) => [...item.toolsAndWorkflows, ...item.preferences]).slice(0, 12))}\n\n## Sources\n${citations}`,
    },
    {
      name: 'key-decisions.md',
      content: `# Key decisions\n\n${section(relevant.flatMap((item) => item.decisions).slice(0, 12))}\n\n## Sources\n${citations}`,
    },
    {
      name: 'open-questions.md',
      content: `# Open questions\n\n${section(relevant.flatMap((item) => item.unresolvedQuestions).slice(0, 12))}\n\n## Sources\n${citations}`,
    },
  ]
}

function agentId(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 12)
}

export function deterministicAgents(
  prepared: PreparedConversation[],
  summaries: ConversationSummary[],
): AgentSuggestion[] {
  const groups = new Map<string, PreparedConversation[]>()
  for (const conversation of prepared) {
    const key =
      conversation.project?.trim() ||
      (conversation.provider === 'claude-code' ? 'Claude Code work' : 'Codex work')
    groups.set(key, [...(groups.get(key) ?? []), conversation])
  }

  const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  const selected = ranked.slice(0, 5)
  if (selected.length === 0) return []

  return selected.map(([groupName, group]) => {
    const groupTopics = topics(group)
    const name = groupName.endsWith('Agent') ? groupName : `${groupName} Agent`
    const purpose = `Keep the context, decisions, and recurring workflows for ${groupName}.`
    return {
      id: agentId(name),
      name,
      purpose,
      topics: groupTopics,
      confidence:
        group.length >= 3
          ? 'Strong pattern'
          : group[0]?.project
            ? 'Focused project'
            : 'Worth reviewing',
      conversationIds: group.map((conversation) => conversation.conversationId),
      evidence: group.map(evidenceFor),
      brainFiles: brainFiles(name, purpose, group, summaries),
    }
  })
}

export function deterministicBrain(
  agent: Omit<AgentSuggestion, 'brainFiles'>,
  prepared: PreparedConversation[],
  summaries: ConversationSummary[],
): BrainFile[] {
  const group = prepared.filter((conversation) =>
    agent.conversationIds.includes(conversation.conversationId),
  )
  return brainFiles(agent.name, agent.purpose, group, summaries)
}
