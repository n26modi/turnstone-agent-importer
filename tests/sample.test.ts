import { describe, expect, it } from 'vitest'
import { deterministicSummary } from '../src/main/intelligence/fallback'
import { analyzeConversations } from '../src/main/intelligence/pipeline'
import { prepareConversation } from '../src/main/intelligence/preparation'
import { sampleImportResult } from '../src/main/sample'

describe('local sample experience', () => {
  it('prepares a specific, readable team with useful content and citations in every Brain file', async () => {
    const imported = sampleImportResult()
    const result = await analyzeConversations(imported.conversations, 'review', undefined, {
      model: null,
    })

    expect(result.mode).toBe('deterministic')
    expect(result.agents.map((agent) => agent.name)).toEqual([
      'Turnstone Onboarding Agent',
      'AquaShield Simulation Agent',
      'Memory Research Agent',
    ])
    expect(result.agents[1]?.purpose).toBe(
      'Generate reproducible pressure and flow datasets for testing water-network leak detection.',
    )
    for (const agent of result.agents) {
      expect(agent.brainFiles).toHaveLength(5)
      expect(agent.purpose).not.toMatch(/^Keep the context/)
      for (const file of agent.brainFiles) {
        expect(file.content).not.toContain('Nothing durable identified yet.')
        const claims = file.content
          .split('## Sources')[0]!
          .split('\n')
          .filter((line) => line.startsWith('- '))
        expect(claims.length).toBeGreaterThan(0)
        for (const claim of claims) {
          expect(agent.conversationIds.some((id) => claim.endsWith(`(${id})`))).toBe(true)
        }
      }
    }
  })

  it('extracts the matching source sentence and keeps questions out of facts and decisions', () => {
    const prepared = prepareConversation(sampleImportResult().conversations[2]!)
    const summary = deterministicSummary(prepared)
    expect(summary.durableFacts).toContain(
      'AquaShield is a hydraulic simulation project that generates synthetic pressure and flow readings.',
    )
    expect(summary.decisions).toContain(
      'We decided to seed randomness so leak simulations can be repeated exactly.',
    )
    expect(summary.unresolvedQuestions).toContain(
      'Which leak sizes and sensor locations should the first benchmark cover?',
    )
    expect([...summary.durableFacts, ...summary.decisions].some((item) => item.endsWith('?'))).toBe(
      false,
    )
    expect(summary.toolsAndWorkflows.every((item) => item.includes(' '))).toBe(true)
  })

  it('uses the same evidence-backed sample team for both setup styles', async () => {
    const imported = sampleImportResult()
    const automatic = await analyzeConversations(imported.conversations, 'automatic', undefined, {
      model: null,
    })
    const review = await analyzeConversations(imported.conversations, 'review', undefined, {
      model: null,
    })
    expect(automatic.agents).toEqual(review.agents)
    expect(automatic.setupStyle).toBe('automatic')
    expect(review.setupStyle).toBe('review')
  })
})
