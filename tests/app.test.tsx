// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'

describe('App discovery shell', () => {
  beforeEach(() => {
    window.turnstone = {
      scanHistories: vi.fn().mockResolvedValue({
        sources: [
          {
            provider: 'claude-code',
            path: '/example/.claude/projects',
            status: 'found',
            conversationCount: 4,
            diagnostics: [],
          },
          {
            provider: 'codex',
            path: '/example/.codex/sessions',
            status: 'found',
            conversationCount: 2,
            diagnostics: [],
          },
        ],
        conversations: [],
        diagnostics: [],
      }),
    }
  })

  it('scans only after the user explicitly starts the import', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(window.turnstone.scanHistories).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Import from this Mac' }))

    expect(await screen.findByText('Ready to analyze')).toBeInTheDocument()
    expect(window.turnstone.scanHistories).toHaveBeenCalledOnce()
    expect(screen.getByText('4 conversations found')).toBeInTheDocument()
    expect(screen.getByText('2 conversations found')).toBeInTheDocument()
  })
})
