/// <reference types="vite/client" />

// Injected at build time by electron.vite.config.ts (define). Mirrors
// package.json's version so the Settings footer shows the installed version on
// both PC (Electron) and Android (Capacitor uses this same renderer build).
declare const __APP_VERSION__: string
