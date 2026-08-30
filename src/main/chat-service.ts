import { applyTemplate } from '../shared/actions.ts'
import type { ChatChunk, ProviderProfile } from '../shared/providers.ts'
import { getProvider } from './providers/factory.ts'

export interface ChatSendOptions {
  conversationId?: string
  actionId?: string
  selection?: string
  text?: string
  /** data:image/...;base64 — pasted screenshot for vision models. */
  imageDataUrl?: string
  /** selection session this run belongs to (Retry reuses it). */
  selectionSessionId?: string
  /** one execution instance of an action; Retry mints a new one. */
  requestId?: string
  /** which window the stream renders in. Default: chat. */
  surface?: 'toolbar' | 'chat'
}

export interface ChatDeps {
  db: DbLike
  getActiveProvider: () => ProviderProfile | null
  onChunk: (conversationId: string, chunk: ChatChunk, surface: 'toolbar' | 'chat') => void
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
  getMessages(conversationId: string): {
    role: string
    content: string
    image_data?: string | null
  }[]
  updateMessageContent(id: number, content: string): void
  updateMessageStatus(id: number, status: string): void
  insertMessage(m: {
    conversation_id: string
    role: string
    content: string
    created_at: number
    image_data?: string | null
    selection_session_id?: string | null
    action_id?: string | null
    status?: string | null
    request_id?: string | null
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
  ): Promise<{ conversationId: string | null; messageId: number | null; error?: string }> {
    const surface = opts.surface ?? 'chat'
    const provider = deps.getActiveProvider()
    if (!provider) {
      deps.onChunk('', { type: 'error', content: 'No provider configured. Open Provider lab and save one first.' }, surface)
      return { conversationId: null, messageId: null, error: 'no provider' }
    }

    const userText = opts.actionId
      ? applyTemplate(opts.actionId, opts.selection ?? '')
      : (opts.text ?? opts.selection ?? '')
    if (!userText.trim() && !opts.imageDataUrl) {
      return { conversationId: null, messageId: null, error: 'empty message' }
    }

    const now = Date.now()
    const requestId = opts.requestId ?? 'req_' + now.toString(36) + Math.random().toString(36).slice(2, 6)
    let conversationId = opts.conversationId ?? ''
    if (!conversationId) {
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
      image_data: opts.imageDataUrl ?? null,
      selection_session_id: opts.selectionSessionId ?? null
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
      deps.onChunk(conversationId, { type: 'error', content: 'No model available from this endpoint.' }, surface)
      return { conversationId, messageId: null, error: 'no model' }
    }

    const history = deps.db
      .getMessages(conversationId)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        ...(m.image_data ? { imageDataUrl: m.image_data } : {})
      }))

    // streaming upsert: the assistant row exists from the first token and is
    // updated in place (Grok review: never wait until the end to insert).
    const assistantId = deps.db.insertMessage({
      conversation_id: conversationId,
      role: 'assistant',
      content: '',
      created_at: Date.now(),
      selection_session_id: opts.selectionSessionId ?? null,
      action_id: opts.actionId ?? null,
      status: 'streaming',
      request_id: requestId
    })

    const controller = new AbortController()
    aborts.set(conversationId, controller)

    let assistant = ''
    let errored = ''
    let cancelled = false
    try {
      for await (const chunk of getProvider(provider.protocol).chat(provider, {
        model,
        messages: history,
        signal: controller.signal
      })) {
        if (chunk.type === 'text') {
          assistant += chunk.content ?? ''
          deps.db.updateMessageContent(assistantId, assistant)
        }
        if (chunk.type === 'error') errored = chunk.content ?? 'stream error'
        deps.onChunk(conversationId, chunk, surface)
      }
    } catch (e) {
      if (controller.signal.aborted) {
        cancelled = true
      } else {
        errored = String((e as Error)?.message ?? e)
      }
    } finally {
      aborts.delete(conversationId)
    }

    if (cancelled) {
      deps.db.updateMessageStatus(assistantId, 'cancelled')
      deps.onChunk(conversationId, { type: 'done' }, surface)
      return { conversationId, messageId: assistantId }
    }

    if (errored) {
      deps.db.updateMessageStatus(assistantId, 'failed')
      if (assistant) deps.db.updateMessageContent(assistantId, assistant)
      deps.onChunk(conversationId, { type: 'error', content: errored }, surface)
      return { conversationId, messageId: assistantId, error: errored }
    }

    deps.db.updateMessageContent(assistantId, assistant)
    deps.db.updateMessageStatus(assistantId, 'completed')
    deps.db.touchConversation(conversationId, Date.now())
    deps.onChunk(conversationId, { type: 'done' }, surface)
    return { conversationId, messageId: assistantId }
  }

  return { send, stop }
}
