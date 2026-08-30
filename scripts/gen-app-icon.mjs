// Generates the app icon from the floating-ball brand mark:
//   build/icon.png (256px) — window/taskbar icon (electron-builder converts
//   it to .ico for the installer/exe)
//   build/tray.png (16px)  — simplified tray glyph
// Zero dependencies: same hand-rolled PNG encoder as gen-tray-icon.mjs.
// Geometry lives in viewBox-48 coordinates (same as ball.html), sampled with
// 4x supersampling per output pixel.
import zlib from 'node:zlib'
import fs from 'node:fs'

const DARK = [0x17, 0x1a, 0x21]
const WHITE = [0xe8, 0xea, 0xed]
const PURPLE = [0x7c, 0x5c, 0xff]

const mix = (a, b, t) => a + (b - a) * t
const mixRGB = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]

// signed distance to rounded-rect outline (negative inside)
function rectSDF(px, py, x0, y0, x1, y1, r) {
  const qx = Math.max(x0 + r - px, 0, px - (x1 - r))
  const qy = Math.max(y0 + r - py, 0, py - (y1 - r))
  return Math.sqrt(qx * qx + qy * qy) - r
}

/** dash test for the selection-box outline: dash 9 on / 5 off by arc length */
function dashedRect(x, y) {
  const x0 = 10, y0 = 10, x1 = 38, y1 = 38, r = 7
  const stroke = 2.4
  const d = Math.abs(rectSDF(x, y, x0, y0, x1, y1, r))
  if (d > stroke / 2) return false
  // arc length along the perimeter from the top-left corner (going clockwise)
  const segs = [
    // [start-point, end-point] straight parts + corner radii
    [x0 + r, y0, x1 - r, y0],
    [x1, y0 + r, x1, y1 - r],
    [x1 - r, y1, x0 + r, y1],
    [x0, y1 - r, x0, y0 + r]
  ]
  const cornerLen = (Math.PI * r) / 2
  const straight = [x1 - x0 - 2 * r, y1 - y0 - 2 * r, x1 - x0 - 2 * r, y1 - y0 - 2 * r]
  let perimeter = 2 * cornerLen + straight.reduce((a, b) => a + b, 0)
  // approximate: use straight-line projection ignoring corner curvature
  let s = 0
  for (let i = 0; i < 4; i++) {
    const [ax, ay, bx, by] = segs[i]
    const vx = bx - ax
    const vy = by - ay
    const len2 = vx * vx + vy * vy
    let t = ((x - ax) * vx + (y - ay) * vy) / len2
    t = Math.max(0, Math.min(1, t))
    const distToSeg = Math.hypot(x - (ax + t * vx), y - (ay + t * vy))
    if (distToSeg < stroke / 2 + r) {
      // near this segment: use its arc-length offset
      s = 0
      for (let j = 0; j < i; j++) s += straight[j] + cornerLen
      s += t * straight[i]
      break
    }
  }
  if (x > x1 - r && y > y1 - r) s += cornerLen * 0 // corners approximated, fine for dashes
  void perimeter
  const period = 14 // 9 on + 5 off (viewBox units)
  const phase = ((s % period) + period) % period
  return phase < 9
}

/** P glyph: stem + top bar + right half-annulus bowl */
function pGlyph(x, y) {
  if (x >= 15 && x <= 18.5 && y >= 17.5 && y <= 32.5) return true
  if (x >= 15 && x <= 26 && y >= 17.5 && y <= 21) return true
  const dx = x - 18.5
  const dy = y - 21.75
  const d = Math.sqrt(dx * dx + dy * dy)
  if (dx >= 0 && d >= 3 && d <= 6.5 && y >= 17.5 && y <= 26) return true
  return false
}

/** 4-point sparkle: two thin crossing diamonds, arm length s, half-width w */
function spark(x, y, cx, cy, s) {
  const dx = Math.abs(x - cx)
  const dy = Math.abs(y - cy)
  const w = 1.4
  return dx / s + dy / w < 1 || dy / s + dx / w < 1
}

/** sample the mark in viewBox coords → [r,g,b,a] with 0..1 alpha.
 * simplified=true drops fine detail (dashed box) and thickens strokes so the
 * mark stays legible at 16–32px (titlebar/taskbar). */
function sample(vx, vy, simplified) {
  const dist = Math.hypot(vx - 24, vy - 24)
  if (dist > 24) return null
  const ring = simplified ? 3.5 : 2.5
  let rgb = DARK
  let a = Math.min(1, 24 - dist) // smooth edge
  if (dist >= 24 - ring) rgb = WHITE // outer ring
  if (!simplified && dashedRect(vx, vy)) rgb = PURPLE
  if (simplified) {
    // bolder P for tiny sizes
    if (vx >= 14 && vx <= 19.5 && vy >= 16.5 && vy <= 33) rgb = WHITE
    if (vx >= 14 && vx <= 27 && vy >= 16.5 && vy <= 22) rgb = WHITE
    const bdx = vx - 19.5
    const bdy = vy - 22.5
    const bd = Math.sqrt(bdx * bdx + bdy * bdy)
    if (bdx >= 0 && bd >= 3.5 && bd <= 8 && vy >= 16.5 && vy <= 27) rgb = WHITE
  } else if (pGlyph(vx, vy)) {
    rgb = WHITE
  }
  if (spark(vx, vy, simplified ? 35 : 36, simplified ? 12 : 11, simplified ? 6.5 : 5.5)) rgb = PURPLE
  return [rgb[0], rgb[1], rgb[2], a]
}

function render(size, simplified = false) {
  const k = 48 / size
  const SS = size <= 32 ? 8 : 4 // more supersampling on tiny sizes
  const img = new Array(size * size).fill(null)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = sample((x + (sx + 0.5) / SS) * k, (y + (sy + 0.5) / SS) * k, simplified)
          if (s) {
            r += s[0]; g += s[1]; b += s[2]; a += s[3]
          }
        }
      }
      const n = SS * SS
      if (a > 0) {
        img[y * size + x] = [
          Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round((a / n) * 255)
        ]
      }
    }
  }
  return img
}

function encodePng(size, img) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = [0]
    for (let x = 0; x < size; x++) {
      const p = img[y * size + x]
      if (p) row.push(p[0], p[1], p[2], p[3])
      else row.push(0, 0, 0, 0)
    }
    rows.push(...row)
  }
  const idat = zlib.deflateSync(Buffer.from(rows))
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    let crc = 0xffffffff
    for (const bb of body) crc = (table[(crc ^ bb) & 0xff] ^ (crc >>> 8)) >>> 0
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([len, body, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/icon.png', encodePng(256, render(256)))
console.log('[gen-app-icon] OK → build/icon.png (256)')

// small variant for window titlebar/taskbar: simplified geometry so it stays
// crisp when Windows scales down to 16px
fs.writeFileSync('build/icon-small.png', encodePng(64, render(64, true)))
console.log('[gen-app-icon] OK → build/icon-small.png (64)')

// tray: same mark, rendered straight at 16px (no supersample needed at that
// size — the SDFs already land on whole pixels)
fs.writeFileSync('build/tray.png', encodePng(16, render(16, true)))
console.log('[gen-app-icon] OK → build/tray.png (16)')
