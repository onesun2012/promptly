// Floating ball: whole ball is a native drag region; the inner mark is
// click-to-open-chat and right-click opens the context menu (via main).

const mark = document.querySelector('.mark')

mark?.addEventListener('click', () => {
  window.promptly.ballOpenChat()
})

mark?.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  const me = e as MouseEvent
  window.promptly.ballMenu({ x: Math.round(me.x), y: Math.round(me.y) })
})
