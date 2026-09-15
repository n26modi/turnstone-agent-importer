import { useEffect, useState } from 'react'
import type {
  AnalysisProgress,
  AnalysisResult,
  ImportResult,
  SetupStyle,
} from '../../shared/schemas'
import templeImage from './assets/temple.png'

type ScreenState = 'ready' | 'scanning' | 'found' | 'setup' | 'analyzing' | 'suggestions' | 'error'

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

function sourceSummary(source: ImportResult['sources'][number]): string {
  if (source.status === 'found') {
    return `${source.conversationCount} conversation${source.conversationCount === 1 ? '' : 's'}`
  }
  if (source.status === 'missing') return 'No local history found'
  if (source.status === 'empty') return 'No conversations yet'
  return 'Could not read this source'
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<ScreenState>('ready')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)
  const [error, setError] = useState('')

  useEffect(() => window.turnstone.onAnalysisProgress(setProgress), [])

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
      setState('suggestions')
    } catch {
      setError('We couldn’t finish the analysis. Your imported conversations are still ready.')
      setState('error')
    }
  }

  const activeStep = progress ? analysisSteps.findIndex((item) => item.step === progress.step) : 0

  return (
    <main className="shell">
      <section className={`canvas canvas--${state}`} aria-labelledby="page-title">
        <div className="body">
          <div className={`content ${state === 'suggestions' ? 'content--wide' : ''}`}>
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
                      {analysis.agents.length} Agent{analysis.agents.length === 1 ? '' : 's'},
                      shaped by
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
                  {analysis.agents.map((agent) => (
                    <article className="agent-card" key={agent.id}>
                      <div className="agent-meta">
                        <span>{agent.confidence}</span>
                        <span>{agent.conversationIds.length} conversations</span>
                      </div>
                      <h2>{agent.name}</h2>
                      <p className="agent-purpose">{agent.purpose}</p>
                      <div className="topic-list">
                        {agent.topics.map((topic) => (
                          <span key={topic}>{topic}</span>
                        ))}
                      </div>
                      {agent.evidence[0] && <blockquote>“{agent.evidence[0].excerpt}”</blockquote>}
                      <p className="brain-count">5 Brain files prepared</p>
                    </article>
                  ))}
                </div>
                <p className="phase-note">
                  Review controls and folder creation arrive in the next step of this build.
                </p>
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

          {state !== 'suggestions' && (
            <figure className="visual" aria-hidden="true">
              <img src={templeImage} alt="" />
            </figure>
          )}
        </div>
      </section>
    </main>
  )
}
