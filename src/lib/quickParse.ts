import type { Priority, RecurrenceRule } from '../db/types'
import { PRIORITY_LABEL } from './priority'
import { describeRule, WORKDAYS } from './recurrence'
import { LANG, LOCALE, t } from './i18n'

/**
 * Captura rápida inteligente: detecta en el texto fecha, hora, recurrencia y
 * etiquetas (#tag), los extrae y deja el título limpio. Entiende español e
 * inglés a la vez (sin depender del idioma de la interfaz).
 * Ej.: "Hacer ejercicio el lunes a las 8pm #salud" →
 *      título "Hacer ejercicio", lunes 20:00, tag "salud".
 *      "Workout on monday at 8pm #health" → igual en inglés.
 */

export interface QuickParseResult {
  title: string
  dueAt: number | null
  dueHasTime: boolean
  recurrenceRule: RecurrenceRule | null
  /** Prioridad detectada en el texto (!alta/!media/!baja); null si no se escribió. */
  priority: Priority | null
  tagNames: string[]
  /** Resumen legible de lo detectado, para la vista previa bajo el input. */
  chips: string[]
  /** Lista elegida por el usuario; null si no aceptó la sugerencia. */
  listId: string | null
  /**
   * Nombre de lista mencionado en el texto ("Paga tarjeta finanzas"). A
   * diferencia de la fecha no se aplica solo: se ofrece y el usuario decide.
   * `title` es el título sin la mención, para usarlo si la acepta.
   */
  listSuggestion: { id: string; name: string; title: string } | null
}

/** Lista candidata para la detección por nombre. */
export interface QuickParseList {
  id: string
  name: string
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
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
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

const MONTH_NAMES_EN: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

const DAY_ALTERNATION =
  'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday'

/**
 * Prioridad escrita como "!alta" (acepta género, inglés y sinónimos). Las
 * claves van en orden de longitud descendente para que la alternancia del
 * regex no corte "media" quedándose en "medi".
 */
const PRIORITY_WORDS: Record<string, Priority> = {
  urgente: 'high',
  alta: 'high',
  alto: 'high',
  high: 'high',
  media: 'medium',
  medio: 'medium',
  medium: 'medium',
  normal: 'medium',
  baja: 'low',
  bajo: 'low',
  low: 'low',
}

interface RecurrenceUnitMatch {
  unit: RecurrenceRule['unit']
}

function unitFromText(text: string): RecurrenceUnitMatch['unit'] {
  const s = text.toLowerCase()
  if (s.startsWith('semana') || s.startsWith('week')) return 'week'
  if (s.startsWith('mes') || s.startsWith('month')) return 'month'
  if (s.startsWith('año') || s.startsWith('ano') || s.startsWith('year')) return 'year'
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
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
}

const FOLD: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u',
  ñ: 'n', ç: 'c',
}

/** Minúsculas sin acentos, carácter a carácter para no alterar los índices. */
function fold(t: string): string {
  return t.toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => FOLD[c] ?? c)
}

function escapeRe(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Busca el nombre de una lista mencionado como palabra suelta en el texto.
 * Gana el nombre más largo (si hay "Casa" y "Casa de campo", manda el segundo).
 * Devuelve el texto sin la mención para poder limpiar el título.
 */
function matchList(
  s: string,
  lists: QuickParseList[],
): { list: QuickParseList; rest: string } | null {
  const folded = fold(s)
  let best: { list: QuickParseList; start: number; end: number } | null = null
  for (const list of lists) {
    const name = list.name.trim()
    // Nombres de 1–2 letras dispararían falsos positivos constantes.
    if (name.length < 3) continue
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${escapeRe(fold(name)).replace(/\s+/g, '\\s+')})(?=[^\\p{L}\\p{N}]|$)`,
      'u',
    )
    const m = folded.match(re)
    if (!m || m.index === undefined) continue
    const start = m.index + m[1].length
    if (!best || m[2].length > best.end - best.start) {
      best = { list, start, end: start + m[2].length }
    }
  }
  if (!best) return null
  return { list: best.list, rest: `${s.slice(0, best.start)} ${s.slice(best.end)}` }
}

export function parseQuickAdd(raw: string, lists: QuickParseList[] = []): QuickParseResult {
  let s = ` ${raw} `
  const chips: string[] = []
  const tagNames: string[] = []
  let time: { h: number; m: number } | null = null
  let date: Date | null = null
  let rule: RecurrenceRule | null = null
  let ruleWeekday: number | null = null
  let priority: Priority | null = null

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

  // 1b) Prioridad: !alta / !media / !baja (acepta género, inglés y sinónimos).
  // Gana la última escrita, por si el usuario se corrige sobre la marcha.
  const prioWords = Object.keys(PRIORITY_WORDS).sort((a, b) => b.length - a.length).join('|')
  const prioRe = new RegExp(`(?:^|\\s)!(${prioWords})\\b`, 'gi')
  for (const m of s.matchAll(prioRe)) priority = PRIORITY_WORDS[m[1].toLowerCase()]
  s = s.replace(prioRe, ' ')

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
    // Inglés: "at 5", "at 5:30pm", "at 8 in the morning/evening".
    consume(
      /\bat (\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?:\s+in the (morning|afternoon|evening)|\s+at night)?(?=\s|$)/i,
      (m) => {
        let h = Number(m[1]) % 24
        const min = m[2] ? Number(m[2]) : 0
        const mer = (m[3] ?? '').replace(/\./g, '').toLowerCase()
        const part = (m[4] ?? '').toLowerCase()
        const night = /at night/i.test(m[0])
        if (mer.startsWith('p') || part === 'afternoon' || part === 'evening' || night) h = (h % 12) + 12
        if (mer.startsWith('a') || part === 'morning') h = h % 12
        time = { h, m: min }
      },
    )
  }
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
    new RegExp(`\\b(?:cada|todos los|every)\\s+(${DAY_ALTERNATION})s?\\b`, 'i'),
    (m) => {
      ruleWeekday = DAY_NAMES[m[1].toLowerCase()]
      rule = { every: 1, unit: 'week', end: { type: 'never' } }
    },
  )
  if (!rule) {
    consume(/\b(?:every\s+weekdays?|on\s+weekdays|(?:los\s+|cada\s+)?d[ií]as\s+(?:laborables|laborales|h[aá]biles))\b/i, () => {
      rule = { every: 1, unit: 'week', end: { type: 'never' }, daysOfWeek: WORKDAYS }
    })
  }
  if (!rule) {
    consume(/\b(?:cada|every)\s+(\d+)\s+(d[ií]as?|semanas?|meses?|años?|anos?|days?|weeks?|months?|years?)\b/i, (m) => {
      rule = { every: Math.max(1, Number(m[1])), unit: unitFromText(m[2]), end: { type: 'never' } }
    })
  }
  if (!rule) {
    consume(/\b(?:cada|todos los|todas las|every)\s+(d[ií]as?|semanas?|meses?|años?|anos?|days?|weeks?|months?|years?)\b/i, (m) => {
      rule = { every: 1, unit: unitFromText(m[1]), end: { type: 'never' } }
    })
  }
  if (!rule) {
    consume(/\ba diario\b|\bdiariamente\b|\bdaily\b/i, () => {
      rule = { every: 1, unit: 'day', end: { type: 'never' } }
    })
  }
  if (!rule) {
    consume(/\b(weekly|monthly|yearly)\b/i, (m) => {
      rule = { every: 1, unit: unitFromText(m[1]), end: { type: 'never' } }
    })
  }

  // 4) Fecha
  consume(/\bpasado\s+mañana\b|\b(?:the\s+)?day\s+after\s+tomorrow\b/i, () => {
    date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + 2)
  })
  if (!date) {
    consume(/\bmañana\b|\btomorrow\b/i, () => {
      date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() + 1)
    })
  }
  if (!date) {
    consume(/\bhoy\b|\btoday\b|\btonight\b/i, () => {
      date = new Date()
      date.setHours(0, 0, 0, 0)
    })
  }
  if (!date) {
    consume(
      new RegExp(`\\b(?:el\\s+|este\\s+|pr[oó]ximo\\s+|on\\s+|this\\s+|next\\s+)?(${DAY_ALTERNATION})\\b`, 'i'),
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
    // Inglés: "on march 5", "march 5th", "5th of march", "the 5th of march".
    const monthsEn = Object.keys(MONTH_NAMES_EN).join('|')
    const pick = (day: number, month: number, yearStr?: string): void => {
      const now = new Date()
      const year = yearStr ? Number(yearStr) : now.getFullYear()
      const d = new Date(year, month, day)
      if (!yearStr && d.getTime() < now.setHours(0, 0, 0, 0)) d.setFullYear(d.getFullYear() + 1)
      date = d
    }
    consume(
      new RegExp(`\\b(?:on\\s+)?(${monthsEn})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
      (m) => pick(Number(m[2]), MONTH_NAMES_EN[m[1].toLowerCase()], m[3]),
    )
    if (!date) {
      consume(
        new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${monthsEn})(?:,?\\s+(\\d{4}))?\\b`, 'i'),
        (m) => pick(Number(m[1]), MONTH_NAMES_EN[m[2].toLowerCase()], m[3]),
      )
    }
  }
  if (!date) {
    consume(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
      const now = new Date()
      let year = m[3] ? Number(m[3]) : now.getFullYear()
      if (year < 100) year += 2000
      // En inglés se escribe mes/día; en español, día/mes.
      const [day, month] = LANG === 'en' ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])]
      const d = new Date(year, month - 1, day)
      if (!m[3] && d.getTime() < now.setHours(0, 0, 0, 0)) d.setFullYear(d.getFullYear() + 1)
      date = d
    })
  }
  if (!date) {
    consume(/\bel\s+(\d{1,2})\b|\bon the (\d{1,2})(?:st|nd|rd|th)?\b/, (m) => {
      const now = new Date()
      const d = new Date(now.getFullYear(), now.getMonth(), Number(m[1] ?? m[2]))
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

  // 5) Lista mencionada por su nombre: sólo se sugiere, nunca se aplica sola.
  const listHit = matchList(s, lists)

  // 6) Título limpio: espacios y conectores colgantes.
  const cleanTitle = (text: string): string =>
    text
      .replace(/\s+/g, ' ')
      .replace(/[\s,.;:-]+$/g, '')
      .replace(/^[\s,.;:-]+/g, '')
      .replace(/\s+(el|a|de|para|en|on|at|by|for|in|the)$/i, '')
      .trim()

  const title = cleanTitle(s)

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
      const dayName = t(
        'Sunday Monday Tuesday Wednesday Thursday Friday Saturday',
        'domingo lunes martes miércoles jueves viernes sábado',
      ).split(' ')[ruleWeekday]
      chips.push(`🔁 ${t('every', 'cada')} ${dayName}`)
    } else {
      chips.push(`🔁 ${describeRule(r).toLowerCase()}`)
    }
  }
  if (priority !== null) chips.push(`⚡ ${PRIORITY_LABEL[priority]}`)
  for (const name of tagNames) chips.push(`#${name}`)

  const finalTitle = title || raw.trim()

  return {
    title: finalTitle,
    dueAt,
    dueHasTime,
    recurrenceRule: rule,
    priority,
    tagNames,
    chips,
    listId: null,
    listSuggestion: listHit
      ? {
          id: listHit.list.id,
          name: listHit.list.name,
          // Si el nombre de la lista era todo el texto ("finanzas"), el título
          // sin la mención quedaría vacío: se conserva el original.
          title: cleanTitle(listHit.rest) || finalTitle,
        }
      : null,
  }
}
