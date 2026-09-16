import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentEvidence, AgentSuggestion, BrainFile } from '../../shared/schemas'

export type DrawerState = {
  type: 'evidence' | 'brain'
  agent: AgentSuggestion
  returnFocus: HTMLElement
}

const sourceName = { 'claude-code': 'Claude Code', codex: 'Codex' } as const
const fileDescriptions: Record<BrainFile['name'], string> = {
  'README.md': 'Purpose & responsibilities',
  'context.md': 'Durable project context',
  'patterns.md': 'Workflows & preferences',
  'key-decisions.md': 'Decisions & rationale',
  'open-questions.md': 'What still needs an answer',
}

interface MarkdownNode {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
}

// Only turn known conversation IDs in prose into citations. Code and existing
// links are left intact; no HTML is injected into the generated document.
function sourceLinks(evidence: AgentEvidence[]) {
  const sources = [...evidence].sort(
    (first, second) => second.conversationId.length - first.conversationId.length,
  )
  const pattern = sources.length
    ? new RegExp(
        `(?<![\\w-])(?:${sources.map((source) => source.conversationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`,
        'g',
      )
    : null
  return () =>
    (tree: MarkdownNode): void => {
      function visit(node: MarkdownNode): void {
        if (!node.children || ['link', 'linkReference', 'code', 'inlineCode'].includes(node.type))
          return
        node.children = node.children.flatMap((child) => {
          if (child.type !== 'text' || !child.value || !pattern) {
            visit(child)
            return [child]
          }
          const parts: MarkdownNode[] = []
          let cursor = 0
          for (const match of child.value.matchAll(pattern)) {
            const index = match.index
            const sourceIndex = evidence.findIndex((source) => source.conversationId === match[0])
            if (index > cursor)
              parts.push({ type: 'text', value: child.value.slice(cursor, index) })
            parts.push({
              type: 'link',
              url: `#source-${sourceIndex + 1}`,
              children: [{ type: 'text', value: `Source ${sourceIndex + 1}` }],
            })
            cursor = index + match[0].length
          }
          if (cursor < child.value.length)
            parts.push({ type: 'text', value: child.value.slice(cursor) })
          return parts.length ? parts : [child]
        })
      }
      visit(tree)
    }
}

export function MarkdownPreview({
  content,
  evidence,
  files,
  onEvidence,
  onFile,
}: {
  content: string
  evidence: AgentEvidence[]
  files: BrainFile[]
  onEvidence: (index: number) => void
  onFile: (name: string) => void
}): React.JSX.Element {
  return (
    <div className="markdown-preview">
      <Markdown
        remarkPlugins={[remarkGfm, sourceLinks(evidence)]}
        skipHtml
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          a: ({ href, children }) => {
            const source = href?.match(/^#source-(\d+)$/)
            const sourceIndex = source ? Number(source[1]) - 1 : -1
            if (evidence[sourceIndex]) {
              return (
                <button
                  className="citation-link"
                  title={evidence[sourceIndex].title}
                  onClick={() => onEvidence(sourceIndex)}
                >
                  {children}
                </button>
              )
            }
            const fileName = href?.replace(/^\.\//, '').split('#')[0]
            if (files.some((file) => file.name === fileName)) {
              return (
                <button className="document-link" onClick={() => onFile(fileName!)}>
                  {children}
                </button>
              )
            }
            // Generated Markdown cannot navigate the privileged desktop window,
            // execute a URL, open local files, or load a tracking image.
            if (href?.startsWith('https://')) {
              return (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                  <span className="sr-only"> (opens in browser)</span>
                </a>
              )
            }
            return <span>{children}</span>
          },
          img: ({ alt }) => (
            <span className="image-placeholder">{alt || 'Image omitted from preview'}</span>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}

export default function ReviewDrawer({
  drawer,
  onClose,
}: {
  drawer: DrawerState
  onClose: () => void
}): React.JSX.Element {
  const [view, setView] = useState(drawer.type)
  const [activeFile, setActiveFile] = useState('README.md')
  const [selectedSource, setSelectedSource] = useState<number | null>(null)
  const dialog = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const { returnFocus } = drawer

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key !== 'Tab') return
      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex="0"]',
      )
      const first = focusable?.[0]
      const last = focusable?.[focusable.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      returnFocus.focus()
    }
  }, [onClose, returnFocus])

  useEffect(() => {
    if (view === 'evidence' && selectedSource !== null) {
      const source = document.getElementById(`source-${selectedSource + 1}`)
      source?.scrollIntoView?.({ block: 'nearest' })
      source?.focus()
    }
  }, [selectedSource, view])

  const selectedFile =
    drawer.agent.brainFiles.find((file) => file.name === activeFile) ?? drawer.agent.brainFiles[0]
  function showEvidence(index: number | null = null): void {
    setSelectedSource(index)
    setView('evidence')
  }

  return (
    <div className="drawer-layer">
      <button className="drawer-scrim" tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <aside
        ref={dialog}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={view === 'evidence' ? 'Agent evidence' : 'Brain preview'}
      >
        <div className="drawer-header">
          <div>
            <p className="kicker">{view === 'evidence' ? 'SOURCE EVIDENCE' : 'BRAIN PREVIEW'}</p>
            <h2>{drawer.agent.name}</h2>
          </div>
          <button
            ref={closeButton}
            className="icon-button"
            aria-label="Close inspector"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <nav className="inspector-switcher" aria-label="Inspect Agent">
          <button aria-pressed={view === 'brain'} onClick={() => setView('brain')}>
            Brain files <span>{drawer.agent.brainFiles.length}</span>
          </button>
          <button aria-pressed={view === 'evidence'} onClick={() => showEvidence()}>
            Source evidence <span>{drawer.agent.evidence.length}</span>
          </button>
        </nav>
        {view === 'evidence' ? (
          <div className="evidence-list">
            <p className="inspector-note">
              These excerpts are the source material for this Agent. They provide context for the
              synthesis; they are not a verification of every claim.
            </p>
            {drawer.agent.evidence.map((evidence, index) => (
              <article
                id={`source-${index + 1}`}
                tabIndex={-1}
                className={`evidence-item ${selectedSource === index ? 'evidence-item--selected' : ''}`}
                key={evidence.conversationId}
                aria-label={`Source ${index + 1}: ${evidence.title}`}
              >
                <div className="evidence-meta">
                  <span>
                    Source {index + 1} · {sourceName[evidence.provider]}
                  </span>
                  <span>
                    {evidence.timestamp
                      ? new Date(evidence.timestamp).toLocaleDateString()
                      : 'Date unavailable'}
                  </span>
                </div>
                <h3>{evidence.title}</h3>
                <blockquote>“{evidence.excerpt}”</blockquote>
                <code>{evidence.conversationId}</code>
              </article>
            ))}
          </div>
        ) : (
          <>
            <div className="provenance-note">
              <div>
                <strong>Built from your conversations</strong>
                <p>
                  Follow a source citation to inspect its excerpt. Review the synthesis before
                  creating files.
                </p>
              </div>
              <button className="text-button" onClick={() => showEvidence()}>
                View sources <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="brain-browser">
              <nav className="file-tree" aria-label="Brain files">
                {drawer.agent.brainFiles.map((file) => (
                  <button
                    aria-current={file.name === selectedFile?.name ? 'page' : undefined}
                    className={file.name === selectedFile?.name ? 'active' : ''}
                    key={file.name}
                    onClick={() => setActiveFile(file.name)}
                  >
                    {file.name}
                    <span>{fileDescriptions[file.name]}</span>
                  </button>
                ))}
              </nav>
              {selectedFile && (
                <section className="brain-document" aria-label={`Preview of ${selectedFile.name}`}>
                  <MarkdownPreview
                    content={selectedFile.content}
                    evidence={drawer.agent.evidence}
                    files={drawer.agent.brainFiles}
                    onEvidence={showEvidence}
                    onFile={setActiveFile}
                  />
                </section>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
