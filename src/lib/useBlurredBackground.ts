import { useEffect, useState } from 'react'

/**
 * Pre-difumina la imagen de fondo UNA vez en un canvas y devuelve una URL
 * de ese bitmap estático. Un blur CSS en vivo sobre una imagen a pantalla
 * completa, re-muestreado por cada panel con backdrop-filter, satura el
 * compositor (texto que desaparece, capturas colgadas); un bitmap plano es gratis.
 */
async function makeBlurred(blob: Blob, blurPx: number): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    const maxW = 1600
    const scale = Math.min(1, maxW / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    // Sin soporte de filtros en canvas (Safari viejo): se usa la imagen tal cual.
    if (!ctx || typeof ctx.filter !== 'string') return URL.createObjectURL(blob)
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`
    // Dibuja con sangrado para que el blur no deje bordes desvanecidos.
    const bleed = blurPx * 2
    ctx.drawImage(bitmap, -bleed, -bleed, canvas.width + bleed * 2, canvas.height + bleed * 2)
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return URL.createObjectURL(out ?? blob)
  } finally {
    bitmap.close()
  }
}

export function useBlurredBackground(blob: Blob | null, blurPx: number): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    // Pequeño debounce: el slider de difusión no regenera en cada pixel.
    const timer = setTimeout(async () => {
      try {
        objectUrl = await makeBlurred(blob, blurPx)
      } catch {
        objectUrl = URL.createObjectURL(blob)
      }
      if (cancelled) {
        URL.revokeObjectURL(objectUrl)
      } else {
        setUrl(objectUrl)
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
      // Revocar tras reemplazo es seguro: la imagen ya mostrada no se descarga.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [blob, blurPx])

  return url
}
