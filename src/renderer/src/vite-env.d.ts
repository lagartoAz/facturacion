/// <reference types="vite/client" />

// Injected at build time by electron.vite.config.ts (define). Mirrors
// package.json's version so the Settings footer shows the installed version on
// both PC (Electron) and Android (Capacitor uses this same renderer build).
declare const __APP_VERSION__: string

// Injected at build time by electron.vite.config.ts (define). 'pos' = the full
// "Acceso" client (default); 'inventory' = the standalone inventory Android app.
declare const __APP_FLAVOR__: 'pos' | 'inventory'
