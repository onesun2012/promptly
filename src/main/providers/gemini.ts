import {
  errorText,
  joinUrl,
  splitDataUrl,
  type AIProvider,
  type ChatChunk,
  type ChatMessage,
  type ChatRequest,
  type ProviderCapabilities,
  type ProviderProfile,
  type ProviderProtocol,
  type TestConnectionResult
} from './types.ts'
import { sseData } from './sse.ts'

/** Gemini vision shape: inline_data part alongside the text part. */
function toGeminiParts(m: ChatMessage): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = []
  if (m.content) parts.push({ text: m.content })
  const img = m.imageDataUrl ? splitDataUrl(m.imageDataUrl) : null
  if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.data } })
  return parts.length ? parts : [{ text: '' }]
}

/** Google Gemini native adapter (generativelanguage.googleapis.com, SPEC §2B). */
export class GeminiProvider implements AIProvider {
  readonly protocol: ProviderProtocol = 'gemini'
  capabilities: ProviderCapabilities = {
    streaming: true,
    vision: true,
    reasoning: true,
    tools: true,
    jsonMode: true
  }

  async listModels(profile: ProviderProfile, signal?: AbortSignal): Promise<string[]> {
    const res = await fetch(joinUrl(profile.baseUrl, '/v1beta/models'), {
      headers: { 'x-goog-api-key': profile.apiKey },
      signal
    })
    if (!res.ok) throw new Error(await errorText(res))
    const j = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
    }
    return (j.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
  }

  async *chat(profile: ProviderProfile, req: ChatRequest): AsyncIterable<ChatChunk> {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m: ChatMessage) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toGeminiParts(m) }))

    const url =
      joinUrl(profile.baseUrl, '/v1beta/models') +
      '/' +
      encodeURIComponent(req.model) +
      ':streamGenerateContent?alt=sse'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': profile.apiKey },
      signal: req.signal,
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {})
      })
    })
    if (!res.ok) {
      yield { type: 'error', content: await errorText(res) }
      return
    }
    for await (const data of sseData(res)) {
      let j: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      try {
        j = JSON.parse(data)
      } catch {
        continue
      }
      const parts = j.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (part.text) yield { type: 'text', content: part.text }
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
}
