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
