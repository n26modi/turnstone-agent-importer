import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentSuggestion,
  AnalysisProgress,
  AnalysisResult,
  CreationPlan,
  GeneratedOutputManifest,
  ImportResult,
  SetupStyle,
} from '../../shared/schemas'
import templeImage from './assets/temple.png'

type ScreenState =
  | 'ready'
  | 'scanning'
  | 'found'
  | 'setup'
  | 'analyzing'
  | 'suggestions'
  | 'confirming'
  | 'creating'
  | 'complete'
  | 'error'

type DrawerState = { type: 'evidence' | 'brain'; agent: AgentSuggestion } | null

const sourceName = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
} as const

const analysisSteps: Array<{ step: AnalysisProgress['step']; label: string }> = [
  { step: 'preparing', label: 'Reading conversation excerpts' },
  { step: 'summarizing', label: 'Distilling projects and workflows' },
  { step: 'clustering', label: 'Comparing related work' },
  { step: 'synthesizing', label: 'Writing evidence-backed Brains' },
]

const screenLabel: Record<ScreenState, string> = {
  ready: 'Import',
  scanning: 'Import',
  found: 'Import',
  setup: 'Setup',
  analyzing: 'Analysis',
  suggestions: 'Review',
  confirming: 'Confirm',
  creating: 'Create',
  complete: 'Complete',
  error: 'Recovery',
}

function sourceSummary(source: ImportResult['sources'][number]): string {
  if (source.status === 'found') {
    const count = `${source.conversationCount} conversation${source.conversationCount === 1 ? '' : 's'}`
    if (!source.startedAt || !source.updatedAt) return count
    const start = new Date(source.startedAt).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    })
    const end = new Date(source.updatedAt).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    })
    return `${count} · ${start === end ? start : `${start}–${end}`}`
  }
  if (source.status === 'missing') return 'No local history found'
  if (source.status === 'empty') return 'No conversations yet'
  return 'Could not read this source'
}

function renameAgent(agent: AgentSuggestion, name: string): AgentSuggestion {
  const trimmed = name.trim()
  if (!trimmed || trimmed === agent.name) return agent
  return {
    ...agent,
    name: trimmed,
    brainFiles: agent.brainFiles.map((file) =>
      file.name === 'README.md'
        ? { ...file, content: file.content.replace(/^# .+$/m, `# ${trimmed}`) }
        : file,
    ),
  }
}

function MarkdownPreview({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="markdown-preview">
      {content.split('\n').map((line, index) => {
        const key = `${index}-${line.slice(0, 12)}`
        if (line.startsWith('### ')) return <h4 key={key}>{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={key}>{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={key}>{line.slice(2)}</h2>
        if (line.startsWith('- '))
          return (
            <p className="markdown-list" key={key}>
              {line.slice(2)}
            </p>
          )
        if (!line.trim()) return <span className="markdown-space" key={key} />
        return <p key={key}>{line}</p>
      })}
    </div>
  )
}

function ReviewDrawer({
  drawer,
  onClose,
}: {
  drawer: NonNullable<DrawerState>
  onClose: () => void
}): React.JSX.Element {
  const [activeFile, setActiveFile] = useState('README.md')
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [drawer, onClose])
  const selectedFile =
    drawer.agent.brainFiles.find((file) => file.name === activeFile) ?? drawer.agent.brainFiles[0]

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-scrim" aria-label="Close inspector" onClick={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={drawer.type === 'evidence' ? 'Agent evidence' : 'Brain preview'}
      >
        <div className="drawer-header">
          <div>
            <p className="kicker">
              {drawer.type === 'evidence' ? 'SOURCE EVIDENCE' : 'BRAIN PREVIEW'}
            </p>
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
        {drawer.type === 'evidence' ? (
          <div className="evidence-list">
            {drawer.agent.evidence.map((evidence) => (
              <article className="evidence-item" key={evidence.conversationId}>
                <div className="evidence-meta">
                  <span>{sourceName[evidence.provider]}</span>
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
          <div className="brain-browser">
            <nav className="file-tree" aria-label="Brain files">
              {drawer.agent.brainFiles.map((file) => (
                <button
                  className={file.name === selectedFile?.name ? 'active' : ''}
                  key={file.name}
                  onClick={() => setActiveFile(file.name)}
                >
                  {file.name}
                </button>
              ))}
            </nav>
            {selectedFile && <MarkdownPreview content={selectedFile.content} />}
          </div>
        )}
      </aside>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<ScreenState>('ready')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<AgentSuggestion[]>([])
  const [dismissed, setDismissed] = useState<{ agent: AgentSuggestion; index: number } | null>(null)
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string>('')
  const [busyMessage, setBusyMessage] = useState('')
  const [operationError, setOperationError] = useState('')
  const [creationPlan, setCreationPlan] = useState<CreationPlan | null>(null)
  const [manifest, setManifest] = useState<GeneratedOutputManifest | null>(null)
  const closeDrawer = useCallback(() => setDrawer(null), [])

  useEffect(() => window.turnstone?.onAnalysisProgress(setProgress), [])

  function startOver(): void {
    setState('ready')
    setResult(null)
    setAnalysis(null)
    setProgress(null)
    setError('')
    setAgents([])
    setDismissed(null)
    setDrawer(null)
    setMergeSourceId(null)
    setMergeTargetId('')
    setBusyMessage('')
    setOperationError('')
    setCreationPlan(null)
    setManifest(null)
  }

  async function scan(): Promise<void> {
    setState('scanning')
    setError('')
    try {
      const nextResult = await window.turnstone.scanHistories()
      setResult(nextResult)
      setState('found')
    } catch {
      setError('We couldn’t finish the scan. Your files were not changed.')
      setState('error')
    }
  }

  async function loadSample(): Promise<void> {
    setState('scanning')
    setError('')
    try {
      const sampleResult = await window.turnstone.loadSampleHistories()
      setResult(sampleResult)
      setState('found')
    } catch {
      setError('We couldn’t load the sample conversations.')
      setState('error')
    }
  }

  async function analyze(setupStyle: SetupStyle): Promise<void> {
    setState('analyzing')
    setError('')
    setProgress({
      step: 'preparing',
      label: 'Reading conversation excerpts',
      completed: 0,
      total: 1,
    })
    try {
      const nextAnalysis = await window.turnstone.analyzeHistories(setupStyle)
      setAnalysis(nextAnalysis)
      setAgents(nextAnalysis.agents)
      setState('suggestions')
    } catch {
      setError('We couldn’t finish the analysis. Your imported conversations are still ready.')
      setState('error')
    }
  }

  function updateAgentName(agentId: string, name: string): void {
    setAgents((current) =>
      current.map((agent) => (agent.id === agentId ? renameAgent(agent, name) : agent)),
    )
  }

  function dismissAgent(agentId: string): void {
    setAgents((current) => {
      const index = current.findIndex((agent) => agent.id === agentId)
      if (index < 0) return current
      setDismissed({ agent: current[index]!, index })
      return current.filter((agent) => agent.id !== agentId)
    })
    setMergeSourceId(null)
    setOperationError('')
  }

  function undoDismiss(): void {
    if (!dismissed) return
    setAgents((current) => {
      const next = [...current]
      next.splice(Math.min(dismissed.index, next.length), 0, dismissed.agent)
      return next
    })
    setDismissed(null)
  }

  function beginMerge(agentId: string): void {
    const target = agents.find((agent) => agent.id !== agentId)
    setMergeSourceId(agentId)
    setMergeTargetId(target?.id ?? '')
    setOperationError('')
  }

  async function mergeSelectedAgents(): Promise<void> {
    const first = agents.find((agent) => agent.id === mergeSourceId)
    const second = agents.find((agent) => agent.id === mergeTargetId)
    if (!first || !second) return
    setBusyMessage('Regenerating merged Brain…')
    setOperationError('')
    try {
      const merged = await window.turnstone.mergeAgents(first, second)
      const firstIndex = agents.findIndex((agent) => agent.id === first.id)
      const secondIndex = agents.findIndex((agent) => agent.id === second.id)
      setAgents((current) => {
        const next = current.filter((agent) => agent.id !== first.id && agent.id !== second.id)
        next.splice(Math.min(firstIndex, secondIndex), 0, merged.agent)
        return next
      })
      setDismissed(null)
      setMergeSourceId(null)
    } catch {
      setOperationError('We couldn’t merge those Agents. Nothing was changed.')
    } finally {
      setBusyMessage('')
    }
  }

  async function prepareCreation(): Promise<void> {
    if (agents.length === 0) {
      setOperationError('Keep at least one Agent before continuing.')
      return
    }
    setBusyMessage('Checking folder names…')
    setOperationError('')
    try {
      setCreationPlan(await window.turnstone.planCreation(agents))
      setState('confirming')
    } catch {
      setOperationError('We couldn’t prepare the folder plan. No files were written.')
    } finally {
      setBusyMessage('')
    }
  }

  async function changeDestination(): Promise<void> {
    const destination = await window.turnstone.chooseDestination()
    if (!destination) return
    setBusyMessage('Updating folder plan…')
    setOperationError('')
    try {
      setCreationPlan(await window.turnstone.planCreation(agents))
    } catch {
      setOperationError('We couldn’t use that destination. No files were written.')
    } finally {
      setBusyMessage('')
    }
  }

  async function createAgents(): Promise<void> {
    setState('creating')
    setOperationError('')
    try {
      const output = await window.turnstone.createAgents()
      setManifest(output)
      setState('complete')
    } catch {
      setOperationError('We couldn’t create the Agent folders. Review the plan and try again.')
      setState('confirming')
    }
  }

  const activeStep = progress ? analysisSteps.findIndex((item) => item.step === progress.step) : 0

  const wideState = ['suggestions', 'confirming', 'creating', 'complete'].includes(state)
  const createdCount = manifest?.agents.filter((agent) => agent.status === 'created').length ?? 0
  const failedCount = manifest?.agents.filter((agent) => agent.status === 'error').length ?? 0

  return (
    <main className="shell">
      <section className={`canvas canvas--${state}`} aria-labelledby="page-title">
        <header className="app-chrome" aria-label="Application progress">
          <span className="app-wordmark">TURNSTONE</span>
          <span className="app-step">{screenLabel[state]}</span>
        </header>
        <div className="body">
          <div key={state} className={`content ${wideState ? 'content--wide' : ''}`}>
            {state === 'ready' && (
              <>
                <p className="kicker">BUILD YOUR AGENT TEAM</p>
                <h1 id="page-title">
                  Turn your history
                  <span>into a team.</span>
                </h1>
                <p className="lede">
                  We’ll find the projects and workflows in your Claude Code and Codex history that
                  deserve a dedicated Agent.
                </p>
                <button className="primary" onClick={scan}>
                  Import from this Mac
                </button>
                <button className="text-button sample-button" onClick={() => void loadSample()}>
                  Try with sample data
                </button>
                <div className="source-line" aria-label="Supported sources">
                  <span>Claude Code</span>
                  <span className="source-divider" aria-hidden="true" />
                  <span>Codex</span>
                </div>
              </>
            )}

            {state === 'scanning' && (
              <>
                <p className="kicker">IMPORTING HISTORY</p>
                <h1 id="page-title">
                  Looking for work
                  <span>you’ve already done.</span>
                </h1>
                <div className="status" role="status">
                  <span className="spinner" aria-hidden="true" />
                  Looking for conversation history
                </div>
              </>
            )}

            {state === 'found' && result && (
              <>
                <p className="kicker">IMPORT COMPLETE</p>
                <h1 id="page-title">
                  Your work is
                  <span>ready to organize.</span>
                </h1>
                <p className="lede">
                  We found {result.conversations.length} conversation
                  {result.conversations.length === 1 ? '' : 's'} across your local histories.
                </p>
                <div className="source-results" aria-live="polite">
                  {result.sources.map((source) => (
                    <article className="source-row" key={source.provider}>
                      <div
                        className={`status-dot status-dot--${source.status}`}
                        aria-hidden="true"
                      />
                      <h2>{sourceName[source.provider]}</h2>
                      <p>{sourceSummary(source)}</p>
                    </article>
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={result.conversations.length === 0}
                  onClick={() => setState('setup')}
                >
                  Continue
                </button>
                {result.conversations.length === 0 && (
                  <button className="text-button sample-button" onClick={() => void loadSample()}>
                    Try the complete flow with sample data
                  </button>
                )}
                {result.sources.some((source) => source.status === 'error') && (
                  <p className="trust-note" role="status">
                    Some history could not be read. Everything available is still ready to use.
                  </p>
                )}
              </>
            )}

            {state === 'setup' && (
              <>
                <p className="kicker">CHOOSE YOUR SETUP</p>
                <h1 id="page-title">
                  How hands-on
                  <span>do you want to be?</span>
                </h1>
                <p className="lede">
                  Selected excerpts will be sent to OpenAI for analysis. Both paths show you the
                  proposed team before anything is created.
                </p>
                <div className="setup-grid">
                  <button
                    className="setup-card setup-card--primary"
                    onClick={() => void analyze('automatic')}
                  >
                    <span className="setup-number">01</span>
                    <strong>Set it up for me</strong>
                    <span>Prepare the strongest Agent team with minimal decisions.</span>
                  </button>
                  <button className="setup-card" onClick={() => void analyze('review')}>
                    <span className="setup-number">02</span>
                    <strong>Let me review</strong>
                    <span>Inspect the evidence and shape each Agent before creating it.</span>
                  </button>
                </div>
              </>
            )}

            {state === 'analyzing' && (
              <>
                <p className="kicker">PREPARING YOUR TEAM</p>
                <h1 id="page-title">
                  Finding the shape
                  <span>of your work.</span>
                </h1>
                <p className="lede">
                  This can take a moment. Completed work is kept if one step needs recovery.
                </p>
                <ol className="progress-list" aria-live="polite">
                  {analysisSteps.map((item, index) => {
                    const status =
                      index < activeStep ? 'complete' : index === activeStep ? 'active' : 'waiting'
                    return (
                      <li className={`progress-item progress-item--${status}`} key={item.step}>
                        <span className="progress-mark" aria-hidden="true" />
                        <span>
                          {index === activeStep && progress ? progress.label : item.label}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}

            {state === 'suggestions' && analysis && (
              <>
                <div className="suggestion-heading">
                  <div>
                    <p className="kicker">YOUR PROPOSED TEAM</p>
                    <h1 id="page-title">
                      {agents.length} Agent{agents.length === 1 ? '' : 's'}, shaped by
                      <span>the work you already do.</span>
                    </h1>
                  </div>
                  <p className="analysis-mode">
                    {analysis.mode === 'openai'
                      ? 'Analyzed with OpenAI'
                      : analysis.mode === 'mixed'
                        ? 'OpenAI analysis with local recovery'
                        : 'Prepared locally'}
                  </p>
                </div>
                <div className="agent-grid">
                  {agents.map((agent) => (
                    <article className="agent-card" key={agent.id}>
                      <div className="agent-meta">
                        <span>{agent.confidence}</span>
                        <span>{agent.conversationIds.length} conversations</span>
                      </div>
                      {analysis.setupStyle === 'review' ? (
                        <input
                          className="agent-name-input"
                          aria-label={`Rename ${agent.name}`}
                          defaultValue={agent.name}
                          onBlur={(event) => updateAgentName(agent.id, event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                          }}
                        />
                      ) : (
                        <h2>{agent.name}</h2>
                      )}
                      <p className="agent-purpose">{agent.purpose}</p>
                      <div className="topic-list">
                        {agent.topics.map((topic) => (
                          <span key={topic}>{topic}</span>
                        ))}
                      </div>
                      {agent.evidence[0] && <blockquote>“{agent.evidence[0].excerpt}”</blockquote>}
                      <div className="agent-actions">
                        <button onClick={() => setDrawer({ type: 'evidence', agent })}>
                          Evidence
                        </button>
                        <button onClick={() => setDrawer({ type: 'brain', agent })}>
                          Brain preview
                        </button>
                        {analysis.setupStyle === 'review' && agents.length > 1 && (
                          <button onClick={() => beginMerge(agent.id)}>Merge</button>
                        )}
                        {analysis.setupStyle === 'review' && (
                          <button className="danger-action" onClick={() => dismissAgent(agent.id)}>
                            Dismiss
                          </button>
                        )}
                      </div>
                      {mergeSourceId === agent.id && (
                        <div className="merge-menu">
                          <label htmlFor={`merge-${agent.id}`}>Merge with</label>
                          <select
                            id={`merge-${agent.id}`}
                            value={mergeTargetId}
                            onChange={(event) => setMergeTargetId(event.currentTarget.value)}
                          >
                            {agents
                              .filter((candidate) => candidate.id !== agent.id)
                              .map((candidate) => (
                                <option value={candidate.id} key={candidate.id}>
                                  {candidate.name}
                                </option>
                              ))}
                          </select>
                          <button
                            disabled={Boolean(busyMessage)}
                            onClick={() => void mergeSelectedAgents()}
                          >
                            Combine
                          </button>
                          <button onClick={() => setMergeSourceId(null)}>Cancel</button>
                        </div>
                      )}
                    </article>
                  ))}
                  {agents.length === 0 && dismissed && (
                    <div className="empty-agents">
                      <p className="kicker">NO AGENTS KEPT</p>
                      <h2>Your proposed team is empty.</h2>
                      <p>Undo the last dismissal to keep shaping this setup.</p>
                      <button className="secondary-button" onClick={undoDismiss}>
                        Restore {dismissed.agent.name}
                      </button>
                    </div>
                  )}
                </div>
                {dismissed && (
                  <div className="undo-bar" role="status">
                    <span>{dismissed.agent.name} dismissed.</span>
                    <button onClick={undoDismiss}>Undo</button>
                  </div>
                )}
                {busyMessage && (
                  <p className="operation-status" role="status">
                    {busyMessage}
                  </p>
                )}
                {operationError && (
                  <p className="operation-error" role="alert">
                    {operationError}
                  </p>
                )}
                <footer className="review-footer">
                  <p>
                    {analysis.setupStyle === 'review'
                      ? 'Shape the team, then review the exact folders.'
                      : 'Review the evidence, then confirm the exact folders.'}
                  </p>
                  <button
                    className="primary"
                    disabled={agents.length === 0 || Boolean(busyMessage)}
                    onClick={() => void prepareCreation()}
                  >
                    Review {agents.length} Agent{agents.length === 1 ? '' : 's'}
                  </button>
                </footer>
              </>
            )}

            {state === 'confirming' && creationPlan && (
              <>
                <div className="suggestion-heading">
                  <div>
                    <p className="kicker">READY TO CREATE</p>
                    <h1 id="page-title">
                      Review every folder<span>before it’s written.</span>
                    </h1>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={Boolean(busyMessage)}
                    onClick={() => void changeDestination()}
                  >
                    Change destination
                  </button>
                </div>
                <div className="destination-panel">
                  <p>Destination</p>
                  <code>{creationPlan.destination}</code>
                </div>
                <div className="creation-list">
                  {creationPlan.agents.map((plannedAgent) => (
                    <article className="creation-row" key={plannedAgent.agentId}>
                      <div>
                        <h2>{plannedAgent.folderName}</h2>
                        <p>{plannedAgent.name}</p>
                      </div>
                      <div className="file-manifest">
                        {plannedAgent.files.map((file) => (
                          <span key={file}>{file}</span>
                        ))}
                      </div>
                      {plannedAgent.collisionResolved && (
                        <span className="collision-note">Renamed to avoid an existing folder</span>
                      )}
                    </article>
                  ))}
                </div>
                {busyMessage && (
                  <p className="operation-status" role="status">
                    {busyMessage}
                  </p>
                )}
                {operationError && (
                  <p className="operation-error" role="alert">
                    {operationError}
                  </p>
                )}
                <footer className="review-footer">
                  <button className="secondary-button" onClick={() => setState('suggestions')}>
                    Back to Agents
                  </button>
                  <button
                    className="primary"
                    disabled={Boolean(busyMessage)}
                    onClick={() => void createAgents()}
                  >
                    Create Agent folders
                  </button>
                </footer>
              </>
            )}

            {state === 'creating' && (
              <div className="centered-state">
                <span className="spinner" aria-hidden="true" />
                <p className="kicker">CREATING YOUR TEAM</p>
                <h1 id="page-title">
                  Writing five focused files<span>for every Agent.</span>
                </h1>
                <p className="lede">Existing folders will not be overwritten.</p>
              </div>
            )}

            {state === 'complete' && manifest && (
              <>
                <p className="kicker">
                  {failedCount === 0 ? 'YOUR TEAM IS READY' : 'CREATION COMPLETE'}
                </p>
                <h1 id="page-title">
                  {createdCount > 0 ? `Created ${createdCount} Agent` : 'No folders were created'}
                  <span>
                    {createdCount > 0
                      ? `folder${createdCount === 1 ? '' : 's'} on this Mac.`
                      : 'Your existing files are untouched.'}
                  </span>
                </h1>
                <p className="lede">
                  {failedCount === 0
                    ? 'Each folder contains the reviewed Brain files and source-backed context.'
                    : `${failedCount} folder${failedCount === 1 ? '' : 's'} could not be created. Successful folders were kept.`}
                </p>
                <div className="completion-list">
                  {manifest.agents.map((agent) => (
                    <article
                      className={`completion-row completion-row--${agent.status}`}
                      key={agent.agentId}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      <div>
                        <h2>{agent.folderName}</h2>
                        <p>
                          {agent.status === 'created'
                            ? `${agent.files.length} files created`
                            : agent.error}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="completion-actions">
                  {createdCount > 0 && (
                    <button
                      className="primary"
                      onClick={() => void window.turnstone.revealAgents()}
                    >
                      Reveal in Finder
                    </button>
                  )}
                  {failedCount > 0 && (
                    <button className="secondary-button" onClick={() => void prepareCreation()}>
                      Review folder plan
                    </button>
                  )}
                  <button className="text-button" onClick={startOver}>
                    Start over
                  </button>
                </div>
              </>
            )}

            {state === 'error' && (
              <>
                <p className="kicker">SOMETHING INTERRUPTED THE FLOW</p>
                <h1 id="page-title">We hit a snag.</h1>
                <div className="error" role="alert">
                  <span>{error}</span>
                  <button
                    className="text-button"
                    onClick={() => setState(result ? 'found' : 'ready')}
                  >
                    Go back
                  </button>
                </div>
              </>
            )}
          </div>

          {!wideState && (
            <figure className="visual" aria-hidden="true">
              <img src={templeImage} alt="" />
            </figure>
          )}
        </div>
        {drawer && <ReviewDrawer drawer={drawer} onClose={closeDrawer} />}
      </section>
    </main>
  )
}
