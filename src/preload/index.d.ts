import type { AppInfo, LifecycleInfo, PipelineEvent } from '../shared'
import type { ProviderProfile, ProviderView, TestConnectionResult } from '../main/providers/types'

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
      listProviders: () => Promise<ProviderView[]>
      activeProvider: () => Promise<ProviderProfile | null>
      saveProvider: (profile: ProviderProfile) => Promise<{ ok: boolean; error?: string }>
      deleteProvider: (id: string) => Promise<{ ok: boolean }>
      setActiveProvider: (id: string) => Promise<{ ok: boolean }>
      testProvider: (profile: ProviderProfile) => Promise<TestConnectionResult>
      chatConversations: () => Promise<Array<{ id: string; title: string; updated_at: number }>>
      chatMessages: (id: string) => Promise<Array<{ id: number; role: string; content: string }>>
      chatDelete: (id: string) => Promise<{ ok: boolean }>
      chatSend: (payload: { conversationId?: string; actionId?: string; selection?: string; text?: string }) => void
      chatStop: (id: string) => void
      chatPin: () => void
      chatClose: () => void
      runAction: (id: string) => void
      ballOpenChat: () => void
      ballMenu: (pos: { x: number; y: number }) => void
      getSettings: () => Promise<{ language: string; autostart: boolean }>
      setLanguage: (locale: string) => Promise<{ ok: boolean }>
      setAutostart: (enabled: boolean) => Promise<{ ok: boolean }>
      openChat: () => void
      onAppLocale: (callback: (locale: string) => void) => () => void
      hideMainWindow: () => void
      showMainWindow: () => void
      openFeedback: () => Promise<{ ok: boolean }>
      onChatChunk: (callback: (data: { conversationId: string; chunk: { type: string; content?: string } }) => void) => () => void
      onChatPreloadAction: (callback: (data: { actionId: string; selection: string }) => void) => () => void
    }
  }
}

export {}
