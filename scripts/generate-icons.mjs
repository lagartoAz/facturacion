// Generates all app icons from logodelaapp.png:
//  - Electron: resources/icon.png (512x512, used by electron-builder for PC).
//  - Android: mipmap ic_launcher / ic_launcher_round / ic_launcher_foreground
//    at every density (legacy square + round mask + adaptive foreground).
// Run with:  node scripts/generate-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'logodelaapp.png')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
const resDir = join(root, 'android/app/src/main/res')

// Square legacy icon: fit the logo on a white background.
async function legacy(size, out) {
  await sharp(SRC)
    .resize(size, size, { fit: 'contain', background: WHITE })
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(out)
}

// Round icon: cover + circular alpha mask.
async function round(size, out) {
  const base = await sharp(SRC)
    .resize(size, size, { fit: 'cover' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer()
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  )
  await sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(out)
}

// Adaptive foreground: logo at ~66% (safe zone) on a transparent canvas.
async function foreground(size, out) {
  const inner = Math.round(size * 0.66)
  const pad = Math.round((size - inner) / 2)
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: CLEAR })
    .png()
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: CLEAR } })
    .composite([{ input: logo, top: pad, left: pad }])
    .png()
    .toFile(out)
}

async function main() {
  // Electron / PC icon.
  mkdirSync(join(root, 'resources'), { recursive: true })
  await sharp(SRC)
    .resize(512, 512, { fit: 'contain', background: CLEAR })
    .png()
    .toFile(join(root, 'resources/icon.png'))

  // Android launcher icons.
  for (const [density, size] of Object.entries(LAUNCHER)) {
    const dir = join(resDir, `mipmap-${density}`)
    mkdirSync(dir, { recursive: true })
    await legacy(size, join(dir, 'ic_launcher.png'))
    await round(size, join(dir, 'ic_launcher_round.png'))
  }
  for (const [density, size] of Object.entries(FOREGROUND)) {
    const dir = join(resDir, `mipmap-${density}`)
    mkdirSync(dir, { recursive: true })
    await foreground(size, join(dir, 'ic_launcher_foreground.png'))
  }
  console.log('Icons generated: resources/icon.png + android mipmaps (launcher/round/foreground).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
