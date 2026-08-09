import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// APP_ROLE is set by the build scripts: unset/`server` for the primary build
// (owns the database + serves the LAN) and `client` for the "Acceso" build.
const APP_ROLE = process.env.APP_ROLE === 'client' ? 'client' : 'server'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __APP_ROLE__: JSON.stringify(APP_ROLE)
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
    plugins: [react()]
  }
})
