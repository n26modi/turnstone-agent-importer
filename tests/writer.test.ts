import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createAgentFolders,
  planAgentCreation,
  sanitizeFolderName,
} from '../src/main/output/writer'
import type { AgentSuggestion } from '../src/shared/schemas'

const temporaryDirectories: string[] = []

function agent(id: string, name: string): AgentSuggestion {
  return {
    id,
    name,
    purpose: 'Keep durable project context.',
    topics: ['testing'],
    confidence: 'Focused project',
    conversationIds: [`conversation-${id}`],
    evidence: [
      {
        conversationId: `conversation-${id}`,
        title: 'Test conversation',
        provider: 'codex',
        timestamp: null,
        excerpt: 'Create a safe output writer.',
      },
    ],
    brainFiles: [
      { name: 'README.md', content: `# ${name}` },
      { name: 'context.md', content: '# Context' },
      { name: 'patterns.md', content: '# Patterns' },
      { name: 'key-decisions.md', content: '# Decisions' },
      { name: 'open-questions.md', content: '# Questions' },
    ],
  }
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'turnstone-writer-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('Agent output writer', () => {
  it('sanitizes unsafe folder names', () => {
    expect(sanitizeFolderName('../My: Agent / test')).toBe('My-Agent-test')
    expect(sanitizeFolderName('   ')).toBe('Agent')
  })

  it('shows collision suffixes before creation', async () => {
    const destination = await temporaryDirectory()
    await mkdir(path.join(destination, 'Importer-Agent'))

    const plan = await planAgentCreation(
      [agent('one', 'Importer Agent'), agent('two', 'Importer Agent')],
      destination,
    )

    expect(plan.agents.map((item) => item.folderName)).toEqual([
      'Importer-Agent-2',
      'Importer-Agent-3',
    ])
    expect(plan.agents.every((item) => item.collisionResolved)).toBe(true)
  })

  it('writes all five reviewed files and returns a manifest', async () => {
    const destination = await temporaryDirectory()
    const input = agent('one', 'Importer Agent')
    const plan = await planAgentCreation([input], destination)

    const manifest = await createAgentFolders(plan, [input])

    expect(manifest.agents[0]?.status).toBe('created')
    expect(manifest.agents[0]?.files).toHaveLength(5)
    expect(await readFile(path.join(plan.agents[0]!.path, 'README.md'), 'utf8')).toBe(
      '# Importer Agent',
    )
  })

  it('never overwrites a folder created after confirmation', async () => {
    const destination = await temporaryDirectory()
    const input = agent('one', 'Importer Agent')
    const plan = await planAgentCreation([input], destination)
    await mkdir(plan.agents[0]!.path)
    await writeFile(path.join(plan.agents[0]!.path, 'keep.txt'), 'user data')

    const manifest = await createAgentFolders(plan, [input])

    expect(manifest.agents[0]?.status).toBe('error')
    expect(await readFile(path.join(plan.agents[0]!.path, 'keep.txt'), 'utf8')).toBe('user data')
  })
})
