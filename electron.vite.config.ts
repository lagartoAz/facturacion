import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// APP_ROLE is set by the build scripts: unset/`server` for the primary build
// (owns the database + serves the LAN) and `client` for the "Acceso" build.
const APP_ROLE = process.env.APP_ROLE === 'client' ? 'client' : 'server'

// Single source of truth for the version shown in the UI (Settings footer) on
// both PC (Electron) and Android (Capacitor uses this same renderer build).
// package.json's version is what the GitHub release/tag is cut from, so injecting
// it here keeps the displayed version in lockstep with the GitHub release.
const APP_VERSION = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __APP_ROLE__: JSON.stringify(APP_ROLE),
      __APP_VERSION__: JSON.stringify(APP_VERSION)
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION)
    },
    plugins: [react()]
  }
})
