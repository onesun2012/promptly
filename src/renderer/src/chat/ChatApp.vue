<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
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

const activeTitle = computed(() => {
  if (!activeId.value) return ''
  return conversations.value.find((c) => c.id === activeId.value)?.title ?? ''
})

const copyFlash = ref<Record<number, boolean>>({})

async function copyPlain(text: string, key?: number): Promise<void> {
  const t = text.replace(/^\u26a0\s*/, '').replace(/^⚠\s*/, '').trim()
  if (!t) return
  try {
    await navigator.clipboard.writeText(t)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = t
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  if (key !== undefined) {
    copyFlash.value = { ...copyFlash.value, [key]: true }
    window.setTimeout(() => {
      const next = { ...copyFlash.value }
      delete next[key]
      copyFlash.value = next
    }, 1200)
  }
}

function retryFailed(index: number): void {
  if (streaming.value) return
  const msg = messages.value[index]
  if (!msg || msg.role !== 'assistant' || !msg.error) return
  let userIdx = -1
  for (let i = index - 1; i >= 0; i--) {
    if (messages.value[i].role === 'user') {
      userIdx = i
      break
    }
  }
  if (userIdx < 0) return
  const user = messages.value[userIdx]
  messages.value.splice(index, 1)
  void start({
    conversationId: activeId.value ?? undefined,
    text: user.content || undefined,
    imageDataUrl: user.imageDataUrl
  })
}

function enhanceCodeBlocks(rootEl: HTMLElement): void {
  rootEl.querySelectorAll('pre').forEach((pre) => {
    const el = pre as HTMLElement
    if (el.dataset.copyReady) return
    el.dataset.copyReady = '1'
    el.classList.add('has-copy')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'code-copy'
    btn.textContent = 'Copy'
    btn.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      const code = el.querySelector('code')?.textContent ?? el.textContent ?? ''
      void copyPlain(code).then(() => {
        btn.textContent = 'Copied'
        window.setTimeout(() => {
          btn.textContent = 'Copy'
        }, 1200)
      })
    })
    el.appendChild(btn)
  })
}

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
  enhanceCodeBlocks(el)
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

window.promptly.onChatOpenConversation(({ conversationId }) => {
  void openConversation(conversationId)
})

onMounted(async () => {
  await loadConversations()
  // Conversations can be created outside this window (toolbar selection
  // actions), so re-pull the list every time the window gets focus/shown.
  window.addEventListener('focus', () => {
    void loadConversations()
  })
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

// Frameless window drag: -webkit-app-region is unreliable on Electron 44
// (same reason the floating ball uses manual dragging), so the titlebar
// signals the main process, which moves the window from cursor position.
function titlebarDragStart(e: MouseEvent): void {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest('button')) return
  window.promptly.windowDragStart()
}
function titlebarDragEnd(): void {
  window.promptly.windowDragEnd()
}

// Resizable sidebar: drag the sash between the panes. Width persists in
// localStorage so the user's proportion survives restarts.
const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 420
const sidebarWidth = ref(Number(localStorage.getItem('chat.sidebarWidth')) || 224)
function startSashResize(e: MouseEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  const startX = e.clientX
  const startW = sidebarWidth.value
  const onMove = (ev: MouseEvent): void => {
    sidebarWidth.value = Math.min(Math.max(startW + ev.clientX - startX, SIDEBAR_MIN), SIDEBAR_MAX)
  }
  const onUp = (): void => {
    localStorage.setItem('chat.sidebarWidth', String(sidebarWidth.value))
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function stopStreaming(): void {
  window.promptly.chatStop(activeId.value ?? '')
}
</script>

<template>
  <div class="chat">
    <header
      class="titlebar"
      @mousedown="titlebarDragStart"
      @mouseup="titlebarDragEnd"
    >
      <button
        class="bar-btn"
        :title="$t('chat.newChat')"
        @click="activeId = null; messages = []"
      >
        ＋
      </button>
      <span class="title">{{ activeTitle || $t('chat.newChat') }}</span>
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
      <aside
        class="sessions"
        :style="{ width: sidebarWidth + 'px' }"
      >
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
        >{{ $t('chat.noConversations') }}</div>
      </aside>

      <div
        class="sash"
        title=""
        @mousedown="startSashResize"
      ></div>

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
              <div
                v-if="!m.streaming && m.content"
                class="bubble-actions"
              >
                <button
                  type="button"
                  class="act"
                  @click="copyPlain(m.content, i)"
                >{{ copyFlash[i] ? $t('chat.copied') : $t('chat.copy') }}</button>
                <button
                  v-if="m.error"
                  type="button"
                  class="act"
                  @click="retryFailed(i)"
                >{{ $t('chat.retry') }}</button>
              </div>
            </div>
          </template>
        </div>

        <div v-if="pendingImage" class="pending">
          <img :src="pendingImage" alt="paste preview">
          <button class="rm" title="✕" @click="pendingImage = null">
            ✕
          </button>
        </div>
        <div class="composer">
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
          <div class="input-hint">{{ $t('chat.inputHint') }}</div>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
:root {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: var(--text);
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  overflow: hidden;
  background: transparent;
  color: var(--text);
}

.chat {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 16px);
  margin: 8px;
  background:
    var(--panel-glow),
    var(--bg);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-window);
}

.titlebar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  cursor: move;
  user-select: none;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.035), transparent),
    var(--surface);
}
.title {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  color: var(--text);
  letter-spacing: -0.01em;
}
.bar-btn {
  -webkit-app-region: no-drag;
  border: 1px solid transparent;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  color: var(--text-2);
  transition: background .12s ease, border-color .12s ease, color .12s ease;
}
.bar-btn:hover {
  background: var(--surface-hover);
  border-color: var(--border);
  color: var(--text);
}

.layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sessions {
  min-width: 160px;
  max-width: 420px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 10px 8px;
  background:
    linear-gradient(90deg, rgba(0,0,0,0.18), transparent 70%),
    var(--surface);
}
.sash {
  width: 5px;
  margin: 0 -2px;
  cursor: col-resize;
  z-index: 1;
  flex: none;
}
.sash:hover { background: var(--accent-soft); }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: var(--radius-pill);
  border: 2px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-3);
  background-clip: content-box;
}
::-webkit-scrollbar-corner { background: transparent; }

.session {
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  padding: 9px 10px;
  border-radius: 11px;
  font-size: 12px;
  cursor: pointer;
  gap: 6px;
  color: var(--text);
  margin-bottom: 3px;
  transition: background .12s ease, border-color .12s ease, box-shadow .12s ease;
}
.session:hover {
  background: var(--surface-hover);
  border-color: rgba(255,255,255,0.04);
}
.session.active {
  background: var(--session-active);
  border-color: rgba(124, 92, 255, 0.25);
  box-shadow: inset 3px 0 0 var(--accent), 0 0 0 1px rgba(124, 92, 255, 0.08);
}
.stitle {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.del {
  opacity: 0;
  font-size: 11px;
  color: var(--text-2);
  transition: opacity .12s ease, color .12s ease;
}
.session:hover .del,
.session:focus-within .del { opacity: 0.7; }
.del:hover {
  opacity: 1 !important;
  color: var(--danger);
}
.muted {
  color: var(--text-2);
  font-size: 12px;
  padding: 12px 10px;
  line-height: 1.45;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(124, 92, 255, 0.07), transparent 55%),
    var(--bg);
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty {
  color: var(--text-2);
  font-size: 14px;
  text-align: center;
  margin: auto 0;
  padding: 28px 18px;
  line-height: 1.55;
  max-width: 280px;
  align-self: center;
}
.empty::before {
  content: '✦';
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 14px;
  color: var(--accent);
  font-size: 20px;
  border-radius: 14px;
  background: var(--accent-soft);
  border: 1px solid rgba(124, 92, 255, 0.28);
  box-shadow: 0 8px 24px rgba(124, 92, 255, 0.18);
}

.bubble {
  max-width: 92%;
  padding: 11px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
}
.user {
  align-self: flex-end;
  background: linear-gradient(180deg, var(--accent-hover), var(--accent));
  color: #fff;
  white-space: pre-wrap;
  border-bottom-right-radius: 6px;
  box-shadow: 0 8px 22px rgba(124, 92, 255, 0.28);
}
.assistant {
  align-self: flex-start;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent 40%), var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-bottom-left-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}
.assistant.err {
  background: var(--danger-soft);
  border-color: var(--danger-border);
  box-shadow: none;
}
.reasoning {
  font-size: 11px;
  color: var(--text-2);
  border-left: 2px solid var(--border);
  padding-left: 8px;
  margin-bottom: 6px;
  white-space: pre-wrap;
}
.cursor {
  animation: blink 1s infinite;
  color: var(--accent);
}
@keyframes blink {
  50% { opacity: 0; }
}

.md :first-child { margin-top: 0; }
.md :last-child { margin-bottom: 0; }
.md p { margin: 6px 0; }
.md pre {
  background: var(--code-bg);
  color: var(--code-text);
  padding: 10px;
  border-radius: 10px;
  overflow-x: auto;
  font-size: 12px;
  border: 1px solid var(--border);
}
.md code {
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 6px;
  font-size: 12px;
}
.md pre code { background: transparent; padding: 0; }
.md a { color: var(--accent-link); }
.md table { border-collapse: collapse; }
.md th,
.md td {
  border: 1px solid var(--border);
  padding: 4px 8px;
}

.pending {
  position: relative;
  padding: 0 12px 6px;
}
.pending img {
  max-height: 72px;
  max-width: 140px;
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: 0 4px 14px rgba(0,0,0,0.25);
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
  background: var(--text-3);
  color: #fff;
  border: none;
  cursor: pointer;
}
.user .shot {
  display: block;
  max-width: 100%;
  max-height: 180px;
  border-radius: 10px;
  margin-bottom: 6px;
}

.inputbar {
  display: flex;
  gap: 8px;
  padding: 12px 14px 14px;
  border-top: 1px solid var(--border);
  background:
    linear-gradient(0deg, rgba(0,0,0,0.22), transparent),
    var(--surface);
}
textarea {
  flex: 1;
  resize: none;
  font-family: inherit;
  font-size: 13px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(15, 17, 21, 0.72);
  color: var(--text);
  outline: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
  transition: border-color .12s ease, box-shadow .12s ease;
}
textarea:focus {
  border-color: rgba(124, 92, 255, 0.65);
  box-shadow: 0 0 0 3px var(--accent-soft), inset 0 1px 0 rgba(255,255,255,0.04);
}
textarea::placeholder { color: var(--text-2); }
.send {
  align-self: flex-end;
  background: linear-gradient(180deg, var(--accent-hover), var(--accent));
  border: 1px solid transparent;
  color: #fff;
  border-radius: 12px;
  padding: 9px 16px;
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(124, 92, 255, 0.28);
  transition: filter .12s ease, transform .12s ease;
}
.send:hover {
  filter: brightness(1.06);
}
.send:active { transform: translateY(1px); }
.send.stop {
  background: var(--danger);
  border-color: var(--danger);
  font-weight: 500;
  box-shadow: none;
}
.send.stop:hover { filter: brightness(1.05); }

.bubble-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.bubble-actions .act {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
  color: var(--text-2);
  border-radius: var(--radius-pill);
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.bubble-actions .act:hover {
  color: var(--text);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.composer {
  border-top: 1px solid var(--border);
  background:
    linear-gradient(0deg, rgba(0,0,0,0.22), transparent),
    var(--surface);
}
.composer .inputbar {
  border-top: none;
  background: transparent;
  padding-bottom: 6px;
}
.input-hint {
  padding: 0 14px 12px;
  font-size: 11px;
  color: var(--text-3);
}
.md pre.has-copy { position: relative; padding-top: 28px; }
.md pre .code-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  border-radius: 8px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.md pre .code-copy:hover {
  color: var(--text);
  border-color: var(--accent);
}
</style>
