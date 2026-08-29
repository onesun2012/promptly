interface ViewData {
  text: string
  app: string
  method: string
  sensitive: string
}

const AI_ACTIONS: Array<{ id: string; label: string }> = [
  { id: 'ask', label: 'Ask' },
  { id: 'translate', label: 'Translate' },
  { id: 'summarize', label: 'Summarize' },
  { id: 'explain', label: 'Explain' }
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
        ${AI_ACTIONS.map((a) => `<button class="ai" data-action="${a.id}">${a.label}</button>`).join('')}
      </div>
      <div class="actions">
        <button id="copy">Copy</button>
        <button id="close">Close</button>
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
