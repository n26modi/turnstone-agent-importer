import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '../src/shared/ipc'
import { sampleImportResult } from '../src/main/sample'

const desktop = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
  analyze: vi.fn().mockResolvedValue({ agents: [], summaries: [] }),
  merge: vi.fn().mockResolvedValue({}),
  scan: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    setName: vi.fn(),
    setPath: vi.fn(),
    getPath: () => '/tmp',
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
  },
  BrowserWindow: class {
    webContents = {
      on: vi.fn(),
      session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
      setWindowOpenHandler: vi.fn(),
    }
    once = vi.fn()
    loadFile = vi.fn()
    loadURL = vi.fn()
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => desktop.handlers.set(channel, handler),
  },
  shell: { openExternal: vi.fn() },
  dialog: {},
}))
vi.mock('../src/main/intelligence/pipeline', () => ({ analyzeConversations: desktop.analyze }))
vi.mock('../src/main/intelligence/review', () => ({ mergeAgentSuggestions: desktop.merge }))
vi.mock('../src/main/sources/discovery', () => ({ scanHistories: desktop.scan }))

function sender(
  url = new URL('../src/renderer/index.html', import.meta.url).href,
): IpcMainInvokeEvent {
  const frame = { url }
  return { senderFrame: frame, sender: { mainFrame: frame } } as unknown as IpcMainInvokeEvent
}

beforeAll(async () => {
  await import('../src/main/index')
})
afterEach(() => vi.unstubAllEnvs())

describe('desktop trust boundaries', () => {
  it('rejects IPC from external pages and subframes before doing any work', () => {
    const scan = desktop.handlers.get(IPC_CHANNELS.scanHistories)!
    expect(() => scan(sender('https://example.com'))).toThrow(
      'did not come from the Turnstone application',
    )
    const subframe = sender()
    Object.assign(subframe, {
      senderFrame: { url: new URL('../src/renderer/index.html', import.meta.url).href },
    })
    expect(() => scan(subframe)).toThrow('did not come from the Turnstone application')
    expect(desktop.scan).not.toHaveBeenCalled()
  })

  it('forces sample analysis to remain local even if an API key is configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fake-test-key')
    desktop.handlers.get(IPC_CHANNELS.loadSampleHistories)!(sender())
    await desktop.handlers.get(IPC_CHANNELS.analyzeHistories)!(sender(), 'review')
    expect(desktop.analyze).toHaveBeenLastCalledWith(
      expect.any(Array),
      'review',
      expect.any(Function),
      { model: null },
    )
  })

  it('invalidates previous analysis when importing a new history', async () => {
    desktop.scan.mockResolvedValueOnce(sampleImportResult())
    await desktop.handlers.get(IPC_CHANNELS.scanHistories)!(sender())
    await expect(desktop.handlers.get(IPC_CHANNELS.mergeAgents)!(sender(), {}, {})).rejects.toThrow(
      'Analyze histories before merging',
    )
    await desktop.handlers.get(IPC_CHANNELS.analyzeHistories)!(sender(), 'automatic')
    expect(desktop.analyze).toHaveBeenLastCalledWith(
      expect.any(Array),
      'automatic',
      expect.any(Function),
      {},
    )
  })
})
