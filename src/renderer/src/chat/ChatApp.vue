<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'

interface ConversationRow {
  id: string
  title: string
  updated_at: number
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  imageDataUrl?: string
  reasoning?: string
  streaming?: boolean
  error?: boolean
}

const conversations = ref<ConversationRow[]>([])
const activeId = ref<string | null>(null)
const messages = ref<ChatMsg[]>([])
const input = ref('')
const streaming = ref(false)
const bodyEl = ref<HTMLElement | null>(null)
const pendingImage = ref<string | null>(null)

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
}

function highlight(el: HTMLElement): void {
  el.querySelectorAll('pre code').forEach((block) => {
    if (!(block as HTMLElement).dataset.hl) {
      hljs.highlightElement(block as HTMLElement)
      ;(block as HTMLElement).dataset.hl = '1'
    }
  })
}

function scrollBottom(): void {
  void nextTick(() => {
    if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight
  })
}

async function loadConversations(): Promise<void> {
  conversations.value = await window.promptly.chatConversations()
}

async function openConversation(id: string): Promise<void> {
  activeId.value = id
  const rows = await window.promptly.chatMessages(id)
  messages.value = rows.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
    imageDataUrl: m.imageDataUrl ?? undefined
  }))
  scrollBottom()
  void nextTick(() => highlight(document.getElementById('messages') ?? document.body))
}

async function removeConversation(id: string): Promise<void> {
  await window.promptly.chatDelete(id)
  if (activeId.value === id) {
    activeId.value = null
    messages.value = []
  }
  await loadConversations()
}

function pushUser(content: string, imageDataUrl?: string | null): void {
  messages.value.push({ role: 'user', content, imageDataUrl: imageDataUrl ?? undefined })
  scrollBottom()
}

function ensureAssistant(): ChatMsg {
  const last = messages.value[messages.value.length - 1]
  if (last && last.role === 'assistant' && last.streaming) return last
  const msg: ChatMsg = { role: 'assistant', content: '', streaming: true }
  messages.value.push(msg)
  return msg
}

function sendText(): void {
  const text = input.value.trim()
  const image = pendingImage.value
  if ((!text && !image) || streaming.value) return
  input.value = ''
  pendingImage.value = null
  pushUser(text, image)
  void start({ conversationId: activeId.value ?? undefined, text, imageDataUrl: image === null ? undefined : image })
}

/** Paste handler: screenshots from the clipboard become an attached image. */
function onPaste(e: ClipboardEvent): void {
  const items = e.clipboardData?.items ?? []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = () => {
        pendingImage.value = String(reader.result)
      }
      reader.readAsDataURL(file)
      e.preventDefault()
      return
    }
  }
}

function runAction(actionId: string, selection: string): void {
  pushUser(selection)
  void start({ conversationId: activeId.value ?? undefined, actionId, selection })
}

async function start(payload: {
  conversationId?: string
  actionId?: string
  selection?: string
  text?: string
  imageDataUrl?: string
}): Promise<void> {
  const assistant = ensureAssistant()
  streaming.value = true
  scrollBottom()
  await window.promptly.chatSend(payload)
  assistant.streaming = false
  streaming.value = false
  await loadConversations()
  scrollBottom()
}

window.promptly.onChatChunk(({ conversationId, chunk }) => {
  if (conversationId && activeId.value && conversationId !== activeId.value) return
  if (!activeId.value && conversationId) activeId.value = conversationId
  const last = messages.value[messages.value.length - 1]
  if (!last || last.role !== 'assistant') return
  if (chunk.type === 'text') {
    last.content += chunk.content ?? ''
    scrollBottom()
  } else if (chunk.type === 'reasoning') {
    last.reasoning = (last.reasoning ?? '') + (chunk.content ?? '')
  } else if (chunk.type === 'error') {
    last.error = true
    last.content += (last.content ? '\n\n' : '') + '⚠ ' + (chunk.content ?? 'error')
    streaming.value = false
  }
  scrollBottom()
})

window.promptly.onChatPreloadAction(({ actionId, selection }) => {
  runAction(actionId, selection)
})

onMounted(async () => {
  await loadConversations()
})

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendText()
  }
}

function mdOf(m: ChatMsg): string {
  return renderMarkdown(m.content)
}

function pinWindow(): void {
  window.promptly.chatPin()
}

function showMain(): void {
  window.promptly.showMainWindow()
}

function sendFeedback(): void {
  void window.promptly.openFeedback()
}

function closeWindow(): void {
  window.promptly.chatClose()
}

function stopStreaming(): void {
  window.promptly.chatStop(activeId.value ?? '')
}
</script>

<template>
  <div class="chat">
    <header class="titlebar">
      <button
        class="bar-btn"
        :title="$t('chat.newChat')"
        @click="activeId = null; messages = []"
      >
        ＋
      </button>
      <span class="title">{{ activeId ? $t('chat.conversation') : $t('chat.newChat') }}</span>
      <button
        class="bar-btn"
        :title="$t('app.settings')"
        @click="showMain"
      >
        ⚙
      </button>
      <button
        class="bar-btn"
        :title="$t('app.feedback')"
        @click="sendFeedback"
      >
        ✉
      </button>
      <button
        class="bar-btn"
        :title="$t('chat.pin')"
        @click="pinWindow"
      >
        📌
      </button>
      <button
        class="bar-btn"
        :title="$t('chat.close')"
        @click="closeWindow"
      >
        ✕
      </button>
    </header>

    <div class="layout">
      <aside class="sessions">
        <button
          v-for="c in conversations"
          :key="c.id"
          class="session"
          :class="{ active: c.id === activeId }"
          @click="openConversation(c.id)"
        >
          <span class="stitle">{{ c.title }}</span>
          <span
            class="del"
            @click.stop="removeConversation(c.id)"
          >✕</span>
        </button>
        <div
          v-if="!conversations.length"
          class="muted"
        >
          No conversations yet
        </div>
      </aside>

      <main class="main">
        <div
          id="messages"
          ref="bodyEl"
          class="messages"
        >
          <div
            v-if="!messages.length"
            class="empty"
          >
            {{ $t('chat.emptyHint') }}
          </div>
          <template
            v-for="(m, i) in messages"
            :key="i"
          >
            <div
              v-if="m.role === 'user'"
              class="bubble user"
            >
              <img
                v-if="m.imageDataUrl"
                class="shot"
                :src="m.imageDataUrl"
                alt="screenshot"
              >
              <span v-if="m.content">{{ m.content }}</span>
            </div>
            <div
              v-else
              class="bubble assistant"
              :class="{ err: m.error }"
            >
              <div
                v-if="m.reasoning"
                class="reasoning"
              >
                {{ m.reasoning }}
              </div>
              <div
                v-if="m.content"
                class="md"
                :data-i="i"
                v-html="mdOf(m)"
              />
              <span
                v-if="m.streaming && !m.content"
                class="cursor"
              >▍</span>
            </div>
          </template>
        </div>

        <div v-if="pendingImage" class="pending">
          <img :src="pendingImage" alt="paste preview">
          <button class="rm" title="✕" @click="pendingImage = null">
            ✕
          </button>
        </div>
        <div class="inputbar">
          <textarea
            v-model="input"
            rows="2"
            :placeholder="$t('chat.inputPlaceholder')"
            @keydown="onInputKeydown"
            @paste="onPaste"
          />
          <button
            v-if="!streaming"
            class="send"
            @click="sendText"
          >
            {{ $t('chat.send') }}
          </button>
          <button
            v-else
            class="send stop"
            @click="stopStreaming"
          >
            {{ $t('chat.stop') }}
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
:root {
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: #1f2328;
}
* { box-sizing: border-box; }
body { margin: 0; overflow: hidden; }

.chat { display: flex; flex-direction: column; height: 100vh; }

.titlebar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid #d0d7de;
  -webkit-app-region: drag;
  background: #f6f8fa;
}
.title { font-size: 13px; font-weight: 600; flex: 1; -webkit-app-region: no-drag; }
.bar-btn {
  -webkit-app-region: no-drag;
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 6px;
}
.bar-btn:hover { background: #eaeef2; }

.layout { display: flex; flex: 1; min-height: 0; }

.sessions {
  width: 140px;
  border-right: 1px solid #d0d7de;
  overflow-y: auto;
  padding: 6px;
  background: #fbfcfd;
}
.session {
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 6px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  gap: 4px;
}
.session:hover { background: #eaeef2; }
.session.active { background: #ddf4ff; }
.stitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.del { opacity: 0.5; font-size: 11px; }
.del:hover { opacity: 1; color: #cf222e; }
.muted { color: #57606a; font-size: 12px; padding: 6px; }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.empty { color: #57606a; font-size: 13px; text-align: center; margin-top: 40%; }

.bubble {
  max-width: 92%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.user { align-self: flex-end; background: #ddf4ff; white-space: pre-wrap; }
.assistant { align-self: flex-start; background: #f6f8fa; border: 1px solid #e4e9ed; }
.assistant.err { background: #ffebe9; border-color: #ffc1bd; }
.reasoning {
  font-size: 11px;
  color: #8b949e;
  border-left: 2px solid #d0d7de;
  padding-left: 8px;
  margin-bottom: 6px;
  white-space: pre-wrap;
}
.cursor { animation: blink 1s infinite; color: #0969da; }
@keyframes blink { 50% { opacity: 0; } }

.md :first-child { margin-top: 0; }
.md :last-child { margin-bottom: 0; }
.md p { margin: 6px 0; }
.md pre {
  background: #0d1117;
  color: #e6edf3;
  padding: 10px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
}
.md code { background: #eff2f5; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.md pre code { background: transparent; padding: 0; }

.inputbar {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #d0d7de;
}
.pending {
  position: relative;
  padding: 0 10px;
}
.pending img {
  max-height: 72px;
  max-width: 140px;
  border-radius: 8px;
  border: 1px solid #d0d7de;
}
.pending .rm {
  position: absolute;
  top: -6px;
  right: 2px;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 10px;
  background: #57606a;
  color: #fff;
  border: none;
}
.user .shot {
  display: block;
  max-width: 100%;
  max-height: 180px;
  border-radius: 8px;
  margin-bottom: 6px;
}
textarea {
  flex: 1;
  resize: none;
  font-family: inherit;
  font-size: 13px;
  padding: 8px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
}
.send {
  align-self: flex-end;
  background: #1f883d;
  border: 1px solid #1f883d;
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.send.stop { background: #cf222e; border-color: #cf222e; }
</style>
