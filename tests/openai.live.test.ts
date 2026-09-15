import { describe, expect, it } from 'vitest'
import { modelFromEnvironment } from '../src/main/intelligence/model'
import { analyzeConversations } from '../src/main/intelligence/pipeline'
import { mergeAgentSuggestions } from '../src/main/intelligence/review'
import { sampleImportResult } from '../src/main/sample'

const runLive = process.env.RUN_OPENAI_LIVE_TEST === '1'

describe.runIf(runLive)('OpenAI live analysis', () => {
  it('analyzes the sample flow with structured Responses API output', async () => {
    const model = modelFromEnvironment()
    expect(model).not.toBeNull()

    const result = await analyzeConversations(
      sampleImportResult().conversations,
      'automatic',
      undefined,
      { model },
    )

    expect(result.mode).toBe('openai')
    expect(result.agents.length).toBeGreaterThanOrEqual(1)
    expect(result.agents.length).toBeLessThanOrEqual(5)
    expect(result.agents.every((agent) => agent.brainFiles.length === 5)).toBe(true)
  }, 180_000)

  it('regenerates a merged Brain with structured output', async () => {
    const imported = sampleImportResult()
    const localAnalysis = await analyzeConversations(
      imported.conversations,
      'review',
      undefined,
      { model: null },
    )
    const [first, second] = localAnalysis.agents
    expect(first).toBeDefined()
    expect(second).toBeDefined()

    const merged = await mergeAgentSuggestions(
      first!,
      second!,
      localAnalysis,
      imported.conversations,
    )

    expect(merged.mode).toBe('openai')
    expect(merged.agent.brainFiles).toHaveLength(5)
  }, 180_000)
})
