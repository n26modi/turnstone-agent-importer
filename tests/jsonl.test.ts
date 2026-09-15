import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readJsonLines } from '../src/main/sources/jsonl'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

async function temporaryFile(content: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'turnstone-jsonl-'))
  temporaryDirectories.push(directory)
  const file = path.join(directory, 'records.jsonl')
  await writeFile(file, content)
  return file
}

describe('readJsonLines', () => {
  it('keeps a valid final record without a newline and reports it', async () => {
    const file = await temporaryFile('{"id":1}\n{"id":2}')
    const result = await readJsonLines(file)

    expect(result.records).toHaveLength(2)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'missing-final-newline', line: 2 }),
    )
  })

  it('skips a partially written final record', async () => {
    const file = await temporaryFile('{"id":1}\n{"id":')
    const result = await readJsonLines(file)

    expect(result.records).toHaveLength(1)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'incomplete-final-line', line: 2 }),
    )
  })

  it('skips malformed complete records and continues', async () => {
    const file = await temporaryFile('{"id":1}\nnot-json\n{"id":2}\n')
    const result = await readJsonLines(file)

    expect(result.records).toHaveLength(2)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'malformed-jsonl', line: 2 }),
    )
  })
})
