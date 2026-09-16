// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from '../src/renderer/src/ReviewDrawer'
import type { AgentEvidence, BrainFile } from '../src/shared/schemas'

afterEach(cleanup)

const evidence: AgentEvidence[] = [
  {
    conversationId: 'session-abc',
    title: 'Design discussion',
    provider: 'codex',
    timestamp: null,
    excerpt: 'Use a local folder.',
  },
]
const files: BrainFile[] = [{ name: 'context.md', content: '# Context' }]

describe('Brain Markdown preview', () => {
  it('renders structured Markdown and connects prose citations and local file links', async () => {
    const user = userEvent.setup()
    const onEvidence = vi.fn()
    const onFile = vi.fn()
    render(
      <MarkdownPreview
        evidence={evidence}
        files={files}
        onEvidence={onEvidence}
        onFile={onFile}
        content={
          '# Brain\n\n**Durable** and *reviewed*. See session-abc.\n\n- First item\n- Second item\n\n1. Review\n2. Create\n\n> A source-backed decision.\n\n```ts\nconst source = "session-abc"\n```\n\n| File | Role |\n| --- | --- |\n| context.md | Context |\n\n[Context](./context.md) and [Reference](https://example.com/docs)'
        }
      />,
    )
    expect(screen.getByRole('heading', { name: 'Brain' })).toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Durable').tagName).toBe('STRONG')
    expect(screen.getByText('const source = "session-abc"').closest('pre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Source 1' }))
    expect(onEvidence).toHaveBeenCalledWith(0)
    await user.click(screen.getByRole('button', { name: 'Context' }))
    expect(onFile).toHaveBeenCalledWith('context.md')
    expect(screen.getByRole('link', { name: /Reference/ })).toHaveAttribute('target', '_blank')
  })

  it('does not load images, render raw HTML, or expose unsafe links', () => {
    const { container } = render(
      <MarkdownPreview
        evidence={evidence}
        files={files}
        onEvidence={vi.fn()}
        onFile={vi.fn()}
        content={
          '<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel">\n\n![Tracking pixel](https://tracker.example/image)\n\n[Unsafe](javascript:alert%281%29) [Local](file:///private/secret) [Relative](../../private/secret)'
        }
      />,
    )
    expect(container.querySelector('script, img')).toBeNull()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Tracking pixel')).toBeInTheDocument()
  })
})
