/**
 * Internacionalización mínima (inglés / español).
 *
 * El idioma se decide UNA vez al cargar y se guarda en localStorage (es una
 * preferencia del dispositivo, como el modo demo). Cambiarlo recarga la página:
 * así todos los textos —incluidos los que se calculan a nivel de módulo— se
 * regeneran sin tener que suscribir cada componente a un store.
 *
 * Los textos se escriben en línea con `t('English', 'Español')`: con sólo dos
 * idiomas evita mantener un diccionario de claves aparte y el compilador nunca
 * deja un texto sin traducir.
 */
export type Lang = 'en' | 'es'

const KEY = 'quest-lang'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
]

function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'es'
}

function detect(): Lang {
  if (typeof window === 'undefined') return 'en'
  try {
    // `?lang=es` en la URL fija el idioma (útil para compartir la demo en español).
    const fromUrl = new URLSearchParams(window.location.search).get('lang')
    if (isLang(fromUrl)) {
      localStorage.setItem(KEY, fromUrl)
      return fromUrl
    }
    const stored = localStorage.getItem(KEY)
    if (isLang(stored)) return stored
  } catch {
    /* sin localStorage: idioma por defecto */
  }
  return 'en'
}

/** Idioma activo de esta carga de la página. Inglés por defecto. */
export const LANG: Lang = detect()

/** Locale para Intl / localeCompare. */
export const LOCALE = LANG === 'es' ? 'es' : 'en'

if (typeof document !== 'undefined') {
  document.documentElement.lang = LANG
  // index.html trae el título en inglés (idioma por defecto).
  if (LANG === 'es') document.title = 'Quest — Tareas RPG'
}

/** Devuelve el texto en el idioma activo. */
export function t(en: string, es: string): string {
  return LANG === 'es' ? es : en
}

/** Elige entre dos valores cualesquiera según el idioma (listas, objetos…). */
export function tv<T>(en: T, es: T): T {
  return LANG === 'es' ? es : en
}

/** Plural sencillo: `plural(n, 'task', 'tasks')` (sin el número). */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/**
 * Cambia el idioma y recarga. En la demo se vuelve a sembrar el contenido de
 * ejemplo en el nuevo idioma (la marca de sembrado incluye el idioma).
 */
export function setLang(lang: Lang, opts: { reseedDemo?: boolean } = {}): void {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('lang')
  if (opts.reseedDemo) url.searchParams.set('demo', '1')
  window.location.href = url.pathname + url.search + url.hash
}
