import { describe, expect, it, vi } from 'vitest'
import { deterministicSummary } from '../src/main/intelligence/fallback'
import type { IntelligenceModel } from '../src/main/intelligence/model'
import { analyzeConversations } from '../src/main/intelligence/pipeline'
import { prepareConversation, prepareConversations } from '../src/main/intelligence/preparation'
import type {
  BrainFile,
  ConversationSummary,
  NormalizedConversation,
  PreparedConversation,
} from '../src/shared/schemas'

function conversation(id: string, project = 'turnstone'): NormalizedConversation {
  return {
    id,
    provider: 'codex',
    title: `Conversation ${id}`,
    project,
    sourcePath: `/sessions/${id}.jsonl`,
    metadata: {},
    messages: [
      {
        id: `${id}-user`,
        role: 'user',
        content: [
          { type: 'text', text: `Implement the ${project} workflow and decide the next step.` },
        ],
        sourceReferences: [
          { provider: 'codex', conversationId: id, timestamp: '2026-09-15T12:00:00.000Z' },
        ],
      },
      {
        id: `${id}-assistant`,
        role: 'assistant',
        content: [
          { type: 'text', text: `The ${project} workflow uses TypeScript and needs tests.` },
        ],
        sourceReferences: [
          { provider: 'codex', conversationId: id, timestamp: '2026-09-15T12:01:00.000Z' },
        ],
      },
    ],
  }
}

const validBrain: BrainFile[] = [
  { name: 'README.md', content: '# Agent' },
  { name: 'context.md', content: '# Context' },
  { name: 'patterns.md', content: '# Patterns' },
  { name: 'key-decisions.md', content: '# Decisions' },
  { name: 'open-questions.md', content: '# Questions' },
]

describe('conversation preparation', () => {
  it('bounds excerpts, drops generated context, and redacts obvious secrets', () => {
    const input = conversation('bounded')
    input.messages.unshift({
      id: 'generated',
      role: 'user',
      content: [
        { type: 'text', text: '<environment_context>machine details</environment_context>' },
      ],
      sourceReferences: [{ provider: 'codex', conversationId: 'bounded' }],
    })
    input.messages.push({
      id: 'secret',
      role: 'user',
      content: [
        { type: 'text', text: `API_TOKEN=super-secret ${'important decision '.repeat(500)}` },
      ],
      sourceReferences: [{ provider: 'codex', conversationId: 'bounded' }],
    })

    const prepared = prepareConversation(input)
    const serialized = JSON.stringify(prepared)

    expect(serialized).not.toContain('<environment_context>')
    expect(serialized).not.toContain('super-secret')
    expect(
      prepared.excerpts.reduce((total, excerpt) => total + excerpt.text.length, 0),
    ).toBeLessThanOrEqual(6_500)
  })
})

describe('analysis pipeline', () => {
  it('produces complete local suggestions when OpenAI is unavailable', async () => {
    const progress = vi.fn()
    const result = await analyzeConversations([conversation('one')], 'automatic', progress, {
      model: null,
    })

    expect(result.mode).toBe('deterministic')
    expect(result.agents).toHaveLength(1)
    expect(result.agents[0]?.brainFiles.map((file) => file.name)).toEqual([
      'README.md',
      'context.md',
      'patterns.md',
      'key-decisions.md',
      'open-questions.md',
    ])
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'openai-unavailable' })]),
    )
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ step: 'complete' }))
  })

  it('keeps successful model work and recovers a failed summary batch locally', async () => {
    let summaryCalls = 0
    const model: IntelligenceModel = {
      async summarize(batch: PreparedConversation[]): Promise<ConversationSummary[]> {
        summaryCalls += 1
        if (summaryCalls === 2) throw Object.assign(new Error('rate limited'), { status: 429 })
        return batch.map(deterministicSummary)
      },
      async cluster(summaries) {
        return [
          {
            name: 'Turnstone Agent',
            purpose: 'Keep the project context and workflows.',
            topics: ['turnstone'],
            confidence: 'Strong pattern',
            conversationIds: summaries.map((summary) => summary.conversationId),
          },
        ]
      },
      async synthesize() {
        return validBrain
      },
    }
    const inputs = Array.from({ length: 5 }, (_, index) => conversation(String(index + 1)))
    const result = await analyzeConversations(inputs, 'review', undefined, { model })

    expect(result.mode).toBe('mixed')
    expect(result.summaries).toHaveLength(5)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'summary-fallback' })]),
    )
    expect(result.agents[0]?.conversationIds).toHaveLength(5)
  })

  it('rejects malformed Brain output and recovers that Agent locally', async () => {
    const prepared = prepareConversations([conversation('one')])
    const model: IntelligenceModel = {
      async summarize(batch) {
        return batch.map(deterministicSummary)
      },
      async cluster() {
        return [
          {
            name: 'Turnstone Agent',
            purpose: 'Keep project context.',
            topics: ['turnstone'],
            confidence: 'Focused project',
            conversationIds: [prepared[0]!.conversationId],
          },
        ]
      },
      async synthesize() {
        return Array.from({ length: 5 }, () => ({
          name: 'README.md' as const,
          content: '# Duplicate',
        }))
      },
    }

    const result = await analyzeConversations([conversation('one')], 'review', undefined, { model })

    expect(result.mode).toBe('mixed')
    expect(new Set(result.agents[0]?.brainFiles.map((file) => file.name)).size).toBe(5)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'brain-fallback' })]),
    )
  })
})
