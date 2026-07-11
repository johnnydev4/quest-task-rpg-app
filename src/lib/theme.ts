import type { ThemeMode } from '../db/types'

export const ACCENT_PRESETS = [
  { name: 'Violeta', color: '#8b5cf6' },
  { name: 'Índigo', color: '#6366f1' },
  { name: 'Azul', color: '#3b82f6' },
  { name: 'Esmeralda', color: '#10b981' },
  { name: 'Rosa', color: '#ec4899' },
  { name: 'Ámbar', color: '#f59e0b' },
]

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [258, 0.9, 0.66] // violeta por defecto
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const clamp = (v: number) => Math.min(0.95, Math.max(0.08, v))

/** Deriva la escala 300–700 del color de acento elegido, adaptada al tema. */
function accentScale(accent: string, dark: boolean): Record<string, string> {
  const [h, s, l] = hexToHsl(accent)
  const at = (dl: number) => hslToHex(h, s, clamp(l + dl))
  return dark
    ? {
        '--t-accent-300': at(0.16),
        '--t-accent-400': at(0.08),
        '--t-accent-500': at(0),
        '--t-accent-600': at(-0.08),
        '--t-accent-700': at(-0.15),
      }
    : {
        // En claro, los tonos "de texto" (300) deben ser más oscuros para contrastar.
        '--t-accent-300': at(-0.12),
        '--t-accent-400': at(-0.04),
        '--t-accent-500': at(0),
        '--t-accent-600': at(-0.1),
        '--t-accent-700': at(-0.18),
      }
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches
  return mode === 'dark'
}

/**
 * Tinte del cristal "seguro para el contraste": toma solo el HUE del color
 * elegido y lo aplica a una luminosidad fija según el tema (clara en tema
 * claro, oscura en tema oscuro). Así el panel de cristal siempre conserva su
 * luminosidad —claro sobre claro, oscuro sobre oscuro— y el texto (tinta
 * oscura o clara según el tema) mantiene buen contraste sea cual sea el color.
 */
function safeGlassTint(hex: string, dark: boolean): string {
  const [h, s] = hexToHsl(hex)
  const sat = Math.min(0.55, Math.max(0.22, s))
  const l = dark ? 0.32 : 0.8
  return hslToHex(h, sat, l)
}

/** Aplica tema, acento y tinte del cristal globalmente vía CSS variables (spec §10: instantáneo). */
export function applyTheme(mode: ThemeMode, accent: string, glassTint?: string | null): void {
  const dark = resolveDark(mode)
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  for (const [key, value] of Object.entries(accentScale(accent, dark))) {
    root.style.setProperty(key, value)
  }
  if (glassTint) root.style.setProperty('--t-glass-tint', safeGlassTint(glassTint, dark))
  else root.style.removeProperty('--t-glass-tint')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0f1117' : '#f6f7f9')
}
