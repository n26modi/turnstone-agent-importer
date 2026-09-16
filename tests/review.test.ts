import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeConversations } from '../src/main/intelligence/pipeline'
import { mergeAgentSuggestions } from '../src/main/intelligence/review'
import { sampleImportResult } from '../src/main/sample'

afterEach(() => vi.unstubAllEnvs())

describe('Agent review operations', () => {
  it('merges evidence and regenerates a complete Brain locally when needed', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const imported = sampleImportResult()
    const analysis = await analyzeConversations(imported.conversations, 'review', undefined, {
      model: null,
    })
    const [first, second] = analysis.agents
    expect(first).toBeDefined()
    expect(second).toBeDefined()

    const merged = await mergeAgentSuggestions(first!, second!, analysis, imported.conversations)

    expect(merged.mode).toBe('deterministic')
    expect(merged.agent.conversationIds).toEqual(
      expect.arrayContaining([...first!.conversationIds, ...second!.conversationIds]),
    )
    expect(merged.agent.brainFiles).toHaveLength(5)
    expect(new Set(merged.agent.brainFiles.map((file) => file.name)).size).toBe(5)
  })

  it('keeps a sample merge local even when an API key exists', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fake-test-key')
    const imported = sampleImportResult()
    const analysis = await analyzeConversations(imported.conversations, 'review', undefined, {
      model: null,
    })
    const merged = await mergeAgentSuggestions(
      analysis.agents[0]!,
      analysis.agents[1]!,
      analysis,
      imported.conversations,
      { model: null },
    )
    expect(merged.mode).toBe('deterministic')
    expect(merged.agent.brainFiles).toHaveLength(5)
  })
})
