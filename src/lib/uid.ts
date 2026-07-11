/**
 * Generador de IDs seguro en cualquier contexto. `crypto.randomUUID()` solo
 * existe en contextos seguros (HTTPS/localhost); al probar por LAN en HTTP
 * (p. ej. desde un iPhone) no está disponible, así que caemos a un UUID v4
 * manual sobre `getRandomValues`, que sí funciona siempre.
 */
export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
