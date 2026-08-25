// Light/dark theme, persisted per-device in localStorage so each PC/phone keeps
// its own preference. Default is light. Works identically on Electron and the
// Android WebView (both share this renderer bundle).
export type Theme = 'light' | 'dark'

const THEME_KEY = 'facturacion.theme'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Reflect the theme in the DOM by toggling the `.dark` class on <html>. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

/** Persist and apply a theme choice. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // ignore storage failures; still apply for this session
  }
  applyTheme(theme)
}

/** Apply the stored theme on startup (call before React renders). */
export function initTheme(): void {
  applyTheme(getTheme())
}
