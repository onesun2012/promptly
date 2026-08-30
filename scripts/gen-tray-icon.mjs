// Generates build/tray.png — a 16x16 purple rounded dot for the system tray.
// Zero dependencies: hand-rolled PNG chunks + zlib deflate.
import zlib from 'node:zlib'
import fs from 'node:fs'

const SIZE = 16
const rows = []
for (let y = 0; y < SIZE; y++) {
  const row = [0] // filter: none
  for (let x = 0; x < SIZE; x++) {
    // circle mask with 1px inset
    const dx = x - (SIZE - 1) / 2
    const dy = y - (SIZE - 1) / 2
    const inside = dx * dx + dy * dy <= (SIZE / 2 - 1) ** 2
    if (inside) {
      row.push(0x7c, 0x5c, 0xff, 0xff) // accent purple
    } else {
      row.push(0, 0, 0, 0)
    }
  }
  rows.push(...row)
}

const raw = Buffer.from(rows)
const idat = zlib.deflateSync(raw)

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([len, body, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
])

fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/tray.png', png)
console.log('[gen-tray-icon] OK → build/tray.png')
