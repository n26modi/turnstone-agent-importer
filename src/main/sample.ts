import { ImportResultSchema, type NormalizedConversation, type Provider } from '../shared/schemas'

interface SampleConversation {
  id: string
  provider: Provider
  project: string
  title: string
  date: string
  user: string
  assistant: string
}

const samples: SampleConversation[] = [
  {
    id: 'sample-turnstone-discovery',
    provider: 'claude-code',
    project: 'turnstone-agent-importer',
    title: 'Design a trustworthy local import flow',
    date: '2026-09-08T14:00:00.000Z',
    user: 'Design a macOS onboarding flow that scans Claude Code and Codex only after an explicit click. Prefer calm editorial UI and visible evidence.',
    assistant:
      'The importer should keep filesystem access in Electron main, expose narrow typed IPC, and show source-level diagnostics without overwhelming the user.',
  },
  {
    id: 'sample-turnstone-brains',
    provider: 'codex',
    project: 'turnstone-agent-importer',
    title: 'Define evidence-backed Agent Brains',
    date: '2026-09-10T16:00:00.000Z',
    user: 'Create five concise Brain files with provenance. Do not dump transcripts, invent facts, or silently overwrite existing Agent folders.',
    assistant:
      'Use README, context, patterns, key decisions, and open questions. Significant claims should cite the source conversation ID.',
  },
  {
    id: 'sample-aquashield-model',
    provider: 'claude-code',
    project: 'aquashield-hydraulic-model',
    title: 'Generate reproducible hydraulic sensor data',
    date: '2026-08-22T11:30:00.000Z',
    user: 'Build a reproducible pipeline for synthetic pressure and flow readings with leak scenarios. Keep units explicit and validate generated datasets.',
    assistant:
      'Separate network construction, demand profiles, leak injection, simulation, and storage. Seed randomness and test unit conversions.',
  },
  {
    id: 'sample-research-workflow',
    provider: 'codex',
    project: 'multi-agent-memory-eval',
    title: 'Evaluate multi-agent memory quality',
    date: '2026-09-02T09:15:00.000Z',
    user: 'Compare memory backends on retrieval quality, temporal invalidation, and stale facts. I want evidence-backed conclusions and reproducible charts.',
    assistant:
      'Use a fixed query set, separate researcher and critic roles, track stale-memory failures, and preserve raw evaluation results for auditability.',
  },
]

function conversation(sample: SampleConversation): NormalizedConversation {
  const updatedAt = new Date(Date.parse(sample.date) + 60_000).toISOString()
  return {
    id: sample.id,
    provider: sample.provider,
    title: sample.title,
    project: sample.project,
    cwd: `/sample/${sample.project}`,
    sourcePath: `sample://${sample.id}`,
    startedAt: sample.date,
    updatedAt,
    metadata: { sample: 'true' },
    messages: [
      {
        id: `${sample.id}-user`,
        role: 'user',
        content: [{ type: 'text', text: sample.user }],
        timestamp: sample.date,
        sourceReferences: [
          {
            provider: sample.provider,
            conversationId: sample.id,
            recordId: `${sample.id}-user`,
            timestamp: sample.date,
          },
        ],
      },
      {
        id: `${sample.id}-assistant`,
        role: 'assistant',
        content: [{ type: 'text', text: sample.assistant }],
        timestamp: updatedAt,
        sourceReferences: [
          {
            provider: sample.provider,
            conversationId: sample.id,
            recordId: `${sample.id}-assistant`,
            timestamp: updatedAt,
          },
        ],
      },
    ],
  }
}

export function sampleImportResult() {
  const conversations = samples.map(conversation)
  const byProvider = (provider: Provider) =>
    conversations.filter((item) => item.provider === provider)
  const claude = byProvider('claude-code')
  const codex = byProvider('codex')
  const range = (items: NormalizedConversation[]) => ({
    startedAt: items.flatMap((item) => (item.startedAt ? [item.startedAt] : [])).sort()[0],
    updatedAt: items
      .flatMap((item) => (item.updatedAt ? [item.updatedAt] : []))
      .sort()
      .at(-1),
  })
  return ImportResultSchema.parse({
    sources: [
      {
        provider: 'claude-code',
        path: 'Sample Claude Code history',
        status: 'found',
        conversationCount: claude.length,
        ...range(claude),
        diagnostics: [],
      },
      {
        provider: 'codex',
        path: 'Sample Codex history',
        status: 'found',
        conversationCount: codex.length,
        ...range(codex),
        diagnostics: [],
      },
    ],
    conversations,
    diagnostics: [],
  })
}
