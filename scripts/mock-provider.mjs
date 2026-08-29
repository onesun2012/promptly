// Mock AI provider for manual UI testing of Test Connection.
// Usage: node scripts/mock-provider.mjs   (listens on 127.0.0.1:18081)
import http from 'node:http'

const server = http.createServer((req, res) => {
  const url = req.url ?? ''
  res.setHeader('content-type', 'application/json')
  if (url.endsWith('/models')) {
    res.end(
      JSON.stringify({
        data: [{ id: 'mock-mini' }, { id: 'mock-large' }],
        models: [{ name: 'models/mock-mini', supportedGenerationMethods: ['generateContent'] }]
      })
    )
    return
  }
  res.setHeader('content-type', 'text/event-stream')
  const write = (payload) => res.write(`data: ${payload}\n\n`)
  if (url.includes('/chat/completions')) {
    write(JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }))
    write(JSON.stringify({ choices: [{ delta: { content: 'lo from mock' } }] }))
    write('[DONE]')
  } else if (url.includes('/v1/messages')) {
    write(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello from mock' } }))
    write(JSON.stringify({ type: 'message_stop' }))
  } else if (url.includes('streamGenerateContent')) {
    write(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello from mock' }] } }] }))
  } else {
    res.statusCode = 404
  }
  res.end()
})

server.listen(18081, '127.0.0.1', () => {
  console.log('mock provider on http://127.0.0.1:18081')
})
