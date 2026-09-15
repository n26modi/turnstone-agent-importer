# Turnstone Agent Importer

A macOS-first Electron prototype that imports local Claude Code and Codex conversations and turns them into evidence-backed Turnstone Agents with Markdown Brains.

The project is being implemented phase by phase. Phases 1 and 2 are complete: real source discovery and parsing now feed a bounded, evidence-backed OpenAI analysis pipeline with structured summaries, Agent clustering, Brain synthesis, progress states, and deterministic recovery. See [MEMORY.md](./MEMORY.md) for the full product rationale and implementation plan.

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Conversation files are read by the Electron main process. The renderer has no direct filesystem access.

OpenAI analysis uses `OPENAI_API_KEY` from the Electron main process and defaults to `gpt-5.5`. Override the model with `TURNSTONE_OPENAI_MODEL`. Without a key, the same flow completes using deterministic local recovery. Model responses are not stored by the application.
