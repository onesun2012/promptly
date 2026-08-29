// Provider adapter smoke test: mock OpenAI/Anthropic/Gemini SSE endpoints and
// verify all three adapters stream correctly. Runs under plain Node 24+.
// Usage: node scripts/test-providers.ts
import http from 'node:http'
import { OpenAICompatibleProvider } from '../src/main/providers/openai-compatible.ts'
import { AnthropicProvider } from '../src/main/providers/anthropic.ts'
import { GeminiProvider } from '../src/main/providers/gemini.ts'
import type { AIProvider, ProviderProfile } from '../src/main/providers/types.ts'

const server = http.createServer((req, res) => {
  const url = req.url ?? ''
  res.setHeader('content-type', 'application/json')

  if (url.endsWith('/models')) {
    // One body serves OpenAI (.data) / Anthropic (.data) / Gemini (.models).
    res.end(
      JSON.stringify({
        data: [{ id: 'mock-mini' }, { id: 'mock-large' }],
        models: [
          { name: 'models/mock-mini', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embed-only', supportedGenerationMethods: ['embedContent'] }
        ]
      })
    )
    return
  }

  res.setHeader('content-type', 'text/event-stream')
  const write = (payload: string): void => {
    res.write(`data: ${payload}\n\n`)
  }
  if (url.includes('/chat/completions')) {
    write(JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking…' } }] }))
    write(JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }))
    write(JSON.stringify({ choices: [{ delta: { content: 'lo from mock' } }] }))
    write('[DONE]')
  } else if (url.includes('/v1/messages')) {
    write(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }))
    write(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo from mock' } }))
    write(JSON.stringify({ type: 'message_stop' }))
  } else if (url.includes('streamGenerateContent')) {
    write(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hel' }] } }] }))
    write(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'lo from mock' }] } }] }))
  } else {
    res.statusCode = 404
    res.end('{}')
  }
  res.end()
})

function fail(msg: string): never {
  console.error('FAIL:', msg)
  process.exit(1)
}

async function exercise(name: string, provider: AIProvider, profile: ProviderProfile): Promise<void> {
  const models = await provider.listModels(profile)
  if (!models.includes('mock-mini')) fail(`${name}: listModels missing mock-mini (${JSON.stringify(models)})`)

  let text = ''
  let reasoning = ''
  let done = false
  for await (const chunk of provider.chat(profile, {
    model: profile.model ?? 'mock-mini',
    messages: [{ role: 'user', content: 'hi' }]
  })) {
    if (chunk.type === 'text') text += chunk.content ?? ''
    if (chunk.type === 'reasoning') reasoning += chunk.content ?? ''
    if (chunk.type === 'done') done = true
  }
  if (!text.includes('Hello from mock')) fail(`${name}: stream text incomplete: "${text}"`)
  if (!done) fail(`${name}: done chunk missing`)

  const test = await provider.testConnection({ ...profile, model: 'mock-mini' })
  if (!test.ok) fail(`${name}: testConnection failed: ${test.error}`)
  if (!test.sampleReply?.includes('Hello from mock')) fail(`${name}: sampleReply wrong: "${test.sampleReply}"`)

  console.log(`PASS ${name} | models=${models.length} reasoning="${reasoning}" reply="${text}" latency=${test.latencyMs}ms`)
}

server.listen(0, '127.0.0.1', async () => {
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`
  try {
    await exercise('openai', new OpenAICompatibleProvider(), {
      id: 't1', name: 't', protocol: 'openai', baseUrl: `${base}/v1`, apiKey: 'sk-mock'
    })
    await exercise('anthropic', new AnthropicProvider(), {
      id: 't2', name: 't', protocol: 'anthropic', baseUrl: base, apiKey: 'ak-mock'
    })
    await exercise('gemini', new GeminiProvider(), {
      id: 't3', name: 't', protocol: 'gemini', baseUrl: base, apiKey: 'g-mock'
    })
    console.log('ALL_PROVIDERS_PASS')
    process.exit(0)
  } catch (e) {
    fail(String((e as Error)?.stack ?? e))
  }
})
