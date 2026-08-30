import '../theme.css'

// Floating ball: the whole ball is interactive. Dragging is manual (main
// process polls the cursor between drag-start/drag-end), a press that never
// moves beyond a few pixels counts as a click (open chat), and right-click
// opens the context menu. No -webkit-app-region, so EVERY pixel is draggable.

const ball = document.querySelector('.ball') as HTMLElement

let down: { x: number; y: number } | null = null
let pressed = false
let dragged = false

ball.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  pressed = true
  dragged = false
  ball.classList.add('dragging')
  down = { x: e.clientX, y: e.clientY }
  window.promptly.windowDragStart()
  e.preventDefault()
})

window.addEventListener('mousemove', (e) => {
  if (!pressed || !down) return
  const dx = e.clientX - down.x
  const dy = e.clientY - down.y
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged = true
})

window.addEventListener('mouseup', (e) => {
  if (!pressed || e.button !== 0) return
  pressed = false
  ball.classList.remove('dragging')
  window.promptly.windowDragEnd()
  if (!dragged && down) {
    // a press that stayed put is a click
    window.promptly.ballOpenChat()
  }
  down = null
})

ball.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  const me = e as MouseEvent
  window.promptly.ballMenu({ x: Math.round(me.x), y: Math.round(me.y) })
})
