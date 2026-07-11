import type { RecurrenceRule } from '../db/types'
import { describeRule } from './recurrence'

/**
 * Captura rápida inteligente: detecta en el texto fecha, hora, recurrencia y
 * etiquetas (#tag), los extrae y deja el título limpio.
 * Ej.: "Hacer ejercicio el lunes a las 8pm #salud" →
 *      título "Hacer ejercicio", lunes 20:00, tag "salud".
 */

export interface QuickParseResult {
  title: string
  dueAt: number | null
  dueHasTime: boolean
  recurrenceRule: RecurrenceRule | null
  tagNames: string[]
  /** Resumen legible de lo detectado, para la vista previa bajo el input. */
  chips: string[]
}

const DAY_NAMES: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
}

const MONTH_NAMES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
}

const DAY_ALTERNATION = 'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo'

interface RecurrenceUnitMatch {
  unit: RecurrenceRule['unit']
}

function unitFromText(text: string): RecurrenceUnitMatch['unit'] {
  const t = text.toLowerCase()
  if (t.startsWith('semana')) return 'week'
  if (t.startsWith('mes')) return 'month'
  if (t.startsWith('año') || t.startsWith('ano')) return 'year'
  return 'day'
}

/** Próximo día de la semana (hoy cuenta si coincide). */
function nextWeekday(dow: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7))
  return d
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
}

export function parseQuickAdd(raw: string): QuickParseResult {
  let s = ` ${raw} `
  const chips: string[] = []
  const tagNames: string[] = []
  let time: { h: number; m: number } | null = null
  let date: Date | null = null
  let rule: RecurrenceRule | null = null
  let ruleWeekday: number | null = null

  const consume = (re: RegExp, handler: (m: RegExpMatchArray) => void): void => {
    const m = s.match(re)
    if (!m) return
    handler(m)
    s = s.replace(re, ' ')
  }

  // 1) Etiquetas: #nombre
  for (const m of s.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)) {
    tagNames.push(m[1])
  }
  s = s.replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, ' ')

  // 2) Hora — antes que la fecha, para que "de la mañana" no se confunda con "mañana".
  consume(
    /\ba las? (\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|hs\b|h\b|horas?)?(?:\s+de la (mañana|tarde|noche|madrugada))?/i,
    (m) => {
      let h = Number(m[1]) % 24
      const min = m[2] ? Number(m[2]) : 0
      const mer = (m[3] ?? '').replace(/\./g, '').toLowerCase()
      const parte = (m[4] ?? '').toLowerCase()
      if (mer.startsWith('p') || parte === 'tarde' || parte === 'noche') h = (h % 12) + 12
      if (mer.startsWith('a') || parte === 'mañana' || parte === 'madrugada') h = h % 12
      time = { h, m: min }
    },
  )
  if (!time) {
    consume(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b/i, (m) => {
      let h = Number(m[1]) % 24
      const mer = (m[3] ?? '').replace(/\./g, '').toLowerCase()
      if (mer.startsWith('p')) h = (h % 12) + 12
      if (mer.startsWith('a')) h = h % 12
      time = { h, m: Number(m[2]) }
    })
  }
  if (!time) {
    consume(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)(?=\s|$)/i, (m) => {
      let h = Number(m[1]) % 24
      if (m[2].replace(/\./g, '').toLowerCase().startsWith('p')) h = (h % 12) + 12
      else h = h % 12
      time = { h, m: 0 }
    })
  }

  // 3) Recurrencia
  consume(
    new RegExp(`\\b(?:cada|todos los)\\s+(${DAY_ALTERNATION})\\b`, 'i'),
    (m) => {
      ruleWeekday = DAY_NAMES[m[1].toLowerCase()]
      rule = { every: 1, unit: 'week', end: { type: 'never' } }
    },
  )
  if (!rule) {
    consume(/\bcada\s+(\d+)\s+(d[ií]as?|semanas?|meses?|años?|anos?)\b/i, (m) => {
      rule = { every: Math.max(1, Number(m[1])), unit: unitFromText(m[2]), end: { type: 'never' } }
    })
  }
  if (!rule) {
    consume(/\b(?:cada|todos los|todas las)\s+(d[ií]as?|semanas?|meses?|años?|anos?)\b/i, (m) => {
      rule = { every: 1, unit: unitFromText(m[1]), end: { type: 'never' } }
    })
  }
  if (!rule) {
    consume(/\ba diario\b|\bdiariamente\b/i, () => {
      rule = { every: 1, unit: 'day', end: { type: 'never' } }
    })
  }

  // 4) Fecha
  consume(/\bpasado\s+mañana\b/i, () => {
    date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + 2)
  })
  if (!date) {
    consume(/\bmañana\b/i, () => {
      date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() + 1)
    })
  }
  if (!date) {
    consume(/\bhoy\b/i, () => {
      date = new Date()
      date.setHours(0, 0, 0, 0)
    })
  }
  if (!date) {
    consume(
      new RegExp(`\\b(?:el\\s+|este\\s+|pr[oó]ximo\\s+)?(${DAY_ALTERNATION})\\b`, 'i'),
      (m) => {
        date = nextWeekday(DAY_NAMES[m[1].toLowerCase()])
      },
    )
  }
  if (!date) {
    consume(
      new RegExp(
        `\\bel\\s+(\\d{1,2})\\s+de\\s+(${Object.keys(MONTH_NAMES).join('|')})(?:\\s+de\\s+(\\d{4}))?\\b`,
        'i',
      ),
      (m) => {
        const now = new Date()
        const month = MONTH_NAMES[m[2].toLowerCase()]
        const year = m[3] ? Number(m[3]) : now.getFullYear()
        const d = new Date(year, month, Number(m[1]))
        if (!m[3] && d.getTime() < now.setHours(0, 0, 0, 0)) d.setFullYear(d.getFullYear() + 1)
        date = d
      },
    )
  }
  if (!date) {
    consume(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
      const now = new Date()
      let year = m[3] ? Number(m[3]) : now.getFullYear()
      if (year < 100) year += 2000
      const d = new Date(year, Number(m[2]) - 1, Number(m[1]))
      if (!m[3] && d.getTime() < now.setHours(0, 0, 0, 0)) d.setFullYear(d.getFullYear() + 1)
      date = d
    })
  }
  if (!date) {
    consume(/\bel\s+(\d{1,2})\b/, (m) => {
      const now = new Date()
      const d = new Date(now.getFullYear(), now.getMonth(), Number(m[1]))
      if (d.getTime() < now.setHours(0, 0, 0, 0)) d.setMonth(d.getMonth() + 1)
      date = d
    })
  }

  // La recurrencia semanal por día ("todos los lunes") fija la primera ocurrencia.
  if (!date && ruleWeekday !== null) date = nextWeekday(ruleWeekday)
  // Hora sin fecha → hoy, o mañana si esa hora ya pasó.
  if (!date && time !== null) {
    const t: { h: number; m: number } = time
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const candidate = new Date(d)
    candidate.setHours(t.h, t.m)
    if (candidate.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    date = d
  }

  let dueAt: number | null = null
  let dueHasTime = false
  if (date !== null) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    if (time !== null) {
      const t: { h: number; m: number } = time
      d.setHours(t.h, t.m)
      dueHasTime = true
    }
    dueAt = d.getTime()
  }

  // 5) Título limpio: espacios y conectores colgantes.
  const title = s
    .replace(/\s+/g, ' ')
    .replace(/[\s,.;:-]+$/g, '')
    .replace(/^[\s,.;:-]+/g, '')
    .replace(/\s+(el|a|de|para|en)$/i, '')
    .trim()

  if (dueAt !== null) {
    chips.push(`📅 ${fmtDate(new Date(dueAt))}`)
    if (dueHasTime) {
      const d = new Date(dueAt)
      chips.push(`⏰ ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    }
  }
  if (rule !== null) {
    const r: RecurrenceRule = rule
    if (ruleWeekday !== null) {
      const dayName = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][ruleWeekday]
      chips.push(`🔁 cada ${dayName}`)
    } else {
      chips.push(`🔁 ${describeRule(r).toLowerCase()}`)
    }
  }
  for (const t of tagNames) chips.push(`#${t}`)

  return {
    title: title || raw.trim(),
    dueAt,
    dueHasTime,
    recurrenceRule: rule,
    tagNames,
    chips,
  }
}
