import type { TurnstoneDesktopApi } from '../../shared/ipc'

declare global {
  interface Window {
    turnstone: TurnstoneDesktopApi
  }
}

export {}
