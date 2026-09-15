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

const creationPlan = {
  destination: '/example/Turnstone/Agents',
  agents: [
    {
      agentId: 'agent-1',
      name: 'Importer Agent',
      folderName: 'Importer-Agent',
      path: '/example/Turnstone/Agents/Importer-Agent',
      files: analyzed.agents[0]!.brainFiles.map((file) => file.name),
      collisionResolved: false,
    },
  ],
}

const manifest = {
  destination: creationPlan.destination,
  agents: [
    {
      agentId: 'agent-1',
      folderName: 'Importer-Agent',
      path: '/example/Turnstone/Agents/Importer-Agent',
      files: creationPlan.agents[0]!.files.map((file) => `${creationPlan.agents[0]!.path}/${file}`),
      status: 'created' as const,
      error: null,
    },
  ],
}

describe('App discovery and analysis flow', () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.turnstone = {
      scanHistories: vi.fn().mockResolvedValue(imported),
      loadSampleHistories: vi.fn().mockResolvedValue(imported),
      analyzeHistories: vi
        .fn()
        .mockImplementation(async (setupStyle) => ({ ...analyzed, setupStyle })),
      onAnalysisProgress: vi.fn().mockReturnValue(() => undefined),
      mergeAgents: vi.fn(),
      chooseDestination: vi.fn().mockResolvedValue('/example/Turnstone/Agents'),
      planCreation: vi.fn().mockResolvedValue(creationPlan),
      createAgents: vi.fn().mockResolvedValue(manifest),
      revealAgents: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByRole('button', { name: 'Brain preview' })).toBeInTheDocument()
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

  it('supports rename, evidence inspection, dismiss, and undo in review mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Let me review/ }))

    const name = await screen.findByRole('textbox', { name: 'Rename Importer Agent' })
    await user.clear(name)
    await user.type(name, 'Trusted Import Agent{Enter}')
    expect(screen.getByRole('button', { name: 'Review 1 Agent' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Evidence' }))
    expect(screen.getByRole('complementary', { name: 'Agent evidence' })).toBeInTheDocument()
    expect(screen.getByText('Build the importer')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Close inspector' })[0]!)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByText('Trusted Import Agent dismissed.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('textbox', { name: 'Rename Trusted Import Agent' })).toBeInTheDocument()
  })

  it('confirms the exact manifest, creates folders, and reveals the result', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Set it up for me/ }))
    await user.click(await screen.findByRole('button', { name: 'Review 1 Agent' }))

    expect(await screen.findByText('READY TO CREATE')).toBeInTheDocument()
    expect(screen.getByText('/example/Turnstone/Agents')).toBeInTheDocument()
    expect(screen.getByText('Importer-Agent')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create Agent folders' }))
    expect(await screen.findByText('YOUR TEAM IS READY')).toBeInTheDocument()
    expect(window.turnstone.createAgents).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Reveal in Finder' }))
    expect(window.turnstone.revealAgents).toHaveBeenCalledOnce()
  })
})
