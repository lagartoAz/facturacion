import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import InventoryApp from './inventory/InventoryApp'
import { installWebApi } from './platform/web-api'
import { isInventoryApp } from './lib/flavor'
import { initTheme } from './lib/theme'
import './globals.css'

// On Electron the preload already exposed window.api; on Capacitor/web this
// installs the HTTP transport instead. Must run before React reads window.api.
installWebApi()

// Apply the saved light/dark theme before the first paint to avoid a flash.
initTheme()

// The inventory APK boots a dedicated single-purpose UI instead of the full POS.
const Root = isInventoryApp() ? (
  <InventoryApp />
) : (
  <HashRouter>
    <App />
  </HashRouter>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{Root}</React.StrictMode>
)
