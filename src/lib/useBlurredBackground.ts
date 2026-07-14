import { useEffect, useRef, useState } from 'react'

/**
 * Pre-difumina la imagen de fondo UNA vez en un canvas y devuelve una URL
 * de ese bitmap estático. Un blur CSS en vivo sobre una imagen a pantalla
 * completa, re-muestreado por cada panel con backdrop-filter, satura el
 * compositor (texto que desaparece, capturas colgadas); un bitmap plano es gratis.
 */
/**
 * Difumina sin ctx.filter (iOS Safari no lo soporta): reduce la imagen a la
 * mitad varias veces y la vuelve a ampliar TAMBIÉN por pasos; el suavizado
 * bilineal acumulado en cada paso aproxima un blur gaussiano.
 * Usa dos canvas alternados: dibujar un canvas sobre sí mismo con regiones
 * solapadas produce artefactos (pixelado/basura) en iOS Safari.
 */
function blurByRescale(
  bitmap: ImageBitmap,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  blurPx: number,
) {
  // Nº de mitades ≈ log2 del radio: blur 4px→2 pasos, 12px→3-4, 30px→5.
  const steps = Math.max(1, Math.min(5, Math.round(Math.log2(Math.max(2, blurPx)))))
  const makeCanvas = (w: number, h: number) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  // Base: el bitmap pasa una vez a canvas; desde ahí todo es canvas→canvas
  // (drawImage de ImageBitmap con recorte también da problemas en iOS).
  const base = makeCanvas(canvas.width, canvas.height)
  const bctx = base.getContext('2d')!
  bctx.imageSmoothingEnabled = true
  bctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  // Bajada: cada mitad se dibuja en un canvas NUEVO del tamaño justo.
  let src: CanvasImageSource = base
  let sw = base.width
  let sh = base.height
  const halves: HTMLCanvasElement[] = []
  let w = canvas.width
  let h = canvas.height
  for (let i = 0; i < steps; i++) {
    w = Math.max(8, Math.round(w / 2))
    h = Math.max(8, Math.round(h / 2))
    const c = makeCanvas(w, h)
    const cctx = c.getContext('2d')!
    cctx.imageSmoothingEnabled = true
    cctx.drawImage(src, 0, 0, sw, sh, 0, 0, w, h)
    halves.push(c)
    src = c
    sw = w
    sh = h
  }
  // Subida: deshace las mitades paso a paso (cada paso vuelve a suavizar).
  for (let i = steps - 2; i >= 0; i--) {
    const target = halves[i]
    const tctx = target.getContext('2d')!
    tctx.imageSmoothingEnabled = true
    tctx.clearRect(0, 0, target.width, target.height)
    tctx.drawImage(src, 0, 0, sw, sh, 0, 0, target.width, target.height)
    src = target
    sw = target.width
    sh = target.height
  }
  // Paso final al canvas de salida (el sangrado evita bordes desvanecidos).
  ctx.imageSmoothingEnabled = true
  const bleed = blurPx
  ctx.drawImage(src, 0, 0, sw, sh, -bleed, -bleed, canvas.width + bleed * 2, canvas.height + bleed * 2)
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
