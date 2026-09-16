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
import AgentActions from './AgentActions'
import ReviewDrawer, { type DrawerState } from './ReviewDrawer'

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

const journeySteps = ['Import', 'Setup', 'Analyze', 'Review', 'Create']
const journeyIndex: Record<ScreenState, number> = {
  ready: 0,
  scanning: 0,
  found: 0,
  setup: 1,
  analyzing: 2,
  suggestions: 3,
  confirming: 4,
  creating: 4,
  complete: 4,
  error: 0,
}

const confidenceExplanation = {
  'Strong pattern': 'A recurring theme supported by several conversations.',
  'Focused project': 'A coherent project with a clear scope.',
  'Worth reviewing': 'A tentative grouping. Check the sources and scope before keeping it.',
} as const

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
        ? { ...file, content: file.content.replace(/^# .+$/m, () => `# ${trimmed}`) }
        : file,
    ),
  }
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<ScreenState>('ready')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<AgentSuggestion[]>([])
  const [dismissed, setDismissed] = useState<{ agent: AgentSuggestion; index: number } | null>(null)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [isSample, setIsSample] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string>('')
  const [busyMessage, setBusyMessage] = useState('')
  const [operationError, setOperationError] = useState('')
  const [creationPlan, setCreationPlan] = useState<CreationPlan | null>(null)
  const [manifest, setManifest] = useState<GeneratedOutputManifest | null>(null)
  const closeDrawer = useCallback(() => setDrawer(null), [])
  const page = useRef<HTMLDivElement>(null)
  const undoButton = useRef<HTMLButtonElement>(null)

  useEffect(() => window.turnstone?.onAnalysisProgress(setProgress), [])
  useEffect(() => {
    if (state !== 'ready') page.current?.focus()
  }, [state])
  useEffect(() => {
    if (dismissed) undoButton.current?.focus()
  }, [dismissed])

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
    setIsSample(false)
    setAnnouncement('')
  }

  async function scan(): Promise<void> {
    setState('scanning')
    setError('')
    try {
      const nextResult = await window.turnstone.scanHistories()
      setIsSample(false)
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
      setIsSample(true)
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
    const index = agents.findIndex((agent) => agent.id === agentId)
    if (index < 0) return
    setDismissed({ agent: agents[index]!, index })
    setAgents((current) => current.filter((agent) => agent.id !== agentId))
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
    setAnnouncement(`${dismissed.agent.name} restored.`)
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
      setAnnouncement(
        `${first.name} and ${second.name} merged. ${merged.mode === 'deterministic' ? 'The combined Brain was prepared locally.' : 'The combined Brain was regenerated with OpenAI.'}`,
      )
    } catch {
      setOperationError('We couldn’t merge those Agents. Nothing was changed.')
    } finally {
      setBusyMessage('')
    }
  }

  async function prepareCreation(retryFailed = false): Promise<void> {
    const pendingAgents =
      retryFailed && manifest
        ? agents.filter((agent) =>
            manifest.agents.some(
              (output) => output.agentId === agent.id && output.status === 'error',
            ),
          )
        : agents
    if (pendingAgents.length === 0) {
      setOperationError('Keep at least one Agent before continuing.')
      return
    }
    setBusyMessage('Checking folder names…')
    setOperationError('')
    try {
      setCreationPlan(await window.turnstone.planCreation(pendingAgents))
      setState('confirming')
    } catch {
      setOperationError('We couldn’t prepare the folder plan. No files were written.')
    } finally {
      setBusyMessage('')
    }
  }

  async function changeDestination(): Promise<void> {
    const pendingAgents = creationPlan
      ? agents.filter((agent) =>
          creationPlan.agents.some((planned) => planned.agentId === agent.id),
        )
      : agents.filter(
          (agent) =>
            !manifest?.agents.some(
              (output) => output.agentId === agent.id && output.status === 'created',
            ),
        )
    setBusyMessage('Choosing a destination…')
    setOperationError('')
    try {
      const destination = await window.turnstone.chooseDestination()
      if (!destination) return
      setBusyMessage('Updating folder plan…')
      // The main process invalidates the previous plan once the destination changes.
      setCreationPlan(null)
      setCreationPlan(await window.turnstone.planCreation(pendingAgents))
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
      setManifest((previous) => ({
        ...output,
        agents: [
          ...(previous?.agents.filter((agent) => agent.status === 'created') ?? []),
          ...output.agents,
        ],
      }))
      setState('complete')
    } catch {
      setOperationError('We couldn’t create the Agent folders. Review the plan and try again.')
      setState('confirming')
    }
  }

  async function revealAgents(): Promise<void> {
    setOperationError('')
    try {
      await window.turnstone.revealAgents()
    } catch {
      setOperationError(
        'We couldn’t open Finder. Your Agent folders are still saved at the destination shown below.',
      )
    }
  }

  const activeStep =
    progress?.step === 'complete'
      ? analysisSteps.length
      : progress
        ? analysisSteps.findIndex((item) => item.step === progress.step)
        : 0

  const wideState = ['suggestions', 'confirming', 'creating', 'complete'].includes(state)
  const createdCount = manifest?.agents.filter((agent) => agent.status === 'created').length ?? 0
  const failedCount = manifest?.agents.filter((agent) => agent.status === 'error').length ?? 0
  const currentJourneyStep = state === 'error' && result ? 2 : journeyIndex[state]
  const sourceCount = new Set(agents.flatMap((agent) => agent.conversationIds)).size

  return (
    <main className="shell">
      <section
        className={`canvas canvas--${state}`}
        aria-labelledby="page-title"
        inert={Boolean(drawer)}
      >
        <header className="app-chrome">
          <span className="app-wordmark">TURNSTONE</span>
          <nav aria-label="Setup progress">
            <ol className="journey-steps">
              {journeySteps.map((label, index) => {
                const complete =
                  index < currentJourneyStep || (state === 'complete' && failedCount === 0)
                return (
                  <li
                    key={label}
                    className={
                      complete
                        ? 'journey-step--complete'
                        : index === currentJourneyStep
                          ? 'journey-step--current'
                          : ''
                    }
                    aria-current={index === currentJourneyStep ? 'step' : undefined}
                  >
                    <span className="journey-number" aria-hidden="true">
                      {complete ? '✓' : index + 1}
                    </span>
                    <span>{label}</span>
                    <span className="sr-only">
                      {complete
                        ? ', complete'
                        : index === currentJourneyStep
                          ? ', current step'
                          : ', upcoming'}
                    </span>
                  </li>
                )
              })}
            </ol>
          </nav>
        </header>
        <div className="body">
          <div
            ref={page}
            tabIndex={-1}
            key={state}
            className={`content ${wideState ? 'content--wide' : ''}`}
            aria-labelledby="page-title"
          >
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
                <details className="privacy-details">
                  <summary>Your history, handled with care</summary>
                  <p>
                    Import reads local history without changing it. For analysis, selected excerpts
                    and project context are sent to OpenAI after basic secret redaction. Redaction
                    is best-effort; excerpts can still contain personal information.
                  </p>
                  <p>
                    Imported history is held in memory. Only the Brain files you confirm are saved.
                    Sample data stays local and requires no API key.
                  </p>
                </details>
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
                  {isSample ? 'Loaded' : 'We found'} {result.conversations.length} conversation
                  {result.conversations.length === 1 ? '' : 's'}{' '}
                  {isSample ? 'from the bundled sample.' : 'across your local histories.'}
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
                {result.sources.some(
                  (source) => source.status === 'error' || source.diagnostics.length > 0,
                ) && (
                  <p className="trust-note" role="status">
                    Some history needed recovery or could not be read. Everything available is still
                    ready to use.
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
                  {isSample
                    ? 'Sample conversations are analyzed locally, with no API key needed.'
                    : 'Selected excerpts will be sent to OpenAI for analysis when an API key is configured; otherwise, suggestions are prepared locally.'}{' '}
                  Both paths show you the proposed team before anything is created.
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
                {progress && (
                  <div className="analysis-count" role="status">
                    <progress
                      aria-label={progress.label}
                      value={progress.completed}
                      max={progress.total}
                    />
                    <span>
                      {progress.completed} of {progress.total}{' '}
                      {progress.step === 'summarizing'
                        ? 'batches'
                        : progress.step === 'synthesizing'
                          ? 'Brains'
                          : 'steps'}{' '}
                      complete
                    </span>
                  </div>
                )}
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
                        <span
                          className="confidence-label"
                          tabIndex={0}
                          aria-label={`${agent.confidence}: ${confidenceExplanation[agent.confidence]}`}
                        >
                          {agent.confidence}
                          <span className="confidence-help" role="tooltip">
                            {confidenceExplanation[agent.confidence]}
                          </span>
                        </span>
                        <span>
                          {agent.conversationIds.length} conversation
                          {agent.conversationIds.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {analysis.setupStyle === 'review' ? (
                        <input
                          className="agent-name-input"
                          aria-label={`Rename ${agent.name}`}
                          defaultValue={agent.name}
                          disabled={Boolean(busyMessage)}
                          maxLength={120}
                          onBlur={(event) => {
                            const name = event.currentTarget.value.trim() || agent.name
                            event.currentTarget.value = name
                            updateAgentName(agent.id, name)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                            if (event.key === 'Escape') {
                              event.currentTarget.value = agent.name
                              event.currentTarget.blur()
                            }
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
                        <button
                          className="brain-preview-action"
                          disabled={Boolean(busyMessage)}
                          onClick={(event) =>
                            setDrawer({ type: 'brain', agent, returnFocus: event.currentTarget })
                          }
                        >
                          Brain preview <span aria-hidden="true">↗</span>
                        </button>
                        <button
                          className="evidence-action"
                          disabled={Boolean(busyMessage)}
                          onClick={(event) =>
                            setDrawer({ type: 'evidence', agent, returnFocus: event.currentTarget })
                          }
                        >
                          Evidence
                        </button>
                        {analysis.setupStyle === 'review' && (
                          <AgentActions
                            name={agent.name}
                            disabled={Boolean(busyMessage)}
                            canMerge={agents.length > 1}
                            onMerge={() => beginMerge(agent.id)}
                            onDismiss={() => dismissAgent(agent.id)}
                          />
                        )}
                      </div>
                      {mergeSourceId === agent.id && (
                        <div className="merge-menu">
                          <label htmlFor={`merge-${agent.id}`}>Merge with</label>
                          <select
                            id={`merge-${agent.id}`}
                            value={mergeTargetId}
                            disabled={Boolean(busyMessage)}
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
                          <button
                            disabled={Boolean(busyMessage)}
                            onClick={() => setMergeSourceId(null)}
                          >
                            Cancel
                          </button>
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
                    <button ref={undoButton} disabled={Boolean(busyMessage)} onClick={undoDismiss}>
                      Undo
                    </button>
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
                    <strong className="review-summary">
                      {agents.length} Agent{agents.length === 1 ? '' : 's'} ·{' '}
                      {agents.reduce((total, agent) => total + agent.brainFiles.length, 0)} files ·{' '}
                      {sourceCount} source conversation{sourceCount === 1 ? '' : 's'}
                    </strong>
                    Review the exact folders before anything is created.
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

            {state === 'confirming' && (
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
                {creationPlan && (
                  <>
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
                            <span className="collision-note">
                              Renamed to avoid an existing folder
                            </span>
                          )}
                        </article>
                      ))}
                    </div>
                  </>
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
                  <button
                    className="secondary-button"
                    disabled={Boolean(busyMessage)}
                    onClick={() => {
                      setOperationError('')
                      setAgents((current) =>
                        current.filter(
                          (agent) =>
                            !manifest?.agents.some(
                              (output) =>
                                output.agentId === agent.id && output.status === 'created',
                            ),
                        ),
                      )
                      setState('suggestions')
                    }}
                  >
                    Back to Agents
                  </button>
                  <button
                    className="primary"
                    disabled={Boolean(busyMessage) || !creationPlan}
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
                    <button className="primary" onClick={() => void revealAgents()}>
                      Reveal in Finder
                    </button>
                  )}
                  {failedCount > 0 && (
                    <button
                      className="secondary-button"
                      disabled={Boolean(busyMessage)}
                      onClick={() => void prepareCreation(true)}
                    >
                      Review folder plan
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={Boolean(busyMessage)}
                    onClick={startOver}
                  >
                    Start over
                  </button>
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
                {createdCount > 0 && (
                  <p className="completion-destination">
                    Saved folders:{' '}
                    {manifest.agents
                      .filter((agent) => agent.status === 'created')
                      .map((agent) => agent.path)
                      .join(' · ')}
                  </p>
                )}
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
        <div className="sr-only" role="status">
          {announcement}
        </div>
      </section>
      {drawer && <ReviewDrawer drawer={drawer} onClose={closeDrawer} />}
    </main>
  )
}
