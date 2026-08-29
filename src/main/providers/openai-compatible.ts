import {
  errorText,
  joinUrl,
  type AIProvider,
  type ChatChunk,
  type ChatRequest,
  type ProviderCapabilities,
  type ProviderProfile,
  type ProviderProtocol,
  type TestConnectionResult
} from './types.ts'
import { sseData } from './sse.ts'

/**
 * OpenAI-compatible chat-completions adapter. Covers OpenAI, OpenRouter,
 * Groq, Mistral, xAI, DeepSeek, Ollama, LM Studio and generic relays via a
 * custom base URL (SPEC §2B). Only basic chat completion + streaming is
 * guaranteed; everything else goes through the capability model.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly protocol: ProviderProtocol = 'openai'
  capabilities: ProviderCapabilities = {
    streaming: true,
    vision: false,
    reasoning: true,
    tools: false,
    jsonMode: false
  }

  async listModels(profile: ProviderProfile, signal?: AbortSignal): Promise<string[]> {
    const res = await fetch(joinUrl(profile.baseUrl, '/models'), {
      headers: this.headers(profile),
      signal
    })
    if (!res.ok) throw new Error(await errorText(res))
    const j = (await res.json()) as { data?: Array<{ id?: string }> }
    return (j.data ?? []).map((m) => String(m.id ?? '')).filter(Boolean)
  }

  async *chat(profile: ProviderProfile, req: ChatRequest): AsyncIterable<ChatChunk> {
    const res = await fetch(joinUrl(profile.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: this.headers(profile),
      signal: req.signal,
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: true,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {})
      })
    })
    if (!res.ok) {
      yield { type: 'error', content: await errorText(res) }
      return
    }
    for await (const data of sseData(res)) {
      if (data === '[DONE]') {
        yield { type: 'done' }
        return
      }
      let j: {
        choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>
      }
      try {
        j = JSON.parse(data)
      } catch {
        continue // keepalive or malformed line
      }
      const delta = j.choices?.[0]?.delta
      if (delta?.reasoning_content) yield { type: 'reasoning', content: delta.reasoning_content }
      if (delta?.content) yield { type: 'text', content: delta.content }
    }
    yield { type: 'done' }
  }

  async testConnection(profile: ProviderProfile): Promise<TestConnectionResult> {
    const started = Date.now()
    try {
      const models = await this.listModels(profile)
      const model = profile.model || models[0]
      if (!model) return { ok: false, error: 'No models returned by the endpoint.' }
      let sample = ''
      for await (const chunk of this.chat(profile, {
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        maxTokens: 16
      })) {
        if (chunk.type === 'error') return { ok: false, models, error: chunk.content }
        if (chunk.type === 'text') sample += chunk.content
      }
      return { ok: true, models, sampleReply: sample.trim(), latencyMs: Date.now() - started }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  }

  private headers(profile: ProviderProfile): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (profile.apiKey) h.authorization = `Bearer ${profile.apiKey}`
    return h
  }
}
