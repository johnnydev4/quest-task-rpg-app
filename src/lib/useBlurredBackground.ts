import { useEffect, useRef, useState } from 'react'

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
