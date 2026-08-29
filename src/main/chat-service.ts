import type { ChatChunk, ProviderProfile } from '../shared/providers.ts'
import { applyTemplate } from '../shared/actions.ts'
import { getProvider } from './providers/factory.ts'

export interface ChatSendOptions {
  conversationId?: string
  actionId?: string
  selection?: string
  text?: string
  /** data:image/...;base64 — pasted screenshot for vision models. */
  imageDataUrl?: string
}

export interface ChatDeps {
  db: DbLike
  getActiveProvider: () => ProviderProfile | null
  onChunk: (conversationId: string, chunk: ChatChunk) => void
}

/** Minimal DB surface the service needs (see src/main/db.ts). */
export interface DbLike {
  listConversations(): { id: string; title: string }[]
  createConversation(c: {
    id: string
    title: string
    provider_id: string
    model: string
    created_at: number
    updated_at: number
  }): void
  touchConversation(id: string, at: number): void
  getMessages(conversationId: string): { role: string; content: string; image_data?: string | null }[]
  insertMessage(m: {
    conversation_id: string
    role: string
    content: string
    created_at: number
    image_data?: string | null
  }): number
}

const HISTORY_LIMIT = 20

export function createChatService(deps: ChatDeps) {
  const aborts = new Map<string, AbortController>()

  function stop(conversationId: string): void {
    aborts.get(conversationId)?.abort()
  }

  async function send(
    opts: ChatSendOptions
  ): Promise<{ conversationId: string | null; error?: string }> {
    const provider = deps.getActiveProvider()
    if (!provider) {
      deps.onChunk('', { type: 'error', content: 'No provider configured. Open Provider lab and save one first.' })
      return { conversationId: null, error: 'no provider' }
    }

    const userText = opts.actionId
      ? applyTemplate(opts.actionId, opts.selection ?? '')
      : (opts.text ?? opts.selection ?? '')
    if (!userText.trim() && !opts.imageDataUrl) {
      return { conversationId: null, error: 'empty message' }
    }

    const now = Date.now()
    let conversationId = opts.conversationId ?? ''
    const isNew = !conversationId
    if (isNew) {
      conversationId = 'c_' + now.toString(36) + Math.random().toString(36).slice(2, 6)
      deps.db.createConversation({
        id: conversationId,
        title: (userText || 'Screenshot').replace(/\s+/g, ' ').slice(0, 48),
        provider_id: provider.id,
        model: provider.model ?? '',
        created_at: now,
        updated_at: now
      })
    }

    deps.db.insertMessage({
      conversation_id: conversationId,
      role: 'user',
      content: userText,
      created_at: now,
      image_data: opts.imageDataUrl ?? null
    })

    let model = provider.model
    if (!model) {
      try {
        model = (await getProvider(provider.protocol).listModels(provider))[0]
      } catch {
        model = ''
      }
    }
    if (!model) {
      deps.onChunk(conversationId, { type: 'error', content: 'No model available from this endpoint.' })
      return { conversationId, error: 'no model' }
    }

    const history = deps.db
      .getMessages(conversationId)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        ...(m.image_data ? { imageDataUrl: m.image_data } : {})
      }))

    const controller = new AbortController()
    aborts.set(conversationId, controller)

    let assistant = ''
    let errored = ''
    try {
      for await (const chunk of getProvider(provider.protocol).chat(provider, {
        model,
        messages: history,
        signal: controller.signal
      })) {
        if (chunk.type === 'text') assistant += chunk.content ?? ''
        if (chunk.type === 'error') errored = chunk.content ?? 'stream error'
        deps.onChunk(conversationId, chunk)
      }
    } catch (e) {
      errored = String((e as Error)?.message ?? e)
    } finally {
      aborts.delete(conversationId)
    }

    if (errored) {
      if (assistant) {
        deps.db.insertMessage({ conversation_id: conversationId, role: 'assistant', content: assistant, created_at: Date.now() })
      }
      deps.onChunk(conversationId, { type: 'error', content: errored })
      return { conversationId, error: errored }
    }

    deps.db.insertMessage({ conversation_id: conversationId, role: 'assistant', content: assistant, created_at: Date.now() })
    deps.db.touchConversation(conversationId, Date.now())
    deps.onChunk(conversationId, { type: 'done' })
    return { conversationId }
  }

  return { send, stop }
}
