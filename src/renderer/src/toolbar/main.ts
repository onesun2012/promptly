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
  app: string
  method: string
  sensitive: string
}

const AI_ACTIONS: Array<{ id: string; labelKey: string }> = [
  { id: 'ask', labelKey: 'toolbar.ask' },
  { id: 'translate', labelKey: 'toolbar.translate' },
  { id: 'summarize', labelKey: 'toolbar.summarize' },
  { id: 'explain', labelKey: 'toolbar.explain' }
]

let current: ViewData | null = null

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function render(data: ViewData): void {
  current = data
  const app = document.getElementById('app')
  if (!app) return
  app.innerHTML = `
    <div class="toolbar">
      <div class="head">
        <span class="app" title="${escapeHtml(data.app)}">${escapeHtml(data.app)}</span>
        <span class="badges"><span class="badge">${escapeHtml(data.method)}</span><span class="badge ok">${escapeHtml(data.sensitive)}</span></span>
      </div>
      <div class="text">${escapeHtml(data.text.length > 120 ? data.text.slice(0, 120) + '…' : data.text)}</div>
      <div class="airow">
        ${AI_ACTIONS.map((a) => `<button class="ai" data-action="${a.id}">${escapeHtml(t(a.labelKey))}</button>`).join('')}
      </div>
      <div class="actions">
        <button id="copy">${escapeHtml(t('toolbar.copy'))}</button>
        <button id="close">${escapeHtml(t('toolbar.close'))}</button>
      </div>
    </div>`
  for (const a of AI_ACTIONS) {
    document.querySelector(`[data-action="${a.id}"]`)?.addEventListener('click', () => {
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
  render({
    text,
    app: String(payload.app ?? ''),
    method: String(payload.method ?? ''),
    sensitive: String(payload.sensitive ?? '')
  })
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.promptly.hideToolbar()
})

window.promptly.toolbarReady()
