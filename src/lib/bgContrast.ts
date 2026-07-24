/**
 * Contraste adaptativo del fondo personalizado.
 *
 * Una foto clara bajo el tema oscuro (o al revés) deja el texto casi ilegible:
 * el velo fijo del fondo y el cristal translúcido no tapan lo suficiente. Aquí
 * se mide la luminancia REAL de la imagen ya difuminada y se ajustan tres
 * palancas, de la menos invasiva a la más:
 *   1. `--t-bg-scrim`  — opacidad del velo sobre la imagen.
 *   2. `--t-glass-op`  — multiplicador de opacidad de los paneles de cristal.
 *   3. `--t-ink-lift`  — cuánto se acercan las tintas apagadas a la tinta plena.
 *
 * Con un fondo que ya acompaña al tema, las tres quedan en su valor base (el
 * fondo incluso se ve MÁS que antes); solo se endurecen cuando hace falta.
 */

export type BgLuminance = {
  /** Luminancia media (0–1). */
  mean: number
  /** Percentil 88: cuán claras son las zonas más claras (lo que ataca al tema oscuro). */
  high: number
  /** Percentil 12: cuán oscuras son las zonas más oscuras (lo que ataca al tema claro). */
  low: number
}

/** Canal sRGB → lineal, para luminancia relativa (WCAG). */
function toLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/**
 * Mide la luminancia del fondo sobre una miniatura de 32×32. La imagen ya va
 * difuminada, así que no hay detalle que perder y el muestreo es instantáneo.
 */
export function measureLuminance(source: CanvasImageSource): BgLuminance | null {
  const n = 32
  const small = document.createElement('canvas')
  small.width = n
  small.height = n
  const ctx = small.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  let data: Uint8ClampedArray
  try {
    ctx.drawImage(source, 0, 0, n, n)
    data = ctx.getImageData(0, 0, n, n).data
  } catch {
    return null
  }
  const lums: number[] = []
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const l =
      0.2126 * toLinear(data[i]) + 0.7152 * toLinear(data[i + 1]) + 0.0722 * toLinear(data[i + 2])
    lums.push(l)
    sum += l
  }
  if (lums.length === 0) return null
  lums.sort((a, b) => a - b)
  const at = (p: number) => lums[Math.round(p * (lums.length - 1))]
  return { mean: sum / lums.length, high: at(0.88), low: at(0.12) }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Luminancia de --t-surface-900 en cada tema (el color del velo). */
const SCRIM_LUM = { dark: 0.006, light: 0.9 }
/** Luminancia máxima (oscuro) / mínima (claro) que el sustrato puede tener sin comerse el texto. */
const TARGET_LUM = { dark: 0.09, light: 0.7 }

/** Aplica el ajuste de contraste como variables CSS globales. `null` = sin imagen de fondo. */
export function applyBackgroundContrast(lum: BgLuminance | null, dark: boolean): void {
  const root = document.documentElement
  if (!lum) {
    root.style.removeProperty('--t-bg-scrim')
    root.style.removeProperty('--t-glass-op')
    root.style.removeProperty('--t-ink-lift')
    return
  }

  // Hostilidad (0–1): cuánto se aleja el fondo de la luminosidad que el tema espera.
  // En oscuro pesan las zonas claras; en claro, las oscuras.
  const worst = dark ? lum.high : lum.low
  const hostile = dark ? 0.65 * worst + 0.35 * lum.mean : 1 - (0.65 * worst + 0.35 * lum.mean)

  // 1) Velo: base baja (el fondo se luce) y sube hasta casi tapar si pelea con el tema.
  const scrim = clamp(0.28 + hostile * 0.62, 0.3, 0.85)
  root.style.setProperty(
    '--t-bg-scrim',
    `color-mix(in srgb, var(--t-surface-900) ${Math.round(scrim * 100)}%, transparent)`,
  )

  // 2) Lo que queda tras el velo es el sustrato real bajo el cristal.
  const eff = worst * (1 - scrim) + (dark ? SCRIM_LUM.dark : SCRIM_LUM.light) * scrim
  const drift = Math.max(0, dark ? eff - TARGET_LUM.dark : TARGET_LUM.light - eff)

  // Cristal más macizo (tope 1.5×: por encima deja de parecer cristal).
  root.style.setProperty('--t-glass-op', clamp(1 + drift * 3, 1, 1.5).toFixed(3))
  // 3) Y las tintas apagadas se acercan a la tinta plena para recuperar el contraste.
  root.style.setProperty('--t-ink-lift', `${Math.round(clamp(drift * 180, 0, 45))}%`)
}
