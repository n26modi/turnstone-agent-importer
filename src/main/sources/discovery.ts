import { access, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  ImportResultSchema,
  type Diagnostic,
  type DiscoveredSource,
  type ImportResult,
  type NormalizedConversation,
  type Provider,
} from '../../shared/schemas'
import { parseClaudeConversation } from './claude'
import { parseCodexConversation } from './codex'
import { readJsonLines } from './jsonl'
import { asString, dateRange, isRecord } from './utils'

export interface SourceRoots {
  claudeProjects: string
  codexSessions: string
  codexSessionIndex: string
}

export function defaultSourceRoots(homeDirectory = os.homedir()): SourceRoots {
  return {
    claudeProjects: path.join(homeDirectory, '.claude', 'projects'),
    codexSessions: path.join(homeDirectory, '.codex', 'sessions'),
    codexSessionIndex: path.join(homeDirectory, '.codex', 'session_index.jsonl'),
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function claudeFiles(root: string): Promise<string[]> {
  const projectEntries = await readdir(root, { withFileTypes: true })
  const files: string[] = []

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue
    const projectPath = path.join(root, projectEntry.name)
    const entries = await readdir(projectPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(path.join(projectPath, entry.name))
      }
    }
  }

  return files.sort()
}

async function codexFiles(root: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (depth > 4) return
    const entries = await readdir(currentPath, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(currentPath, entry.name)
        if (entry.isDirectory()) await walk(entryPath, depth + 1)
        if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) files.push(entryPath)
      }),
    )
  }

  await walk(root, 0)
  return files.sort()
}

async function codexTitles(indexPath: string): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  if (!(await exists(indexPath))) return titles

  const jsonl = await readJsonLines(indexPath)
  for (const { value } of jsonl.records) {
    if (!isRecord(value)) continue
    const id = asString(value.id)
    const title = asString(value.thread_name)
    if (id && title) titles.set(id, title)
  }
  return titles
}

function sourceSummary(
  provider: Provider,
  sourcePath: string,
  status: DiscoveredSource['status'],
  conversations: NormalizedConversation[],
  diagnostics: Diagnostic[],
): DiscoveredSource {
  return {
    provider,
    path: sourcePath,
    status,
    conversationCount: conversations.length,
    ...dateRange(conversations),
    diagnostics,
  }
}

async function scanClaude(root: string): Promise<{
  source: DiscoveredSource
  conversations: NormalizedConversation[]
  diagnostics: Diagnostic[]
}> {
  if (!(await exists(root))) {
    return {
      source: sourceSummary('claude-code', root, 'missing', [], []),
      conversations: [],
      diagnostics: [],
    }
  }

  try {
    const files = await claudeFiles(root)
    const conversations: NormalizedConversation[] = []
    const diagnostics: Diagnostic[] = []

    for (const file of files) {
      try {
        const parsed = await parseClaudeConversation(file)
        diagnostics.push(...parsed.diagnostics)
        if (parsed.conversation.messages.length > 0) conversations.push(parsed.conversation)
      } catch (error) {
        diagnostics.push({
          level: 'error',
          code: 'conversation-read-failed',
          message: error instanceof Error ? error.message : 'Could not read a Claude Code session.',
          path: file,
        })
      }
    }

    const status = files.length === 0 || conversations.length === 0 ? 'empty' : 'found'
    return {
      source: sourceSummary('claude-code', root, status, conversations, diagnostics),
      conversations,
      diagnostics,
    }
  } catch (error) {
    const diagnostic: Diagnostic = {
      level: 'error',
      code: 'source-read-failed',
      message: error instanceof Error ? error.message : 'Could not read Claude Code history.',
      path: root,
    }
    return {
      source: sourceSummary('claude-code', root, 'error', [], [diagnostic]),
      conversations: [],
      diagnostics: [diagnostic],
    }
  }
}

async function scanCodex(
  root: string,
  indexPath: string,
): Promise<{
  source: DiscoveredSource
  conversations: NormalizedConversation[]
  diagnostics: Diagnostic[]
}> {
  if (!(await exists(root))) {
    return {
      source: sourceSummary('codex', root, 'missing', [], []),
      conversations: [],
      diagnostics: [],
    }
  }

  try {
    const [files, titles] = await Promise.all([codexFiles(root), codexTitles(indexPath)])
    const conversations: NormalizedConversation[] = []
    const diagnostics: Diagnostic[] = []

    for (const file of files) {
      try {
        const parsed = await parseCodexConversation(file)
        const indexedTitle = titles.get(parsed.conversation.id)
        if (indexedTitle) parsed.conversation.title = indexedTitle
        diagnostics.push(...parsed.diagnostics)
        if (parsed.conversation.messages.length > 0) conversations.push(parsed.conversation)
      } catch (error) {
        diagnostics.push({
          level: 'error',
          code: 'conversation-read-failed',
          message: error instanceof Error ? error.message : 'Could not read a Codex session.',
          path: file,
        })
      }
    }

    const status = files.length === 0 || conversations.length === 0 ? 'empty' : 'found'
    return {
      source: sourceSummary('codex', root, status, conversations, diagnostics),
      conversations,
      diagnostics,
    }
  } catch (error) {
    const diagnostic: Diagnostic = {
      level: 'error',
      code: 'source-read-failed',
      message: error instanceof Error ? error.message : 'Could not read Codex history.',
      path: root,
    }
    return {
      source: sourceSummary('codex', root, 'error', [], [diagnostic]),
      conversations: [],
      diagnostics: [diagnostic],
    }
  }
}

export async function scanHistories(roots = defaultSourceRoots()): Promise<ImportResult> {
  const [claude, codex] = await Promise.all([
    scanClaude(roots.claudeProjects),
    scanCodex(roots.codexSessions, roots.codexSessionIndex),
  ])

  return ImportResultSchema.parse({
    sources: [claude.source, codex.source],
    conversations: [...claude.conversations, ...codex.conversations],
    diagnostics: [...claude.diagnostics, ...codex.diagnostics],
  })
}
