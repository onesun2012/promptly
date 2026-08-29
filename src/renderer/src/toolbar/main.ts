interface ViewData {
  text: string
  app: string
  method: string
  sensitive: string
}

let current: ViewData | null = null

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
      <div class="text">${escapeHtml(data.text.length > 160 ? data.text.slice(0, 160) + '…' : data.text)}</div>
      <div class="actions">
        <button id="copy">Copy</button>
        <button id="close">Close</button>
      </div>
    </div>`
  document.getElementById('copy')?.addEventListener('click', () => {
    if (current) void window.promptly.copySelection(current.text)
  })
  document.getElementById('close')?.addEventListener('click', () => window.promptly.hideToolbar())
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
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
