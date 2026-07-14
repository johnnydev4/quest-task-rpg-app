import { useEffect, useRef, useState } from 'react'

/**
 * Pre-difumina la imagen de fondo UNA vez en un canvas y devuelve una URL
 * de ese bitmap estático. Un blur CSS en vivo sobre una imagen a pantalla
 * completa, re-muestreado por cada panel con backdrop-filter, satura el
 * compositor (texto que desaparece, capturas colgadas); un bitmap plano es gratis.
 */
/**
 * Difumina sin ctx.filter (iOS Safari no lo soporta): reduce la imagen en
 * pasos a la mitad y la vuelve a ampliar; el suavizado bilineal de cada paso
 * acumula un desenfoque muy parecido a un blur gaussiano.
 */
function blurByRescale(
  bitmap: ImageBitmap,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  blurPx: number,
) {
  // Nº de mitades ≈ log2 del radio: blur 4px→2 pasos, 12px→3-4, 30px→5.
  const steps = Math.max(1, Math.min(5, Math.round(Math.log2(Math.max(2, blurPx)))))
  const tmp = document.createElement('canvas')
  tmp.width = canvas.width
  tmp.height = canvas.height
  const tctx = tmp.getContext('2d')!
  tctx.imageSmoothingEnabled = true
  // Primera bajada: el bitmap completo a la mitad del canvas.
  let w = Math.max(8, Math.round(canvas.width / 2))
  let h = Math.max(8, Math.round(canvas.height / 2))
  tctx.drawImage(bitmap, 0, 0, w, h)
  // Mitades sucesivas dentro del mismo canvas temporal.
  for (let i = 1; i < steps; i++) {
    const nw = Math.max(8, Math.round(w / 2))
    const nh = Math.max(8, Math.round(h / 2))
    tctx.drawImage(tmp, 0, 0, w, h, 0, 0, nw, nh)
    w = nw
    h = nh
  }
  // Subida final con suavizado (el sangrado evita bordes desvanecidos)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const bleed = blurPx
  ctx.drawImage(tmp, 0, 0, w, h, -bleed, -bleed, canvas.width + bleed * 2, canvas.height + bleed * 2)
}

async function makeBlurred(blob: Blob, blurPx: number): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    const maxW = 1600
    const scale = Math.min(1, maxW / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return URL.createObjectURL(blob)
    if (blurPx <= 0) {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    } else if (typeof ctx.filter === 'string') {
      ctx.filter = `blur(${blurPx}px)`
      // Dibuja con sangrado para que el blur no deje bordes desvanecidos.
      const bleed = blurPx * 2
      ctx.drawImage(bitmap, -bleed, -bleed, canvas.width + bleed * 2, canvas.height + bleed * 2)
    } else {
      // iOS Safari: sin ctx.filter → difuminado por re-escalado.
      blurByRescale(bitmap, canvas, ctx, blurPx)
    }
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return URL.createObjectURL(out ?? blob)
  } finally {
    bitmap.close()
  }
}

export function useBlurredBackground(blob: Blob | null, blurPx: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  // URL que se está mostrando ahora mismo; la conservamos hasta tener el reemplazo.
  const currentUrl = useRef<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      if (currentUrl.current) {
        URL.revokeObjectURL(currentUrl.current)
        currentUrl.current = null
      }
      return
    }
    let cancelled = false
    // Pequeño debounce: el slider de difusión no regenera en cada pixel.
    const timer = setTimeout(async () => {
      let objectUrl: string
      try {
        objectUrl = await makeBlurred(blob, blurPx)
      } catch {
        objectUrl = URL.createObjectURL(blob)
      }
      if (cancelled) {
        // Esta difusión ya no interesa y su bitmap nunca se mostró: se descarta.
        URL.revokeObjectURL(objectUrl)
        return
      }
      // Reemplazo atómico: recién ahora que la nueva imagen está lista revocamos
      // la anterior. Así NUNCA hay un instante con la URL mostrada ya revocada
      // (en iOS Safari eso hacía desaparecer el fondo al mover la difusión).
      const previous = currentUrl.current
      currentUrl.current = objectUrl
      setUrl(objectUrl)
      if (previous) URL.revokeObjectURL(previous)
    }, 150)
    // La limpieza solo cancela el trabajo pendiente; no toca la URL visible.
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [blob, blurPx])

  // Al desmontar, libera la última URL (evita fuga de memoria).
  useEffect(() => {
    return () => {
      if (currentUrl.current) {
        URL.revokeObjectURL(currentUrl.current)
        currentUrl.current = null
      }
    }
  }, [])

  return url
}
