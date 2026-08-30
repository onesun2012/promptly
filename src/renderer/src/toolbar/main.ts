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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function render(data: ViewData): void {
  current = data
  const app = document.getElementById('app')
  if (!app) return
  const snippet = data.text.length > 46 ? data.text.slice(0, 46) + '…' : data.text
  const button = (a: { id: string; labelKey: string }, primary: boolean): string =>
    `<button class="ai${primary ? ' primary' : ''}" data-action="${a.id}">${escapeHtml(t(a.labelKey))}</button>`

  app.innerHTML = `
    <div class="toolbar">
      <div class="head">
        <span class="brand"><span class="spark">✦</span> Promptly</span>
        <span class="spacer"></span>
        <span class="badge" title="${escapeHtml(data.method)}">✓ ${escapeHtml(t('toolbar.safe'))}</span>
        <button class="iconbtn" id="copy" title="${escapeHtml(t('toolbar.copy'))}">⧉</button>
        <button class="iconbtn" id="close" title="${escapeHtml(t('toolbar.close'))}">✕</button>
      </div>
      <div class="snippet" title="${escapeHtml(data.text)}">“${escapeHtml(snippet)}”</div>
      <div class="airow">
        ${PRIMARY_ACTIONS.map((a) => button(a, true)).join('')}
      </div>
      <div class="airow">
        ${SECONDARY_ACTIONS.map((a) => button(a, false)).join('')}
      </div>
    </div>`
  for (const a of [...PRIMARY_ACTIONS, ...SECONDARY_ACTIONS]) {
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
    method: String(payload.method ?? '')
  })
  // sensitive === 'safe' renders the green Safe badge; anything else turns it
  // into a warning so the user knows capture was unusual.
  if (String(payload.sensitive ?? 'safe') !== 'safe') {
    const badge = document.querySelector('.badge')
    if (badge) {
      badge.className = 'badge warn'
      badge.textContent = '⚠'
    }
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.promptly.hideToolbar()
})

window.promptly.toolbarReady()
