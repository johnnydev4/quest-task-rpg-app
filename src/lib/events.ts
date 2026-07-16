/** Bus de eventos mínimo para que la capa de datos avise a la UI (sonido, animaciones) sin acoplarse a React. */

export interface CompletionDetail {
  xp: number
  leveledUp: boolean
  newLevel: number
  kind: 'task' | 'subtask' | 'quest' | 'habit'
}

const EVENT = 'quest:completion'

export function emitCompletion(detail: CompletionDetail): void {
  window.dispatchEvent(new CustomEvent<CompletionDetail>(EVENT, { detail }))
}

export function onCompletion(handler: (detail: CompletionDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CompletionDetail>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

/**
 * Aviso de "se abrió un panel de configuración" (detalle de tarea u hoja de
 * hábito): los demás paneles se cierran para que solo haya uno a la vez.
 * `source` identifica a quien lo abre, para que se ignore a sí mismo.
 */
export interface ConfigOpenedDetail {
  source: string
}

const CONFIG_EVENT = 'quest:config-opened'

export function emitConfigOpened(source: string): void {
  window.dispatchEvent(new CustomEvent<ConfigOpenedDetail>(CONFIG_EVENT, { detail: { source } }))
}

export function onConfigOpened(handler: (detail: ConfigOpenedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ConfigOpenedDetail>).detail)
  window.addEventListener(CONFIG_EVENT, listener)
  return () => window.removeEventListener(CONFIG_EVENT, listener)
}

export interface ToastDetail {
  title: string
  body?: string
}

const TOAST_EVENT = 'quest:toast'

export function emitToast(detail: ToastDetail): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }))
}

export function onToast(handler: (detail: ToastDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ToastDetail>).detail)
  window.addEventListener(TOAST_EVENT, listener)
  return () => window.removeEventListener(TOAST_EVENT, listener)
}
