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

const ANTHROPIC_VERSION = '2023-06-01'

/** Anthropic native Messages API adapter (SPEC §2B). */
export class AnthropicProvider implements AIProvider {
  readonly protocol: ProviderProtocol = 'anthropic'
  capabilities: ProviderCapabilities = {
    streaming: true,
    vision: true,
    reasoning: true,
    tools: true,
    jsonMode: false
  }

  async listModels(profile: ProviderProfile, signal?: AbortSignal): Promise<string[]> {
    const res = await fetch(joinUrl(profile.baseUrl, '/v1/models'), {
      headers: this.headers(profile),
      signal
    })
    if (!res.ok) throw new Error(await errorText(res))
    const j = (await res.json()) as { data?: Array<{ id?: string }> }
    return (j.data ?? []).map((m) => String(m.id ?? '')).filter(Boolean)
  }

  async *chat(profile: ProviderProfile, req: ChatRequest): AsyncIterable<ChatChunk> {
    // Anthropic takes `system` top-level and only user/assistant messages.
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n')
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const res = await fetch(joinUrl(profile.baseUrl, '/v1/messages'), {
      method: 'POST',
      headers: this.headers(profile),
      signal: req.signal,
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 1024,
        messages,
        stream: true,
        ...(system ? { system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {})
      })
    })
    if (!res.ok) {
      yield { type: 'error', content: await errorText(res) }
      return
    }
    for await (const data of sseData(res)) {
      let j: { type?: string; delta?: { type?: string; text?: string; thinking?: string } }
      try {
        j = JSON.parse(data)
      } catch {
        continue
      }
      if (j.type === 'content_block_delta' && j.delta) {
        if (j.delta.text) yield { type: 'text', content: j.delta.text }
        if (j.delta.thinking) yield { type: 'reasoning', content: j.delta.thinking }
      } else if (j.type === 'message_stop') {
        yield { type: 'done' }
        return
      } else if (j.type === 'error') {
        yield { type: 'error', content: data }
        return
      }
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
    return {
      'content-type': 'application/json',
      'x-api-key': profile.apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    }
  }
}
