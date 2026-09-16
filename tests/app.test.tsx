// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
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
        {
          name: 'README.md',
          content:
            '# Importer Agent\n\nUse **reviewed context** from conversation-1.\n\n## Sources\n- conversation-1',
        },
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

  it('offers sample data when no local conversations are found', async () => {
    const user = userEvent.setup()
    vi.mocked(window.turnstone.scanHistories).mockResolvedValueOnce({
      sources: imported.sources.map((source) => ({
        ...source,
        status: 'empty',
        conversationCount: 0,
      })),
      conversations: [],
      diagnostics: [],
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))
    await user.click(
      await screen.findByRole('button', { name: 'Try the complete flow with sample data' }),
    )

    expect(await screen.findByText('1 conversation')).toBeInTheDocument()
    expect(window.turnstone.loadSampleHistories).toHaveBeenCalledOnce()
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
    expect(screen.getByRole('dialog', { name: 'Agent evidence' })).toBeInTheDocument()
    expect(screen.getByText('Build the importer')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Close inspector' })[0]!)

    await user.click(screen.getByRole('button', { name: 'More actions for Trusted Import Agent' }))
    await user.click(screen.getByRole('menuitem', { name: 'Dismiss' }))
    expect(screen.getByText('Trusted Import Agent dismissed.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('textbox', { name: 'Rename Trusted Import Agent' })).toBeInTheDocument()
  })

  it('closes an inspector with Escape', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Set it up for me/ }))
    await user.click(await screen.findByRole('button', { name: 'Brain preview' }))
    expect(screen.getByRole('dialog', { name: 'Brain preview' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Brain preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Brain preview' })).toHaveFocus()
  })

  it('shows the full journey and keeps keyboard focus inside the inspector', async () => {
    const user = userEvent.setup()
    render(<App />)
    const progress = screen.getByRole('navigation', { name: 'Setup progress' })
    expect(within(progress).getAllByRole('listitem')).toHaveLength(5)
    expect(within(progress).getByText('Import').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(within(progress).getByText('Setup').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByText(/Sample conversations are analyzed locally/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Set it up for me/ }))
    expect(within(progress).getByText('Review').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.click(screen.getByRole('button', { name: 'Brain preview' }))
    const close = screen.getByRole('button', { name: 'Close inspector' })
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(close)
    await user.tab()
    expect(close).toHaveFocus()
    await user.click(screen.getAllByRole('button', { name: 'Source 1' })[0]!)
    expect(screen.getByRole('dialog', { name: 'Agent evidence' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Source 1: Build the importer' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Brain files 5' }))
    expect(screen.getByText('reviewed context').tagName).toBe('STRONG')
  })

  it('supports keyboard overflow actions and rejects blank renames', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Let me review/ }))
    const name = screen.getByRole('textbox', { name: 'Rename Importer Agent' })
    await user.clear(name)
    await user.keyboard('{Enter}')
    expect(name).toHaveValue('Importer Agent')
    await user.clear(name)
    await user.type(name, 'Cost $& Agent{Enter}')
    await user.click(screen.getByRole('button', { name: 'Brain preview' }))
    expect(screen.getAllByRole('heading', { name: 'Cost $& Agent' })).toHaveLength(2)
    await user.keyboard('{Escape}')
    const more = screen.getByRole('button', { name: 'More actions for Cost $& Agent' })
    more.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Dismiss' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'Merge with another Agent' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(more).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps Agent edits disabled during a merge and announces the result', async () => {
    const user = userEvent.setup()
    const first = analyzed.agents[0]!
    const second = { ...first, id: 'agent-2', name: 'Second Agent' }
    vi.mocked(window.turnstone.analyzeHistories).mockResolvedValueOnce({
      ...analyzed,
      setupStyle: 'review',
      agents: [first, second],
    })
    let finishMerge!: (value: { agent: typeof first; mode: 'deterministic' }) => void
    vi.mocked(window.turnstone.mergeAgents).mockReturnValueOnce(
      new Promise((resolve) => {
        finishMerge = resolve
      }),
    )
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Let me review/ }))
    await user.click(screen.getByRole('button', { name: 'More actions for Importer Agent' }))
    await user.click(screen.getByRole('menuitem', { name: 'Merge with another Agent' }))
    await user.click(screen.getByRole('button', { name: 'Combine' }))
    expect(screen.getByRole('textbox', { name: 'Rename Second Agent' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'More actions for Second Agent' })).toBeDisabled()
    await act(async () =>
      finishMerge({
        agent: { ...first, name: 'Combined Agent', id: 'combined' },
        mode: 'deterministic',
      }),
    )
    expect(screen.getByRole('textbox', { name: 'Rename Combined Agent' })).toBeEnabled()
    expect(screen.getByText(/Importer Agent and Second Agent merged/)).toBeInTheDocument()
  })

  it('handles destination-picker failures and invalidates a failed replacement plan', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Set it up for me/ }))
    await user.click(await screen.findByRole('button', { name: 'Review 1 Agent' }))
    vi.mocked(window.turnstone.chooseDestination).mockRejectedValueOnce(
      new Error('picker unavailable'),
    )
    await user.click(screen.getByRole('button', { name: 'Change destination' }))
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t use that destination.')
    expect(screen.getByRole('button', { name: 'Create Agent folders' })).toBeEnabled()
    vi.mocked(window.turnstone.planCreation).mockRejectedValueOnce(new Error('permission denied'))
    await user.click(screen.getByRole('button', { name: 'Change destination' }))
    expect(screen.getByRole('button', { name: 'Create Agent folders' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to Agents' })).toBeEnabled()
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

  it('reports a safe partial creation result and can start over', async () => {
    const user = userEvent.setup()
    vi.mocked(window.turnstone.createAgents).mockResolvedValueOnce({
      destination: creationPlan.destination,
      agents: [
        {
          agentId: 'agent-1',
          folderName: 'Importer-Agent',
          path: creationPlan.agents[0]!.path,
          files: [],
          status: 'error',
          error: 'The destination changed; review the folder plan again.',
        },
      ],
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Set it up for me/ }))
    await user.click(await screen.findByRole('button', { name: 'Review 1 Agent' }))
    await user.click(await screen.findByRole('button', { name: 'Create Agent folders' }))

    expect(await screen.findByText('No folders were created')).toBeInTheDocument()
    expect(screen.getByText('Your existing files are untouched.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(screen.getByRole('button', { name: 'Import from this Mac' })).toBeInTheDocument()
  })

  it('retries only failed folders and preserves earlier successes in the final result', async () => {
    const user = userEvent.setup()
    const first = analyzed.agents[0]!
    const second = { ...first, id: 'agent-2', name: 'Second Agent' }
    const secondPlan = {
      ...creationPlan.agents[0]!,
      agentId: second.id,
      name: second.name,
      folderName: 'Second-Agent',
      path: '/example/Turnstone/Agents/Second-Agent',
    }
    vi.mocked(window.turnstone.analyzeHistories).mockResolvedValueOnce({
      ...analyzed,
      agents: [first, second],
    })
    vi.mocked(window.turnstone.planCreation)
      .mockResolvedValueOnce({ ...creationPlan, agents: [...creationPlan.agents, secondPlan] })
      .mockResolvedValueOnce({ ...creationPlan, agents: [secondPlan] })
    vi.mocked(window.turnstone.createAgents)
      .mockResolvedValueOnce({
        ...manifest,
        agents: [
          ...manifest.agents,
          {
            agentId: second.id,
            folderName: secondPlan.folderName,
            path: secondPlan.path,
            files: [],
            status: 'error',
            error: 'Destination changed.',
          },
        ],
      })
      .mockResolvedValueOnce({
        ...manifest,
        agents: [
          {
            ...manifest.agents[0]!,
            agentId: second.id,
            folderName: secondPlan.folderName,
            path: secondPlan.path,
          },
        ],
      })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Set it up for me/ }))
    await user.click(screen.getByRole('button', { name: 'Review 2 Agents' }))
    await user.click(screen.getByRole('button', { name: 'Create Agent folders' }))
    await user.click(screen.getByRole('button', { name: 'Review folder plan' }))
    expect(window.turnstone.planCreation).toHaveBeenLastCalledWith([second])
    await user.click(screen.getByRole('button', { name: 'Create Agent folders' }))
    expect(screen.getByRole('heading', { name: /Created 2 Agent/ })).toBeInTheDocument()
    expect(screen.getByText('Importer-Agent')).toBeInTheDocument()
    expect(screen.getByText('Second-Agent')).toBeInTheDocument()
  })
})
