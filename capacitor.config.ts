import type { CapacitorConfig } from '@capacitor/cli'

// Android packaging for the "Acceso" (client) terminal. The web assets are the
// same renderer build produced by electron-vite (out/renderer). The role is
// decided at runtime (window.api -> role:'client'), so no separate web build.
//
// androidScheme 'http' + cleartext lets the WebView (origin http://localhost)
// call the LAN server over plain HTTP (http://<ip>:47600/rpc) without being
// blocked as mixed content.
const config: CapacitorConfig = {
  appId: 'com.facturacion.acceso',
  appName: 'Facturacion Acceso',
  webDir: 'out/renderer',
  server: {
    androidScheme: 'http',
    cleartext: true
  }
}

export default config
