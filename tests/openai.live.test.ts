import { describe, expect, it } from 'vitest'
import { modelFromEnvironment } from '../src/main/intelligence/model'
import { analyzeConversations } from '../src/main/intelligence/pipeline'
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
})
