import { createAppI18n } from '../i18n'

const i18n = createAppI18n()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__PROMPTLY_I18N__ = i18n
window.promptly.onAppLocale((locale) => {
  i18n.global.locale.value = locale as 'en'
})
const t = (k: string): string => i18n.global.t(k)

interface ViewData {
  text: string
  method: string
}

type Phase = 'action' | 'loading' | 'result'

// Action hierarchy (UI v0.2): primary row for the frequent three, secondary
// row for the rest. Copy lives as a small header icon, not a big button.
const PRIMARY_ACTIONS: Array<{ id: string; labelKey: string }> = [
  { id: 'ask', labelKey: 'toolbar.ask' },
  { id: 'translate', labelKey: 'toolbar.translate' },
  { id: 'rewrite', labelKey: 'toolbar.rewrite' }
]
const SECONDARY_ACTIONS: Array<{ id: string; labelKey: string }> = [
  { id: 'summarize', labelKey: 'toolbar.summarize' },
  { id: 'explain', labelKey: 'toolbar.explain' }
]

let current: ViewData | null = null
let phase: Phase = 'action'
let lastActionId = 'ask'
let resultText = ''
let resultError = false

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function actionLabel(id: string): string {
  const key = [...PRIMARY_ACTIONS, ...SECONDARY_ACTIONS].find((a) => a.id === id)?.labelKey
  return key ? t(key) : id
}

function render(): void {
  const app = document.getElementById('app')
  if (!app) return
  if (!current) {
    app.innerHTML = ''
    return
  }

  if (phase === 'loading') {
    app.innerHTML = `
      <div class="toolbar">
        <div class="head">
          <span class="brand"><span class="spark">✦</span> ${escapeHtml(actionLabel(lastActionId))}…</span>
          <span class="spacer"></span>
          <button class="iconbtn" id="cancel">${escapeHtml(t('toolbar.cancel'))}</button>
        </div>
        <div class="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
      </div>`
    document.getElementById('cancel')?.addEventListener('click', () => window.promptly.toolbarCancel())
    return
  }

  if (phase === 'result') {
    const title = escapeHtml(actionLabel(lastActionId))
    const body = resultError
      ? `<div class="err">⚠ ${escapeHtml(resultText)}</div>`
      : `<div class="resultbody">${escapeHtml(resultText)}</div>`
    app.innerHTML = `
      <div class="toolbar">
        <div class="head">
          <span class="brand"><span class="spark">✦</span> ${title}</span>
          <span class="spacer"></span>
          ${resultError ? '' : `<button class="iconbtn" id="copy" title="${escapeHtml(t('toolbar.copy'))}">⧉</button>`}
          <button class="iconbtn" id="retry" title="${escapeHtml(t('toolbar.retry'))}">↻</button>
          <button class="iconbtn" id="openchat" title="${escapeHtml(t('app.openChat'))}">💬</button>
          <button class="iconbtn" id="close" title="${escapeHtml(t('toolbar.close'))}">✕</button>
        </div>
        <div class="resultwrap">${body}</div>
      </div>`
    document.getElementById('copy')?.addEventListener('click', () => {
      void window.promptly.copySelection(resultText)
    })
    document.getElementById('retry')?.addEventListener('click', () => window.promptly.toolbarRetry())
    document.getElementById('openchat')?.addEventListener('click', () => window.promptly.toolbarOpenInChat())
    document.getElementById('close')?.addEventListener('click', () => window.promptly.hideToolbar())
    return
  }

  // action state
  const snippet = current.text.length > 46 ? current.text.slice(0, 46) + '…' : current.text
  const button = (a: { id: string; labelKey: string }, primary: boolean): string =>
    `<button class="ai${primary ? ' primary' : ''}" data-action="${a.id}">${escapeHtml(t(a.labelKey))}</button>`

  app.innerHTML = `
    <div class="toolbar">
      <div class="head">
        <span class="brand"><span class="spark">✦</span> Promptly</span>
        <span class="spacer"></span>
        <span class="badge">✓ ${escapeHtml(t('toolbar.safe'))}</span>
        <button class="iconbtn" id="copy" title="${escapeHtml(t('toolbar.copy'))}">⧉</button>
        <button class="iconbtn" id="close" title="${escapeHtml(t('toolbar.close'))}">✕</button>
      </div>
      <div class="snippet" title="${escapeHtml(current.text)}">“${escapeHtml(snippet)}”</div>
      <div class="airow">
        ${PRIMARY_ACTIONS.map((a) => button(a, true)).join('')}
      </div>
      <div class="airow">
        ${SECONDARY_ACTIONS.map((a) => button(a, false)).join('')}
      </div>
    </div>`
  for (const a of [...PRIMARY_ACTIONS, ...SECONDARY_ACTIONS]) {
    document.querySelector(`[data-action="${a.id}"]`)?.addEventListener('click', () => {
      lastActionId = a.id
      window.promptly.runAction(a.id)
    })
  }
  document.getElementById('copy')?.addEventListener('click', () => {
    if (current) void window.promptly.copySelection(current.text)
  })
  document.getElementById('close')?.addEventListener('click', () => window.promptly.hideToolbar())
}

window.promptly.onToolbarData(({ env, text }) => {
  const payload = env.payload as Record<string, unknown>
  current = { text, method: String(payload.method ?? '') }
  phase = 'action'
  render()
})

window.promptly.onToolbarPhase(({ phase: p, actionId }) => {
  phase = p as Phase
  if (p === 'loading' && actionId) lastActionId = actionId
  resultText = ''
  resultError = false
  render()
})

window.promptly.onToolbarStream(({ chunk }) => {
  if (phase !== 'result') {
    phase = 'result'
    resultText = ''
  }
  if (chunk.type === 'text') resultText += chunk.content ?? ''
  if (chunk.type === 'error') {
    resultError = true
    resultText = chunk.content ?? 'stream error'
  }
  render()
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.promptly.hideToolbar()
})

window.promptly.toolbarReady()
