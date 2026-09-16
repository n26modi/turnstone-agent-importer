import { createHash } from 'node:crypto'
import {
  AgentSuggestionSchema,
  BrainFileListSchema,
  MergeResultSchema,
  type AgentSuggestion,
  type AnalysisResult,
  type MergeResult,
  type NormalizedConversation,
} from '../../shared/schemas'
import { deterministicBrain } from './fallback'
import { modelFromEnvironment, type IntelligenceModel } from './model'
import { prepareConversations } from './preparation'

export async function mergeAgentSuggestions(
  rawFirst: AgentSuggestion,
  rawSecond: AgentSuggestion,
  analysis: AnalysisResult,
  conversations: NormalizedConversation[],
  options: { model?: IntelligenceModel | null } = {},
): Promise<MergeResult> {
  const first = AgentSuggestionSchema.parse(rawFirst)
  const second = AgentSuggestionSchema.parse(rawSecond)
  if (first.id === second.id) throw new Error('Choose two different Agents to merge.')

  const name = `${first.name.replace(/ Agent$/i, '')} + ${second.name.replace(/ Agent$/i, '')} Agent`
  const proposal = {
    name,
    purpose: `Combine ${first.purpose.replace(/[.]$/, '')} and ${second.purpose.replace(/^[A-Z]/, (letter) => letter.toLowerCase())}`,
    topics: [...new Set([...first.topics, ...second.topics])].slice(0, 5),
    confidence: 'Worth reviewing' as const,
    conversationIds: [...new Set([...first.conversationIds, ...second.conversationIds])],
  }
  const evidence = [...first.evidence, ...second.evidence].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.conversationId === item.conversationId) === index,
  )
  const id = createHash('sha256')
    .update(`${proposal.name}:${[...proposal.conversationIds].sort().join(',')}`)
    .digest('hex')
    .slice(0, 12)
  const base = AgentSuggestionSchema.omit({ brainFiles: true }).parse({ ...proposal, id, evidence })
  const model = options.model === undefined ? modelFromEnvironment() : options.model

  if (model) {
    try {
      const brainFiles = BrainFileListSchema.parse(
        await model.synthesize(proposal, analysis.summaries),
      )
      return MergeResultSchema.parse({ agent: { ...base, brainFiles }, mode: 'openai' })
    } catch {
      // Fall through to deterministic regeneration without losing the merge.
    }
  }

  const brainFiles = deterministicBrain(
    base,
    prepareConversations(conversations),
    analysis.summaries,
  )
  return MergeResultSchema.parse({ agent: { ...base, brainFiles }, mode: 'deterministic' })
}
