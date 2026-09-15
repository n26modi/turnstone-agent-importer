import { useState } from 'react'
import type { ImportResult } from '../../shared/schemas'

type ScreenState = 'ready' | 'scanning' | 'complete' | 'error'

export default function App(): React.JSX.Element {
  const [state, setState] = useState<ScreenState>('ready')
  const [result, setResult] = useState<ImportResult | null>(null)

  async function scan(): Promise<void> {
    setState('scanning')
    try {
      const nextResult = await window.turnstone.scanHistories()
      setResult(nextResult)
      setState('complete')
    } catch {
      setState('error')
    }
  }

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="eyebrow">Set up your Turnstone team</div>
        <h1 id="page-title">Bring the work you’ve already done.</h1>
        <p className="lede">
          Turnstone reads your local Claude Code and Codex conversations, then finds the projects
          and workflows that deserve a dedicated Agent.
        </p>

        {state === 'ready' && (
          <button className="primary" onClick={scan}>
            Import from this Mac
          </button>
        )}

        {state === 'scanning' && (
          <div className="status" role="status">
            <span className="spinner" aria-hidden="true" />
            Looking for conversation history…
          </div>
        )}

        {state === 'error' && (
          <div className="error" role="alert">
            We couldn’t finish the scan. Your files were not changed.
            <button className="text-button" onClick={scan}>
              Try again
            </button>
          </div>
        )}

        {state === 'complete' && result && (
          <div className="results" aria-live="polite">
            <div className="result-heading">
              <span>Ready to analyze</span>
              <strong>{result.conversations.length} conversations</strong>
            </div>
            <div className="source-grid">
              {result.sources.map((source) => (
                <article className="source-card" key={source.provider}>
                  <div className="source-mark" aria-hidden="true">
                    {source.provider === 'claude-code' ? 'C' : 'X'}
                  </div>
                  <div>
                    <h2>{source.provider === 'claude-code' ? 'Claude Code' : 'Codex'}</h2>
                    <p>
                      {source.status === 'found'
                        ? `${source.conversationCount} conversations found`
                        : source.status === 'missing'
                          ? 'No local history found'
                          : source.status === 'empty'
                            ? 'No conversations yet'
                            : 'Could not read this source'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <p className="privacy-note">Read locally. Nothing was changed on your Mac.</p>
          </div>
        )}
      </section>
    </main>
  )
}
