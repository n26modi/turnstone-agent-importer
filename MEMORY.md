# Turnstone Agent Importer — Project Memory

This file is the durable project brief, implementation plan, and study guide for the Turnstone take-home assignment. Update it when product scope or implementation decisions change.

## Current implementation status

The approved finishing pass improves the local sample with richer synthetic conversations, human-readable project Agent names, specific responsibilities, sentence-level extraction, and inline source citations throughout all five Brain files. Cards explicitly state what an Agent can help with, and OpenAI clustering instructions request concrete, source-grounded responsibilities without claiming live automation. Collaborative review displays wrapping name headings, opens a focused editor through **••• → Rename**, and uses **Review folders** for the next step. A dismissal stack supports repeated Undo, including after other Agents are merged.

Verification for this finishing pass: 48 automated tests passed; the two credential-gated live OpenAI tests remained skipped. Formatting, type checking, lint, production build, and dependency audit passed with zero vulnerabilities. Sample-only checks in the compiled Electron app covered both setup styles, the exact 15-file plan, Brain citations, inspector focus trapping/restoration, native keyboard rename save/cancel, three successive dismissals and undos, and long-name layout at 760×600. Artwork, submission media, and blank-Brain validation were intentionally left unchanged at the user's request. The temple image's provenance remains unresolved; embedded metadata identifies it only as a screenshot.

A fresh local clone with the finishing changes applied also passed `npm ci`, formatting, type checking, lint, 48 tests (two live tests skipped), and the production build. The approved scrolling fix removes the nested review-canvas scroll area so the document owns review scrolling. Compiled Electron checks at 1080×760 and 760×600 confirmed one page scrollbar, working wheel scrolling, a reachable review footer, and independent inspector scrolling with the background locked.

The submission design pass adds a persistent five-step indicator, primary Brain-preview actions, keyboard-accessible overflow menus, formatted Markdown with source-citation navigation, confidence explanations, real analysis counts, a privacy disclosure, and review totals. Inspectors trap/restore focus and review results are announced. The audit also closes concrete gaps in IPC origin validation, renderer navigation/CSP, secret redaction (including titles), recent-excerpt retention, partial-import recovery, source-evidence completeness, folder containment, duplicate creation, and partial-creation retries. Sample analysis and merging are explicitly local even when credentials exist. Current quality coverage is described in the README; historical counts below record earlier phases.

Phases 1–4 are implemented. The repository contains the Electron/React/TypeScript foundation, secure typed IPC, real Claude Code and Codex discovery, thin conversation documents with provenance, local transcript preparation and secret redaction, structured OpenAI summarization, Agent clustering, five-file Brain synthesis, meaningful analysis progress, deterministic and partial-failure recovery, collaborative review, safe folder creation, polished edge states, reviewer documentation, and focused parser, intelligence, writer, and UI-flow tests. The final privacy-safe local smoke scan found 16 Claude Code conversations and 6 Codex conversations containing 1,544 visible messages. Four unknown Codex content blocks were reported and safely skipped without losing readable sessions. The Phase 2 bundled-sample live test completed through the OpenAI Responses API with validated structured output and no fallback.

## Product goal

Build a polished macOS-first onboarding experience that turns a user's existing Claude Code and Codex conversations into useful Turnstone Agents. Each Agent is defined by a local folder of synthesized Markdown files called its Brain.

The intended feeling is:

> Turnstone understands the different kinds of work I do and has already organized the right coworkers for me.

The product must optimize for trust, clarity, low effort, useful defaults, and visible evidence.

## Confirmed source scope

The first version will implement real local discovery, importing, and normalization for Claude Code and Codex. The founder confirmed that Cowork and GPT Work can be imported through another mechanism later; they are outside the first implementation.

The product UI will show only the sources implemented now. It will not call attention to omitted sources.

Each implemented source uses a provider adapter:

```text
Claude Code adapter ─┐
                    ├─→ NormalizedConversation → LLM analysis → Agents → Brains
Codex adapter ──────┘
```

This keeps provider-specific parsing separate from analysis, review, and Brain generation. A future source only needs to produce the shared normalized schema.

## Founder clarification

- The simplest possible UX is preferred.
- Users are unlikely to export archives and upload ZIP files, so local scanning is appropriate.
- This experience belongs in the middle of Turnstone onboarding.
- The founder wants to see product judgment around automatic versus collaborative setup.
- Turnstone's current Brain interface is functional but is not a visual target.
- The take-home should demonstrate original product and UX thinking.

## Confirmed product decisions

- macOS-first Electron application using React and TypeScript.
- Real local scanning and parsing for Claude Code and Codex.
- OpenAI is the primary intelligence path.
- Live analysis uses `OPENAI_API_KEY` from the launching environment; credentials are never committed. Availability and validity must be checked at run time.
- Model selection is configurable through `TURNSTONE_OPENAI_MODEL`; the initial default is `gpt-5.5`.
- Deterministic behavior remains as recovery and as a sample experience that never sends data to OpenAI.
- Both setup styles remain available:
  - **Set it up for me** for a minimally guided automatic path.
  - **Let me review** for lightweight collaborative review.
- Even the automatic path shows a concise confirmation before files are written.
- Default output destination: `~/Documents/Turnstone/Agents`.
- Existing Agent folders are never overwritten silently; the app proposes a suffixed name and shows it before creation.
- Confidence uses human language: **Strong pattern**, **Focused project**, and **Worth reviewing**.
- Visual direction: calm editorial desktop design, warm neutral surfaces, crisp typography, restrained color, document-like Brain previews, and subtle motion.
- No production Turnstone API integration, authentication, ongoing sync, cloud persistence, or full Brain editor.

## Verified local-source research

The workspace root was not an existing Git repository before this project was created.

### Claude Code

Verified source:

```text
~/.claude/projects/*/*.jsonl
```

Observed on the development Mac:

- 16 primary session files and 2 nested subagent files.
- 13 project directories.
- Approximately 24.7 MB of project JSONL.
- Session dates from June through September 2026.
- All inspected records were complete JSON lines at inspection time.

Useful record fields include:

- `type`
- `sessionId`
- `uuid` and `parentUuid`
- `timestamp`
- `cwd`
- `gitBranch`
- `version`
- `isSidechain`
- `message.role`
- `message.content`

Observed content blocks include `text`, `thinking`, `tool_use`, `tool_result`, and `image`.

Important edge cases:

- A `user` role does not necessarily mean a human prompt; tool results also use that role.
- Generated summaries and metadata can resemble dialogue.
- Assistant output is split across records sharing a `message.id`.
- In the inspected data, 827 assistant message IDs appeared more than once, with some responses split across as many as 12 records.
- Those records contained distinct chunks rather than exact duplicate content.
- Nested subagent files should not count as separate user conversations.
- Claude versions vary within the same local store, so parsing must use feature detection and tolerate unknown fields.

Parsing policy:

- Count top-level session JSONL files as conversations.
- Coalesce assistant chunks by message ID while retaining record-level provenance.
- Extract human text/image prompts and assistant text.
- Exclude thinking, tool arguments/results, hooks, queues, snapshots, generated meta prompts, and transcript-only compact summaries from ordinary dialogue.
- Preserve titles, timestamps, working directory, Git branch, session ID, and record IDs.
- Skip unknown blocks with diagnostics rather than failing the session.

`~/.claude/history.jsonl` is a prompt-history index rather than a complete conversation source, so it will not be imported separately.

### Codex

Verified source:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
```

The inspected rollout was produced by Codex CLI `0.154.0`. Records contain a timestamp, ordinal, top-level type, and structured payload.

Observed record types include:

- `session_meta`
- `turn_context`
- `event_msg`
- `response_item`
- `token_usage_record`
- `world_state`

The rollout contains both low-level model-protocol records and higher-level completed UI items. Completed `UserMessage` and `AgentMessage` items are the safer source for visible dialogue because low-level user-role inputs can include generated environment context.

Important edge cases:

- An active rollout grows while it is being read.
- The final line can be partially written.
- Low-level and high-level representations can duplicate the same interaction.
- Developer instructions, environment context, reasoning, commands, and telemetry must not be treated as user conversation.

Parsing policy:

- Stream complete JSONL lines and tolerate an incomplete final line.
- Prefer completed `UserMessage` and `AgentMessage` items.
- Use `session_meta` and the optional session index for titles and provenance.
- Ignore reasoning, commands, developer instructions, environment injection, token accounting, and world state.
- Do not ingest `~/.codex/history.jsonl` separately because it contains prompt history rather than complete conversations.

Codex SQLite databases contain thread metadata and projections of rollout files. The JSONL rollout remains the import source to avoid database migration and locking concerns.

## End-to-end user experience

### 1. Import from this Mac

- The user explicitly clicks **Import from this Mac**.
- The app scans known Claude Code and Codex paths.
- Source cards communicate searching, found, empty, partial, and error states.
- The result shows conversation counts and date ranges.
- **Try with sample data** is always available for reviewers.
- Trust copy explains that files are read locally and selected conversation excerpts will be sent to OpenAI for analysis.

### 2. Choose setup style

- **Set it up for me** prepares the suggested setup with minimal interaction.
- **Let me review** provides rename, dismiss, merge, evidence inspection, and Brain preview.
- The choice stays short and approachable because this is an onboarding step, not a workbench.

### 3. Analyze

Progress language should explain meaningful work rather than show a generic spinner:

- Reading conversations
- Distilling projects and recurring workflows
- Comparing related work
- Preparing potential Agents
- Writing evidence-backed Brains

Partial failure should not discard successful work.

### 4. Suggested Agents

Generate approximately 3–5 strong suggestions. Each card shows:

- Suggested name
- One-line purpose
- Conversation count
- Top topics
- Confidence language
- Representative evidence
- Brain-preview action

Suggestion policy:

- Prefer project Agents when working-directory, repository, and topical evidence show a coherent project.
- Suggest cross-project role or workflow Agents only when the pattern repeats across enough conversations.
- Avoid generic catch-all Agents.
- Avoid heavily overlapping suggestions.
- Frame uncertain claims as open questions rather than facts.

### 5. Review

The review-first path supports:

- Inline rename
- Dismiss with undo
- Merge through a small menu
- Evidence drawer with source, title, date, and relevant excerpt
- Brain preview with a file tree and rendered Markdown

Renaming updates identity fields locally. Merging combines evidence and regenerates the merged Brain with OpenAI, with deterministic recovery if regeneration fails.

The automatic path skips editing but still shows the proposed Agents, destination, and file manifest before creation.

### 6. Create Agents

- Default destination: `~/Documents/Turnstone/Agents`.
- Allow a destination picker.
- Show exact Agent folder names and files before writing.
- Sanitize folder names and resolve collisions visibly.
- Write each folder safely without silent overwrites.
- Return a generated-output manifest.
- Completion shows what was created and offers **Reveal in Finder**.

## OpenAI intelligence pipeline

The founder noted that a light model may be able to operate directly on raw transcripts without a heavy normalization stage. The implementation should follow that product-minded simplification: provider adapters create only the thin shared envelope required for the UI, provenance, and batching. They do not attempt to interpret topics, decisions, or Agent roles locally.

Transcript text is lightly cleaned to remove provider-specific system records, tool payloads, and duplicate transport events. Semantic extraction and organization belong to the model.

```text
local histories
→ provider adapters
→ thin conversation documents with source references
→ bounded conversation batches
→ structured conversation summaries
→ Agent clustering
→ per-Agent Brain synthesis
→ review
→ local folder creation
```

### Conversation preparation

Parsing, filtering, deduplication, and excerpt selection happen locally. Tool noise and generated instructions are removed before any model request.

Large conversations use bounded representative excerpts selected from:

- The opening context
- High-signal user requests
- Decision-heavy sections
- Recent unresolved work

Every conversation participates in analysis, but the application avoids sending unbounded raw transcripts.

### Conversation summaries

The first model stage extracts:

- Projects and workstreams
- User goals
- Durable facts
- Decisions
- Tools and workflows
- Preferences
- Unresolved questions
- Candidate Agent responsibilities
- Source references

Conversation batches use limited concurrency. A failed batch falls back locally while other batches continue.

### Agent clustering

A second model stage receives validated summaries and proposes 3–5 Agents. The structured contract requires clear boundaries, concise purposes, topics, supporting conversation IDs, and an evidence signal.

Every returned source ID must exist in the supplied input. Invalid references are rejected.

### Brain synthesis

Each accepted Agent receives one structured synthesis request producing all Brain files. Model responses use JSON Schema Structured Outputs and are validated again with Zod.

API policy:

- OpenAI Responses API.
- Key is available only to Electron's main process.
- Model is configurable; initial default is `gpt-5.5`.
- Set `store: false`.
- Use no web or external tools.
- Retry transient errors with bounded backoff.
- Do not log API keys or conversation bodies.

## Brain structure

Each Agent receives:

```text
agent-name/
  README.md
  context.md
  patterns.md
  key-decisions.md
  open-questions.md
```

- `README.md`: identity, purpose, responsibilities, and boundaries.
- `context.md`: durable facts and relevant project context.
- `patterns.md`: recurring workflows, tools, preferences, and common requests.
- `key-decisions.md`: consequential decisions found across conversations.
- `open-questions.md`: unresolved threads and likely next actions.

Do not dump raw transcripts into Brains. Significant claims include compact provenance containing source, conversation title, date, and conversation ID.

`history.md` is intentionally omitted because durable context, decisions, and unresolved work are more useful to an Agent than a general timeline.

## Application architecture

```text
Electron main
├── source discovery
├── Claude Code adapter
├── Codex adapter
├── normalization
├── OpenAI pipeline
├── deterministic recovery
└── safe output writer

Electron preload
└── narrow typed IPC surface

React renderer
├── onboarding state machine
├── discovery
├── setup choice
├── analysis progress
├── Agent suggestions
├── collaborative review
├── Brain preview
└── completion
```

Security boundaries:

- `contextIsolation: true`
- `nodeIntegration: false`
- Sandboxed renderer
- No arbitrary renderer filesystem access
- Narrow IPC methods with validated inputs and outputs
- Input-path allowlisting
- Output-path validation
- API key never sent to the renderer
- No raw-transcript cloud persistence created by the application

## Core schemas

Define runtime-validated TypeScript schemas for:

- Provider source
- Normalized conversation
- Normalized message and content block
- Source reference
- Conversation summary
- Agent suggestion
- Brain file
- Analysis progress and errors
- Generated output manifest

Model response schemas should reject unknown structural variants that would make output unsafe, while parser schemas should tolerate unknown provider fields and content blocks.

## Deterministic recovery

The fallback is resilience rather than the main experience. It provides:

- Project grouping from working directories and repositories
- Stable keyword and intent extraction
- Predictable Agent names and purposes
- Extractive evidence-backed Brain content
- Curated sample results
- Recovery for individual failed LLM batches

The reviewer can complete the sample flow without credentials. Real OpenAI analysis remains the intended demonstration path.

## Error and trust states

Handle explicitly:

- Neither source found
- One source empty or missing
- Permission-denied directories
- Empty histories
- Malformed JSONL
- Incomplete final lines
- Files modified during scanning
- Duplicate records
- Unknown content blocks
- Model timeout, rate limit, malformed output, or partial failure
- Output-name collisions
- Partial folder-write failure

Errors should explain what succeeded, what was skipped, and the available recovery action.

## Testing plan

Add focused tests for:

- Sanitized Claude Code fixtures based on verified records
- Sanitized Codex fixtures based on verified rollouts
- Split assistant-message reconstruction
- Human-message classification versus tool/generated messages
- Missing provider directories and empty histories
- Malformed, partially written, and concurrently appended JSONL
- Duplicate records and unknown content blocks
- Normalization and provenance
- Structured model-response validation
- Partial model failure and deterministic recovery
- Agent clustering constraints
- Folder-name sanitization and collision handling
- Output manifests and Markdown generation
- Automatic and review-first onboarding branches
- Electron sample-data smoke flow

Before completion, run and report actual results for:

- Unit and integration tests
- Type checking
- Linting
- Production build/package
- Clean-clone reviewer walkthrough

## Build sequence

### Phase 1 — Foundation and sources

Status: complete.

- Initialize Electron, React, TypeScript, and Vite.
- Add formatting, linting, tests, and CI.
- Define runtime schemas and typed IPC.
- Create sanitized parser fixtures.
- Implement Claude Code and Codex discovery, parsing, normalization, and diagnostics.

### Phase 2 — Intelligence and core flow

Status: complete.

- Implement local transcript cleaning and bounded excerpt selection.
- Implement OpenAI structured summarization.
- Implement Agent clustering and Brain synthesis.
- Add validation, retries, partial failure, and deterministic recovery.
- Build discovery, setup-style choice, and analysis progress screens.

### Phase 3 — Review and creation

Status: complete.

- Build Agent cards and evidence inspection.
- Add rename, dismiss, merge, and undo.
- Build Brain file-tree and Markdown preview.
- Implement destination selection, confirmation, collision handling, writing, and completion.

### Phase 4 — Product polish and delivery

Status: complete.

Final verification on September 15, 2026: a fresh local clone completed `npm ci`, formatting, type checking, linting, 26 tests, and the production Electron build. Two credential-gated OpenAI live tests were intentionally skipped in the standard suite.

- Refine hierarchy, typography, spacing, motion, and all edge states.
- Complete tests and CI.
- Write a strong README covering rationale, architecture, privacy, supported sources, and limitations.
- Add screenshots and a short demo GIF/video.
- Perform a clean-clone walkthrough.

## Definition of done

A reviewer can clone the repository, run the application, import real local Claude Code and Codex histories or use sample data, choose either onboarding style, understand why each Agent was suggested, inspect each generated Brain, confirm the destination, and create real Markdown folders without modifying product code.

## Study guide: how to explain the work

Be prepared to explain:

- Why an explicit import click builds trust before local scanning.
- Why source adapters isolate unstable provider formats.
- Why visible evidence makes LLM suggestions trustworthy.
- Why project-first clustering often creates more useful Agents than generic role labels.
- Why the automatic path still confirms before writing files.
- Why review mode is intentionally lightweight rather than a drag-and-drop organizer.
- Why structured outputs need runtime validation even when the API enforces JSON Schema.
- Why partial failures preserve successful work.
- Why the API key belongs in the Electron main process.
- Why Brains contain synthesized durable knowledge instead of transcript dumps.
- Why deterministic behavior remains valuable even with an LLM-first product.

## Evaluation lens

The founder clarified:

> “Just want to see how you can think about and implement the end to end experience for the user.”

This means the submission should be evaluated primarily through the complete user journey:

- How effortless and trustworthy importing feels.
- How clearly analysis progress is communicated.
- Whether suggested Agents feel specific, useful, and supported by evidence.
- Whether users receive meaningful control without onboarding friction.
- Whether Brain previews make generated knowledge understandable before creation.
- How gracefully the app handles missing data, partial success, and model failures.
- Whether final folder creation feels safe, concrete, and complete.

Every implementation decision should be explainable through this product and UX lens.
