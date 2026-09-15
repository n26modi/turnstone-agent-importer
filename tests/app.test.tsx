// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'
import type { AnalysisResult, ImportResult } from '../src/shared/schemas'

const imported: ImportResult = {
  sources: [
    {
      provider: 'claude-code',
      path: '/example/.claude/projects',
      status: 'found',
      conversationCount: 1,
      diagnostics: [],
    },
    {
      provider: 'codex',
      path: '/example/.codex/sessions',
      status: 'empty',
      conversationCount: 0,
      diagnostics: [],
    },
  ],
  conversations: [
    {
      id: 'conversation-1',
      provider: 'claude-code',
      title: 'Build the importer',
      sourcePath: '/example/session.jsonl',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: [{ type: 'text', text: 'Build a trustworthy importer.' }],
          sourceReferences: [{ provider: 'claude-code', conversationId: 'conversation-1' }],
        },
      ],
      metadata: {},
    },
  ],
  diagnostics: [],
}

const analyzed: AnalysisResult = {
  setupStyle: 'automatic',
  mode: 'deterministic',
  summaries: [],
  agents: [
    {
      id: 'agent-1',
      name: 'Importer Agent',
      purpose: 'Keep the importer product context and decisions.',
      topics: ['electron', 'import'],
      confidence: 'Focused project',
      conversationIds: ['conversation-1'],
      evidence: [
        {
          conversationId: 'conversation-1',
          title: 'Build the importer',
          provider: 'claude-code',
          timestamp: null,
          excerpt: 'Build a trustworthy importer.',
        },
      ],
      brainFiles: [
        { name: 'README.md', content: '# Importer Agent' },
        { name: 'context.md', content: '# Context' },
        { name: 'patterns.md', content: '# Patterns' },
        { name: 'key-decisions.md', content: '# Decisions' },
        { name: 'open-questions.md', content: '# Questions' },
      ],
    },
  ],
  diagnostics: [],
}

describe('App discovery and analysis flow', () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.turnstone = {
      scanHistories: vi.fn().mockResolvedValue(imported),
      loadSampleHistories: vi.fn().mockResolvedValue(imported),
      analyzeHistories: vi.fn().mockResolvedValue(analyzed),
      onAnalysisProgress: vi.fn().mockReturnValue(() => undefined),
    }
  })

  it('scans only after the user explicitly starts the import', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(window.turnstone.scanHistories).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))

    expect(await screen.findByText('IMPORT COMPLETE')).toBeInTheDocument()
    expect(window.turnstone.scanHistories).toHaveBeenCalledOnce()
    expect(screen.getByText('1 conversation')).toBeInTheDocument()
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  it('continues through setup choice and presents Agent suggestions', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(screen.getByText('CHOOSE YOUR SETUP')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Set it up for me/ }))

    expect(await screen.findByText('YOUR PROPOSED TEAM')).toBeInTheDocument()
    expect(window.turnstone.analyzeHistories).toHaveBeenCalledWith('automatic')
    expect(screen.getByRole('heading', { name: 'Importer Agent' })).toBeInTheDocument()
    expect(screen.getByText('5 Brain files prepared')).toBeInTheDocument()
  })

  it('can enter the flow with bundled sample data', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Try with sample data' }))

    expect(await screen.findByText('IMPORT COMPLETE')).toBeInTheDocument()
    expect(window.turnstone.loadSampleHistories).toHaveBeenCalledOnce()
    expect(window.turnstone.scanHistories).not.toHaveBeenCalled()
  })

  it('preserves the collaborative setup choice for analysis', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Let me review/ }))

    expect(await screen.findByText('YOUR PROPOSED TEAM')).toBeInTheDocument()
    expect(window.turnstone.analyzeHistories).toHaveBeenCalledWith('review')
  })
})
