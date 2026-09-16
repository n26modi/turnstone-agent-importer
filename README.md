# Turnstone Agent Importer

A macOS-first Electron onboarding experience that turns local Claude Code and Codex conversations into evidence-backed Turnstone Agents with durable Markdown Brains.

![Turnstone Agent Importer](./docs/screenshots/import.png)

[Watch the short sample-flow demo](./docs/demo.mov) or follow the [two-minute reviewer walkthrough](./docs/DEMO.md).

## Why this exists

People already teach coding agents how they work across dozens of conversations. This prototype finds that existing context, identifies coherent projects and recurring workflows, and proposes a small team of specialized Agents. Each card explains the concrete work its Agent can help with. The experience is designed around trust: scanning starts only after an explicit click, every suggestion includes source evidence, every Brain can be inspected, and no folder is written without a final manifest.

## Experience

1. **Import from this Mac.** Discover local Claude Code and Codex histories, or use bundled sample data.
2. **Choose a setup style.** Let Turnstone prepare the strongest team automatically, or review and shape it collaboratively.
3. **Analyze.** Clean and bound excerpts locally, summarize conversations, cluster related work, and synthesize five-file Brains.
4. **Review.** Open the primary Brain preview, follow source citations, and inspect all five files. In collaborative mode, use the **•••** menu to rename, merge, or dismiss suggestions. Names wrap for easy reading; Rename opens a focused inline editor. Undo can restore every dismissed Agent, one at a time.
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

The sample flow runs entirely locally, even when an API key is configured. For OpenAI analysis of local histories, set an API key in the shell that launches the application:

```bash
export OPENAI_API_KEY="your-api-key"
npm run dev
```

The default model is `gpt-5.5`. Override it with `TURNSTONE_OPENAI_MODEL`.

The bundled synthetic conversations demonstrate three project Agents: Turnstone Onboarding, AquaShield Simulation, and Memory Research. They pass through the same conservative local pipeline as recovery flows. Draft responsibilities, context, workflows, decisions, and open questions are extracted from source sentences with inline citations; this is not a prerecorded OpenAI result.

To review the compiled app, run `npm run build` followed by `npm run preview`. The build produces Electron main, preload, and renderer assets in `out/`; it does not produce a signed installer.

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
- Tool payloads, generated context, and duplicate transport records are filtered locally. Common credential patterns, private keys, and secret assignments are redacted from excerpts and titles before analysis. This is best-effort redaction, not a guarantee that excerpts contain no personal or sensitive information.
- Long conversations are reduced to bounded, representative excerpts, with space reserved for recent work.
- Selected excerpts, conversation identifiers, dates, and project/title context are sent to OpenAI; requests use `store: false` and no web tools. Provider-side retention policies still apply.
- The API key remains in the Electron main process and is never exposed to the renderer.
- The renderer is sandboxed with context isolation and without Node integration. IPC accepts only the application's main frame; navigation, embedded webviews, and permission requests are blocked. The production Content Security Policy disables renderer network requests.
- Markdown previews render formatted text, lists, tables, code, and safe links. Raw HTML, local-file links, and remote images are not rendered; HTTPS links open in the system browser only when clicked.
- Imported histories and intermediate analysis remain in memory. Only confirmed Brain files are saved, with owner-only file permissions on macOS.
- Existing Agent folders are never silently overwritten.
- Folder names are sanitized and collisions are shown before creation.
- A deterministic local path keeps sample and recovery flows usable without credentials.

## Resilience

Model failures are isolated. A failed summary batch or malformed Brain falls back locally while successful OpenAI work is preserved. The interface identifies OpenAI, mixed, and fully local results. Source errors and partial folder-write failures explain what succeeded and keep existing files untouched. Retrying partial creation plans only the failed Agents, so successful folders are not duplicated.

The five-step indicator preserves orientation throughout onboarding. Review menus support keyboard navigation, inspectors trap focus and restore it on close, and status messages announce review outcomes. Brain citations open their source excerpts; those excerpts provide context, not independent verification of every generated claim.

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
npm run format:check
npm test
npm run build
```

Live OpenAI integration tests are opt-in:

```bash
RUN_OPENAI_LIVE_TEST=1 npm test -- tests/openai.live.test.ts
```

CI runs installation, type checking, linting, tests, and the production Electron build on every pull request and push to `main`.

Tests cover provider parsing, import recovery, bounded and redacted preparation, model recovery, evidence completeness, merging, safe writing, IPC origin checks, Markdown safety, keyboard interactions, and complete review/creation flows. The two credential-gated live tests remain opt-in and use bundled sample conversations, not personal histories.

## Current scope and limitations

This is a take-home prototype, not a production Turnstone integration. It does not include authentication, cloud persistence, ongoing synchronization, Cowork or GPT Work imports, a full Brain editor, telemetry, signing/notarization, or automatic updates. Provider JSONL formats are not public contracts, so parsers are defensive and surface diagnostics when unknown records appear. Large history libraries are held in memory and can take longer to analyze; incremental indexing and cancellation are outside this prototype. Without credentials, the local recovery path produces conservative project groupings and extracted draft context; OpenAI provides the semantic synthesis.

Typography uses **Erode**, designed by Nikhil Ranganathan and distributed by Indian Type Foundry through [Fontshare](https://www.fontshare.com/fonts/erode), under the [ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl).

See [MEMORY.md](./MEMORY.md) for the product decisions, research notes, phased implementation record, and evaluation rationale.
