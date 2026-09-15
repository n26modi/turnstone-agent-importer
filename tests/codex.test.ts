import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCodexConversation } from '../src/main/sources/codex'

const fixture = path.resolve('tests/fixtures/codex/rollout.jsonl')

describe('parseCodexConversation', () => {
  it('prefers visible completed items over model protocol messages', async () => {
    const result = await parseCodexConversation(fixture, 'Developer onboarding research')
    const conversation = result.conversation

    expect(conversation.id).toBe('codex-session-1')
    expect(conversation.title).toBe('Developer onboarding research')
    expect(conversation.project).toBe('research')
    expect(conversation.messages).toHaveLength(2)
    expect(conversation.messages.map((message) => message.id)).toEqual([
      'visible-user-1',
      'visible-agent-1',
    ])
    expect(JSON.stringify(conversation)).not.toContain('generated machine context')
    expect(JSON.stringify(conversation)).not.toContain('echo hidden')
  })
})
