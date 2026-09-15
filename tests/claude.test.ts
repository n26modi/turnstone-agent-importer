import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseClaudeConversation } from '../src/main/sources/claude'

const fixture = path.resolve('tests/fixtures/claude/session.jsonl')

describe('parseClaudeConversation', () => {
  it('reconstructs visible conversation turns and preserves provenance', async () => {
    const result = await parseClaudeConversation(fixture)
    const conversation = result.conversation

    expect(conversation.id).toBe('claude-session-1')
    expect(conversation.title).toBe('Launch planning')
    expect(conversation.project).toBe('launchpad')
    expect(conversation.messages).toHaveLength(3)
    expect(conversation.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ])

    const assistant = conversation.messages[1]
    expect(assistant.id).toBe('assistant-message-1')
    expect(assistant.content).toEqual([
      { type: 'text', text: 'I’ll organize the launch around positioning' },
      { type: 'text', text: 'and a two-week execution calendar.' },
    ])
    expect(assistant.sourceReferences).toHaveLength(2)

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['unknown-content-block', 'duplicate-record']),
    )
  })
})
