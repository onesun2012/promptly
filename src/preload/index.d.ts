import type { AppInfo, LifecycleInfo, PipelineEvent } from '../shared'

declare global {
  interface Window {
    promptly: {
      getAppInfo: () => Promise<AppInfo>
      onPipelineEvent: (callback: (env: PipelineEvent) => void) => () => void
      onPipelineLifecycle: (callback: (info: LifecycleInfo) => void) => () => void
      onToolbarData: (callback: (data: { env: PipelineEvent; text: string }) => void) => () => void
      toolbarReady: () => void
      hideToolbar: () => void
      copySelection: (text: string) => Promise<boolean>
    }
  }
}

export {}
