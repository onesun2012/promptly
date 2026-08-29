import type { AIProvider, ProviderProtocol } from '../../shared/providers.ts'
import { AnthropicProvider } from './anthropic.ts'
import { GeminiProvider } from './gemini.ts'
import { OpenAICompatibleProvider } from './openai-compatible.ts'

export function getProvider(protocol: ProviderProtocol): AIProvider {
  switch (protocol) {
    case 'anthropic':
      return new AnthropicProvider()
    case 'gemini':
      return new GeminiProvider()
    default:
      return new OpenAICompatibleProvider()
  }
}
