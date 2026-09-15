# Turnstone Agent Importer

A macOS-first Electron onboarding experience that turns local Claude Code and Codex conversations into evidence-backed Turnstone Agents with durable Markdown Brains.

![Turnstone Agent Importer](./docs/screenshots/import.png)

[Watch the short sample-flow demo](./docs/demo.mov) or follow the [two-minute reviewer walkthrough](./docs/DEMO.md).

## Why this exists

People already teach coding agents how they work across dozens of conversations. This prototype finds that existing context, identifies coherent projects and recurring workflows, and proposes a small team of specialized Agents. The experience is designed around trust: scanning starts only after an explicit click, every suggestion includes source evidence, every Brain can be inspected, and no folder is written without a final manifest.

## Experience

1. **Import from this Mac.** Discover local Claude Code and Codex histories, or use bundled sample data.
2. **Choose a setup style.** Let Turnstone prepare the strongest team automatically, or review and shape it collaboratively.
3. **Analyze.** Clean and bound excerpts locally, summarize conversations, cluster related work, and synthesize five-file Brains.
4. **Review.** Inspect evidence and Brain files; rename, dismiss, undo, or merge suggestions.
5. **Confirm and create.** Review exact destinations, collision-safe folder names, and file manifests before writing.

Each created Agent contains:

```text
agent-name/
  README.md
  context.md
  patterns.md
  key-decisions.md
  open-questions.md
```

## Run locally

Requirements: macOS and Node.js 24 or newer.

```bash
npm ci
npm run dev
```

The sample flow requires no credentials. For live OpenAI analysis, set an API key in the shell that launches the application:

```bash
export OPENAI_API_KEY="your-api-key"
npm run dev
```

The default model is `gpt-5.5`. Override it with `TURNSTONE_OPENAI_MODEL`.

Never commit an API key or place one in renderer code. If a key is exposed in terminal output, chat, or source control, revoke it immediately.

## Architecture

```text
Claude Code adapter ─┐
                     ├─→ normalized conversations
Codex adapter ───────┘              │
                                    ▼
                        local excerpt preparation
                                    │
                                    ▼
                    summaries → clustering → Brains
                                    │
                                    ▼
                         review → safe folder writer
```

- **Electron main process:** filesystem discovery, parsing, OpenAI requests, merge regeneration, and output writing.
- **Preload:** a narrow typed IPC bridge.
- **React renderer:** onboarding, progress, evidence review, Brain preview, confirmation, and completion.
- **Shared Zod schemas:** runtime validation at provider, model, IPC, and filesystem boundaries.

Provider adapters intentionally create a thin shared conversation envelope. They preserve provenance while leaving semantic interpretation to the intelligence pipeline, so another source can be added without rewriting review or creation.

## Privacy and safety

- Local files are scanned only after the user explicitly starts an import.
- Tool payloads, generated context, duplicate records, and obvious secrets are removed locally.
- Long conversations are reduced to bounded, representative excerpts.
- Only selected excerpts are sent to OpenAI; requests use `store: false` and no web tools.
- The API key remains in the Electron main process and is never exposed to the renderer.
- The renderer is sandboxed with context isolation and without Node integration.
- Existing Agent folders are never silently overwritten.
- Folder names are sanitized and collisions are shown before creation.
- A deterministic local path keeps sample and recovery flows usable without credentials.

## Resilience

Model failures are isolated. A failed summary batch or malformed Brain falls back locally while successful OpenAI work is preserved. The interface identifies OpenAI, mixed, and fully local results. Source errors and partial folder-write failures explain what succeeded and keep existing files untouched.

## Supported sources

| Source      | Local path                                     | Imported content                                |
| ----------- | ---------------------------------------------- | ----------------------------------------------- |
| Claude Code | `~/.claude/projects/*/*.jsonl`                 | Primary user/assistant sessions with provenance |
| Codex       | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Visible completed user/assistant messages       |

Nested Claude subagents, generated instructions, reasoning records, shell protocol messages, and Codex prompt-only history are intentionally excluded.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Live OpenAI integration tests are opt-in:

```bash
RUN_OPENAI_LIVE_TEST=1 npm test -- tests/openai.live.test.ts
```

CI runs installation, type checking, linting, tests, and the production Electron build on every pull request and push to `main`.

## Current scope and limitations

This is a take-home prototype, not a production Turnstone integration. It does not include authentication, cloud persistence, ongoing synchronization, Cowork or GPT Work imports, a full Brain editor, telemetry, signing/notarization, or automatic updates. Provider JSONL formats are not public contracts, so parsers are defensive and surface diagnostics when unknown records appear.

See [MEMORY.md](./MEMORY.md) for the product decisions, research notes, phased implementation record, and evaluation rationale.
