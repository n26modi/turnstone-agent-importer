import { createHash } from 'node:crypto'
import {
  AnalysisResultSchema,
  BrainFileListSchema,
  type AgentEvidence,
  type AgentSuggestion,
  type AnalysisProgress,
  type AnalysisResult,
  type ConversationSummary,
  type Diagnostic,
  type NormalizedConversation,
  type PreparedConversation,
  type SetupStyle,
} from '../../shared/schemas'
import { deterministicAgents, deterministicBrain, deterministicSummary } from './fallback'
import { modelFromEnvironment, type AgentProposal, type IntelligenceModel } from './model'
import { prepareConversations } from './preparation'

const SUMMARY_BATCH_SIZE = 4

interface AnalyzeOptions {
  model?: IntelligenceModel | null
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size))
  return result
}

function diagnostic(code: string, message: string): Diagnostic {
  return { level: 'warning', code, message }
}

function validateSummaryReferences(
  summaries: ConversationSummary[],
  batch: PreparedConversation[],
): ConversationSummary[] {
  const expected = new Set(batch.map((conversation) => conversation.conversationId))
  const returned = new Set(summaries.map((summary) => summary.conversationId))
  if (
    summaries.length !== expected.size ||
    returned.size !== expected.size ||
    [...returned].some((id) => !expected.has(id))
  ) {
    throw new Error('Summary output did not match the supplied conversations.')
  }
  return summaries
}

function validateAgentReferences(
  agents: AgentProposal[],
  summaries: ConversationSummary[],
): AgentProposal[] {
  const valid = new Set(summaries.map((summary) => summary.conversationId))
  const seenAgents = new Set<string>()
  for (const agent of agents) {
    const id = suggestionId(agent)
    if (
      agent.conversationIds.some((id) => !valid.has(id)) ||
      new Set(agent.conversationIds).size !== agent.conversationIds.length ||
      seenAgents.has(id)
    ) {
      throw new Error('Agent output referenced a conversation that was not supplied.')
    }
    seenAgents.add(id)
  }
  return agents
}

function evidenceFor(agent: AgentProposal, prepared: PreparedConversation[]): AgentEvidence[] {
  return prepared
    .filter((conversation) => agent.conversationIds.includes(conversation.conversationId))
    .map((conversation) => {
      const excerpt =
        conversation.excerpts.find((item) => item.role === 'user') ?? conversation.excerpts[0]
      const text = excerpt?.text.replace(/\s+/g, ' ').trim() ?? conversation.title
      return {
        conversationId: conversation.conversationId,
        title: conversation.title,
        provider: conversation.provider,
        timestamp: excerpt?.sourceReferences[0]?.timestamp ?? conversation.startedAt,
        excerpt: text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text,
      }
    })
}

function suggestionId(agent: AgentProposal): string {
  return createHash('sha256')
    .update(`${agent.name}:${[...agent.conversationIds].sort().join(',')}`)
    .digest('hex')
    .slice(0, 12)
}

function fallbackProposals(
  prepared: PreparedConversation[],
  summaries: ConversationSummary[],
): AgentProposal[] {
  return deterministicAgents(prepared, summaries).map((agent) => ({
    name: agent.name,
    purpose: agent.purpose,
    topics: agent.topics,
    confidence: agent.confidence,
    conversationIds: agent.conversationIds,
  }))
}

export async function analyzeConversations(
  conversations: NormalizedConversation[],
  setupStyle: SetupStyle,
  onProgress: (progress: AnalysisProgress) => void = () => undefined,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  if (conversations.length === 0) throw new Error('No conversations are available to analyze.')

  const diagnostics: Diagnostic[] = []
  let usedOpenAI = false
  let usedFallback = false
  const model = options.model === undefined ? modelFromEnvironment() : options.model

  onProgress({ step: 'preparing', label: 'Reading conversation excerpts', completed: 0, total: 1 })
  const prepared = prepareConversations(conversations)
  if (prepared.length === 0) throw new Error('No readable conversation excerpts were found.')
  onProgress({ step: 'preparing', label: 'Conversation excerpts ready', completed: 1, total: 1 })

  const batches = chunks(prepared, SUMMARY_BATCH_SIZE)
  const summaries: ConversationSummary[] = []
  for (const [index, batch] of batches.entries()) {
    onProgress({
      step: 'summarizing',
      label: 'Distilling projects and recurring workflows',
      completed: index,
      total: batches.length,
    })
    if (!model) {
      summaries.push(...batch.map(deterministicSummary))
      usedFallback = true
      continue
    }
    try {
      summaries.push(...validateSummaryReferences(await model.summarize(batch), batch))
      usedOpenAI = true
    } catch {
      summaries.push(...batch.map(deterministicSummary))
      usedFallback = true
      diagnostics.push(
        diagnostic('summary-fallback', `Recovered conversation batch ${index + 1} locally.`),
      )
    }
  }
  onProgress({
    step: 'summarizing',
    label: 'Conversation summaries ready',
    completed: batches.length,
    total: batches.length,
  })

  onProgress({ step: 'clustering', label: 'Comparing related work', completed: 0, total: 1 })
  let proposals: AgentProposal[]
  if (model) {
    try {
      proposals = validateAgentReferences(await model.cluster(summaries), summaries)
      usedOpenAI = true
    } catch {
      proposals = fallbackProposals(prepared, summaries)
      usedFallback = true
      diagnostics.push(diagnostic('clustering-fallback', 'Recovered Agent suggestions locally.'))
    }
  } else {
    proposals = fallbackProposals(prepared, summaries)
    usedFallback = true
    diagnostics.push(
      diagnostic(
        'openai-unavailable',
        'OpenAI is not configured; suggestions were prepared locally.',
      ),
    )
  }
  if (proposals.length === 0) throw new Error('No useful Agent suggestions could be prepared.')
  onProgress({ step: 'clustering', label: 'Potential Agents identified', completed: 1, total: 1 })

  const agents: AgentSuggestion[] = []
  for (const [index, proposal] of proposals.entries()) {
    onProgress({
      step: 'synthesizing',
      label: 'Writing evidence-backed Brains',
      completed: index,
      total: proposals.length,
    })
    const base = {
      ...proposal,
      id: suggestionId(proposal),
      evidence: evidenceFor(proposal, prepared),
    }
    if (model) {
      try {
        agents.push({
          ...base,
          brainFiles: BrainFileListSchema.parse(await model.synthesize(proposal, summaries)),
        })
        usedOpenAI = true
        continue
      } catch {
        diagnostics.push(
          diagnostic('brain-fallback', `Recovered the ${proposal.name} Brain locally.`),
        )
      }
    }
    usedFallback = true
    agents.push({ ...base, brainFiles: deterministicBrain(base, prepared, summaries) })
  }

  onProgress({
    step: 'synthesizing',
    label: 'Evidence-backed Brains ready',
    completed: proposals.length,
    total: proposals.length,
  })
  onProgress({ step: 'complete', label: 'Your Agent team is ready', completed: 1, total: 1 })

  return AnalysisResultSchema.parse({
    setupStyle,
    mode: usedOpenAI && usedFallback ? 'mixed' : usedOpenAI ? 'openai' : 'deterministic',
    summaries,
    agents,
    diagnostics,
  })
}
