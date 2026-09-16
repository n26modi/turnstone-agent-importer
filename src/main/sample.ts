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
    project: 'Turnstone Onboarding',
    title: 'Design a trustworthy local import flow',
    date: '2026-09-08T14:00:00.000Z',
    user: [
      'Design an onboarding flow that turns local coding histories into a useful team of Agents.',
      'Keep the import effortless while letting people inspect evidence before creating Brain files.',
      'I prefer explicit consent before scanning and a calm, editorial interface.',
      'We decided to keep filesystem access in Electron main and expose only a narrow IPC bridge.',
      'How should onboarding explain a partially readable history?',
    ].join(' '),
    assistant: [
      'Turnstone uses Electron, React, and TypeScript for macOS-first onboarding.',
      'The import workflow checks Claude Code and Codex separately and preserves readable conversations.',
      'Review source counts before analysis, then inspect proposed Agents and their evidence before writing Brain files.',
    ].join(' '),
  },
  {
    id: 'sample-turnstone-brains',
    provider: 'codex',
    project: 'Turnstone Onboarding',
    title: 'Define evidence-backed Agent Brains',
    date: '2026-09-10T16:00:00.000Z',
    user: [
      'Prepare focused Brain files that let an Agent pick up a project without rereading the original conversations.',
      'Connect significant claims to their source evidence and separate unresolved questions from settled decisions.',
      'I prefer concise Markdown over transcript dumps.',
      'We decided that existing Agent folders must never be overwritten; show a suffixed name before creation.',
      'How much source context should the Brain preview show alongside each citation?',
    ].join(' '),
    assistant: [
      'Each Agent has five Brain files: README.md, context.md, patterns.md, key-decisions.md, and open-questions.md.',
      'The Brain review workflow follows a claim to its source evidence before keeping it.',
      'Use the folder manifest to confirm the destination, Agent names, and all five files before creation.',
    ].join(' '),
  },
  {
    id: 'sample-aquashield-model',
    provider: 'claude-code',
    project: 'AquaShield Simulation',
    title: 'Generate reproducible hydraulic sensor data',
    date: '2026-08-22T11:30:00.000Z',
    user: [
      'Generate reproducible pressure and flow datasets for testing water-network leak detection.',
      'Compare normal demand with leak scenarios and flag invalid simulation results before exporting a dataset.',
      'I prefer explicit units and a saved configuration for every simulation.',
      'We decided to seed randomness so leak simulations can be repeated exactly.',
      'Which leak sizes and sensor locations should the first benchmark cover?',
    ].join(' '),
    assistant: [
      'AquaShield is a hydraulic simulation project that generates synthetic pressure and flow readings.',
      'The simulation pipeline separates network construction, demand profiles, leak injection, and dataset storage.',
      'Validate pressure and flow units before each simulation, then save its seed and configuration with the dataset.',
    ].join(' '),
  },
  {
    id: 'sample-research-workflow',
    provider: 'codex',
    project: 'Memory Research',
    title: 'Evaluate multi-agent memory quality',
    date: '2026-09-02T09:15:00.000Z',
    user: [
      'Evaluate memory backends for retrieval quality and their ability to retire stale facts.',
      'Turn memory evaluation results into evidence-backed comparisons and reproducible charts.',
      'I prefer inspecting raw retrieval results before trusting an aggregate score.',
      'We decided to use a fixed query set and separate researcher and critic roles for memory evaluation.',
      'How should the benchmark weight stale answers against missing answers?',
    ].join(' '),
    assistant: [
      'The memory benchmark uses retrieval quality, temporal invalidation, and stale-fact failures as evaluation dimensions.',
      'The evaluation workflow runs the same queries against every memory backend and preserves raw retrieval results.',
      'Compare retrieval scores with stale-memory failures, then review disagreements before publishing charts.',
    ].join(' '),
  },
]

function conversation(sample: SampleConversation): NormalizedConversation {
  const updatedAt = new Date(Date.parse(sample.date) + 60_000).toISOString()
  return {
    id: sample.id,
    provider: sample.provider,
    title: sample.title,
    project: sample.project,
    cwd: `/sample/${sample.project.toLowerCase().replace(/\s+/g, '-')}`,
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
