import { mkdir, mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanHistories, type SourceRoots } from '../src/main/sources/discovery'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

async function roots(): Promise<SourceRoots> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'turnstone-discovery-'))
  temporaryDirectories.push(root)
  return {
    claudeProjects: path.join(root, '.claude', 'projects'),
    codexSessions: path.join(root, '.codex', 'sessions'),
    codexSessionIndex: path.join(root, '.codex', 'session_index.jsonl'),
  }
}

describe('scanHistories', () => {
  it('reports missing sources without failing the import', async () => {
    const result = await scanHistories(await roots())

    expect(result.conversations).toEqual([])
    expect(result.sources.map((source) => source.status)).toEqual(['missing', 'missing'])
  })

  it('reports existing directories with no histories as empty', async () => {
    const sourceRoots = await roots()
    await mkdir(sourceRoots.claudeProjects, { recursive: true })
    await mkdir(sourceRoots.codexSessions, { recursive: true })

    const result = await scanHistories(sourceRoots)
    expect(result.sources.map((source) => source.status)).toEqual(['empty', 'empty'])
  })

  it('imports primary sessions, ignores nested Claude subagents, and uses Codex titles', async () => {
    const sourceRoots = await roots()
    const claudeProject = path.join(sourceRoots.claudeProjects, '-Users-example-launchpad')
    const subagents = path.join(claudeProject, 'claude-session-1', 'subagents')
    const codexDay = path.join(sourceRoots.codexSessions, '2026', '08', '02')
    await mkdir(subagents, { recursive: true })
    await mkdir(codexDay, { recursive: true })
    await mkdir(path.dirname(sourceRoots.codexSessionIndex), { recursive: true })

    await copyFile(
      path.resolve('tests/fixtures/claude/session.jsonl'),
      path.join(claudeProject, 'claude-session-1.jsonl'),
    )
    await copyFile(
      path.resolve('tests/fixtures/claude/session.jsonl'),
      path.join(subagents, 'agent-example.jsonl'),
    )
    await copyFile(
      path.resolve('tests/fixtures/codex/rollout.jsonl'),
      path.join(codexDay, 'rollout-example.jsonl'),
    )
    await writeFile(
      sourceRoots.codexSessionIndex,
      '{"id":"codex-session-1","thread_name":"Indexed research title","updated_at":"2026-08-02T10:00:05.000Z"}\n',
    )

    const result = await scanHistories(sourceRoots)
    expect(result.sources.map((source) => source.conversationCount)).toEqual([1, 1])
    expect(result.conversations).toHaveLength(2)
    expect(result.conversations.find((item) => item.provider === 'codex')?.title).toBe(
      'Indexed research title',
    )
  })
})
