import type { AppInfo } from '../shared'

declare global {
  interface Window {
    promptly: {
      getAppInfo: () => Promise<AppInfo>
    }
  }
}

export {}
