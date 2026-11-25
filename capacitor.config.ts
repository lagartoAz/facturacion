import type { CapacitorConfig } from '@capacitor/cli'

// Android packaging for the "Acceso" (client) terminal. The web assets are the
// same renderer build produced by electron-vite (out/renderer). The role is
// decided at runtime (window.api -> role:'client'), so no separate web build.
//
// androidScheme 'http' + cleartext lets the WebView (origin http://localhost)
// call the LAN server over plain HTTP (http://<ip>:47600/rpc) without being
// blocked as mixed content.
// appId/appName are env-driven so the same repo can package two coexisting APKs:
// the default "Acceso" client and the "Inventario" app (APP_ID/APP_NAME set by the
// android:inventory build script). cap sync writes these into strings.xml.
const config: CapacitorConfig = {
  appId: process.env.APP_ID ?? 'com.facturacion.acceso',
  appName: process.env.APP_NAME ?? 'Facturacion Acceso',
  webDir: 'out/renderer',
  server: {
    androidScheme: 'http',
    cleartext: true
  }
}

export default config
