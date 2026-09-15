# Turnstone Agent Importer

A macOS-first Electron prototype that imports local Claude Code and Codex conversations and turns them into evidence-backed Turnstone Agents with Markdown Brains.

The project is being implemented phase by phase. Phase 1 is complete: real source discovery, parsing, thin conversation documents, diagnostics, and the secure Electron boundary are in place. See [MEMORY.md](./MEMORY.md) for the full product rationale and implementation plan.

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
