import { createReadStream } from 'node:fs'
import type { Diagnostic } from '../../shared/schemas'

export interface ParsedJsonLine {
  line: number
  value: unknown
}

export interface JsonlReadResult {
  records: ParsedJsonLine[]
  diagnostics: Diagnostic[]
}

function parseLine(
  rawLine: string,
  line: number,
  path: string,
  isFinalUnterminatedLine: boolean,
  result: JsonlReadResult,
): void {
  const trimmed = rawLine.trim()
  if (!trimmed) return

  try {
    result.records.push({ line, value: JSON.parse(trimmed) })
    if (isFinalUnterminatedLine) {
      result.diagnostics.push({
        level: 'warning',
        code: 'missing-final-newline',
        message: 'The final JSONL record was valid but did not end with a newline.',
        path,
        line,
      })
    }
  } catch {
    result.diagnostics.push({
      level: 'warning',
      code: isFinalUnterminatedLine ? 'incomplete-final-line' : 'malformed-jsonl',
      message: isFinalUnterminatedLine
        ? 'Skipped an incomplete final JSONL record while the file may still be changing.'
        : 'Skipped a malformed JSONL record.',
      path,
      line,
    })
  }
}

export async function readJsonLines(path: string): Promise<JsonlReadResult> {
  const result: JsonlReadResult = { records: [], diagnostics: [] }
  const stream = createReadStream(path, { encoding: 'utf8' })
  let buffer = ''
  let line = 0

  for await (const chunk of stream) {
    buffer += chunk
    let newlineIndex = buffer.indexOf('\n')

    while (newlineIndex >= 0) {
      line += 1
      const rawLine = buffer.slice(0, newlineIndex).replace(/\r$/, '')
      buffer = buffer.slice(newlineIndex + 1)
      parseLine(rawLine, line, path, false, result)
      newlineIndex = buffer.indexOf('\n')
    }
  }

  if (buffer.length > 0) {
    line += 1
    parseLine(buffer.replace(/\r$/, ''), line, path, true, result)
  }

  return result
}
