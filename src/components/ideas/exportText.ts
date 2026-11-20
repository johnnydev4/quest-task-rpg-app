import type { IdeaMap, IdeaNode } from '../../db/types'
import { localDateKey } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { findRoot, groupByParent } from './tree'

/**
 * Exportación de los mapas de ideas a texto plano.
 *
 * El formato es una lista indentada (estilo Markdown/outliner) para que se
 * pueda pegar en cualquier sitio —notas, un correo, un issue— y siga leyéndose
 * como el árbol de la app: dos espacios por nivel, un guion por idea, las
 * estrellas detrás y la nota en su propia línea. Se exporta el árbol COMPLETO:
 * las ramas plegadas son un detalle de la vista, no del contenido.
 */

/** Indentación de un nivel. */
const INDENT = '  '

/** Valoración como estrellas (vacía si la idea no está valorada). */
function stars(rating?: number | null): string {
  return rating && rating > 0 ? ` ${'★'.repeat(Math.min(5, rating))}` : ''
}

/** Nombre de archivo seguro a partir del título del mapa. */
function slug(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sin acentos: nombres de archivo portables
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'mapa'
}

/** Un mapa como lista de texto indentada, con su título subrayado de cabecera. */
export function mapToText(map: IdeaMap, nodes: IdeaNode[]): string {
  const mine = nodes.filter((n) => n.mapId === map.id)
  const byParent = groupByParent(mine)
  const root = findRoot(mine)
  const title = (root?.text ?? map.title).trim() || t('Central idea', 'Idea central')

  // Título subrayado + línea en blanco: se lee como una cabecera y la lista
  // queda despegada de ella al pegarla en cualquier sitio.
  const lines: string[] = [title, '='.repeat(Math.max(3, [...title].length)), '']

  const walk = (parentId: string, depth: number): void => {
    for (const node of byParent.get(parentId) ?? []) {
      const pad = INDENT.repeat(depth)
      const text = node.text.trim() || t('(empty idea)', '(idea sin texto)')
      lines.push(`${pad}- ${text}${stars(node.rating)}`)
      // La nota cuelga de su idea, una línea por línea (puede ser multilínea).
      for (const line of (node.note ?? '').split('\n')) {
        if (line.trim()) lines.push(`${pad}${INDENT}· ${line.trim()}`)
      }
      walk(node.id, depth + 1)
    }
  }
  if (root) walk(root.id, 0)

  if (lines.length === 3) lines.push(t('(no branches yet)', '(sin ramas todavía)'))
  return lines.join('\n')
}

/** Varios mapas en un solo texto, separados por una línea en blanco. */
export function mapsToText(maps: IdeaMap[], nodes: IdeaNode[]): string {
  return maps.map((m) => mapToText(m, nodes)).join('\n\n\n')
}

/** Nombre sugerido del .txt de un mapa (o del lote completo si no se pasa). */
export function textFileName(map?: IdeaMap): string {
  const name = map ? slug(map.title) : t('idea-maps', 'mapas-de-ideas')
  return `${name}-${localDateKey()}.txt`
}

/** Descarga el texto como .txt (mismo patrón que el respaldo JSON). */
export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Copia al portapapeles. La API moderna necesita contexto seguro y permiso, así
 * que si falla se recurre al textarea + execCommand (suficiente en móviles y
 * navegadores viejos). Devuelve si se logró, para avisar en la UI.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}
