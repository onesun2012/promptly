// Provider abstraction (SPEC §2B) — cross-process contract shared between the
// renderer and the main process. Adapters stay Electron-free so they can be
// exercised directly under Node (scripts/test-providers.ts).

export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export type ChatChunkType = 'text' | 'reasoning' | 'error' | 'done'

export interface ChatChunk {
  type: ChatChunkType
  content?: string
}

export interface ProviderProfile {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  apiKey: string
  model?: string
}

/** Key-masked profile view safe to send to the renderer. */
export interface ProviderView {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  model?: string
  hasKey: boolean
  insecureKey: boolean
}

/** Capability model (SPEC §2B): the UI shows/hides features by these flags. */
export interface ProviderCapabilities {
  streaming: boolean
  vision: boolean
  reasoning: boolean
  tools: boolean
  jsonMode: boolean
}

export interface TestConnectionResult {
  ok: boolean
  models?: string[]
  sampleReply?: string
  latencyMs?: number
  error?: string
}

export interface AIProvider {
  readonly protocol: ProviderProtocol
  capabilities: ProviderCapabilities
  listModels(profile: ProviderProfile, signal?: AbortSignal): Promise<string[]>
  chat(profile: ProviderProfile, req: ChatRequest): AsyncIterable<ChatChunk>
  testConnection(profile: ProviderProfile): Promise<TestConnectionResult>
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export function joinUrl(baseUrl: string, path: string): string {
  return normalizeBaseUrl(baseUrl) + path
}

export async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string }
    if (typeof j.error === 'string') return j.error
    if (j.error?.message) return j.error.message
  } catch {
    // not JSON
  }
  return `HTTP ${res.status} ${body.slice(0, 200)}`
}
