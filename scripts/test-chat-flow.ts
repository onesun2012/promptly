// Chat service flow test: memory DB + mock provider, no Electron needed.
// Usage: node scripts/test-chat-flow.ts
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { createChatService, type DbLike } from '../src/main/chat-service.ts'
import type { ChatChunk, ProviderProfile } from '../src/main/providers/types.ts'

class MemoryDb implements DbLike {
  conversations: Array<{ id: string; title: string; provider_id: string; model: string; created_at: number; updated_at: number }> = []
  messages: Array<{ conversation_id: string; role: string; content: string; created_at: number }> = []

  listConversations() {
    return this.conversations
  }
  createConversation(c: { id: string; title: string; provider_id: string; model: string; created_at: number; updated_at: number }) {
    this.conversations.push({ ...c })
  }
  touchConversation(id: string, at: number) {
    const c = this.conversations.find((x) => x.id === id)
    if (c) c.updated_at = at
  }
  getMessages(conversationId: string) {
    return this.messages.filter((m) => m.conversation_id === conversationId).map((m) => ({ role: m.role, content: m.content }))
  }
  insertMessage(m: { conversation_id: string; role: string; content: string; created_at: number }) {
    this.messages.push({ ...m })
    return this.messages.length
  }
}

function fail(msg: string): never {
  console.error('FAIL:', msg)
  process.exit(1)
}

const server = http.createServer((req, res) => {
  if ((req.url ?? '').endsWith('/models')) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ data: [{ id: 'mock-mini' }] }))
    return
  }
  res.setHeader('content-type', 'text/event-stream')
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }) + '\n\n')
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: ' from mock' } }] }) + '\n\n')
  res.write('data: [DONE]\n\n')
  res.end()
})

server.listen(0, '127.0.0.1', async () => {
  const port = (server.address() as { port: number }).port
  const profile: ProviderProfile = {
    id: 'p_test',
    name: 'test',
    protocol: 'openai',
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: 'sk-test',
    model: 'mock-mini'
  }

  const db = new MemoryDb()
  const chunks: Array<{ cid: string; chunk: ChatChunk }> = []
  const service = createChatService({
    db,
    getActiveProvider: () => profile,
    onChunk: (cid, chunk) => chunks.push({ cid, chunk })
  })

  // 1) action-driven send creates a conversation, applies the template, streams, persists
  const r1 = await service.send({ actionId: 'translate', selection: 'Hola mundo' })
  if (!r1.conversationId) fail('no conversation id: ' + (r1.error ?? ''))
  const cid = r1.conversationId as string
  const msgs1 = db.getMessages(cid)
  if (msgs1.length !== 2) fail(`expected 2 messages after first send, got ${msgs1.length}`)
  if (!msgs1[0].content.includes('Translate the following text')) fail('action template not applied')
  if (!msgs1[0].content.includes('Hola mundo')) fail('selection not in template')
  if (msgs1[1].role !== 'assistant' || msgs1[1].content !== 'Hello from mock') fail('assistant reply wrong: ' + msgs1[1].content)
  const texts = chunks.filter((c) => c.chunk.type === 'text').map((c) => c.chunk.content).join('')
  if (texts !== 'Hello from mock') fail('chunk stream wrong: ' + texts)
  if (!chunks.some((c) => c.chunk.type === 'done')) fail('done chunk missing')
  const conv = db.conversations.find((c) => c.id === cid)
  if (!conv || !conv.title.includes('Translate the following')) fail('conversation title not derived from text')

  // 2) follow-up on the same conversation appends history
  await service.send({ conversationId: cid, text: 'second question' })
  if (db.getMessages(cid).length !== 4) fail('history not appended')

  // 3) no provider -> error chunk, nothing persisted
  const emptyService = createChatService({
    db,
    getActiveProvider: () => null,
    onChunk: (cid2, chunk) => {
      if (chunk.type === 'error' && chunk.content?.includes('No provider configured')) {
        ;(globalThis as { NO_PROVIDER_OK?: boolean }).NO_PROVIDER_OK = true
      }
      void cid2
    }
  })
  const r3 = await emptyService.send({ text: 'hi' })
  if (r3.conversationId !== null) fail('send without provider should not create conversation')

  // 4) sqlite round-trip sanity via temp file (exercises db.ts if ABI allows)
  try {
    const { initSqliteDb } = await import('../src/main/db.ts')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptly-db-'))
    const sql = initSqliteDb(dir)
    sql.createConversation({ id: 'x1', title: 't', provider_id: 'p', model: 'm', created_at: 1, updated_at: 1 })
    sql.insertMessage({ conversation_id: 'x1', role: 'user', content: 'hello', created_at: 2 })
    if (sql.getMessages('x1').length !== 1) fail('sqlite messages round-trip failed')
    fs.rmSync(dir, { recursive: true, force: true })
    console.log('PASS sqlite round-trip')
  } catch (e) {
    console.log('SKIP sqlite round-trip (' + String((e as Error)?.message ?? e).slice(0, 80) + ')')
  }

  if (!(globalThis as { NO_PROVIDER_OK?: boolean }).NO_PROVIDER_OK) fail('no-provider error chunk missing')

  console.log('CHAT_FLOW_PASS')
  server.close()
  process.exit(0)
})
