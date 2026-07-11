import type { CompletionSoundId } from '../db/types'

/**
 * Sonidos sintetizados con Web Audio API: sin assets que descargar,
 * funcionan offline y pesan cero. Cortos, orgánicos y de baja intensidad (ASMR).
 */

export const COMPLETION_SOUNDS: { id: CompletionSoundId; label: string }[] = [
  { id: 'pop', label: 'Pop suave' },
  { id: 'chime', label: 'Campanita' },
  { id: 'click', label: 'Click nítido' },
]

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface Tone {
  type: OscillatorType
  from: number
  to?: number
  delay?: number
  dur: number
  peak: number
}

function playTone(audio: AudioContext, tone: Tone): void {
  const t0 = audio.currentTime + (tone.delay ?? 0)
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = tone.type
  osc.frequency.setValueAtTime(tone.from, t0)
  if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.dur)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(tone.peak, t0 + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + tone.dur + 0.05)
}

export function playCompletion(id: CompletionSoundId, volume: number): void {
  const audio = getCtx()
  if (!audio || volume <= 0) return
  const v = Math.min(1, volume)
  if (id === 'pop') {
    playTone(audio, { type: 'sine', from: 520, to: 165, dur: 0.13, peak: v * 0.5 })
    playTone(audio, { type: 'sine', from: 950, to: 420, dur: 0.06, peak: v * 0.15 })
  } else if (id === 'chime') {
    playTone(audio, { type: 'sine', from: 1046.5, dur: 0.5, peak: v * 0.25 })
    playTone(audio, { type: 'sine', from: 1568, delay: 0.015, dur: 0.35, peak: v * 0.1 })
  } else {
    playTone(audio, { type: 'triangle', from: 1900, dur: 0.045, peak: v * 0.4 })
    playTone(audio, { type: 'square', from: 3800, dur: 0.02, peak: v * 0.06 })
  }
}

let lastScrollAt = 0

/**
 * Tic ASMR suave al desplazar el calendario. Muy bajo y con tono ligeramente
 * aleatorio para sensación orgánica; limitado a uno cada ~130 ms para que un
 * scroll continuo no ametralle. Mudo hasta el primer gesto (política de autoplay).
 */
export function playScrollTick(volume: number): void {
  const now = performance.now()
  if (now - lastScrollAt < 130) return
  lastScrollAt = now
  const audio = getCtx()
  if (!audio || volume <= 0) return
  const v = Math.min(1, volume) * 0.05
  const base = 600 + Math.random() * 140
  playTone(audio, { type: 'sine', from: base, to: base * 0.78, dur: 0.038, peak: v })
}

let lastHoverAt = 0

/**
 * Tic ASMR muy leve al pasar el mouse por una tarea (solo escritorio).
 * Limitado a uno cada 90 ms para que recorrer la lista no ametralle.
 * Nota: hasta el primer clic del usuario, el navegador mantiene el audio
 * suspendido (política de autoplay), así que los primeros hovers son mudos.
 */
export function playHoverTick(volume: number): void {
  const now = performance.now()
  if (now - lastHoverAt < 90) return
  lastHoverAt = now
  const audio = getCtx()
  if (!audio || volume <= 0) return
  const v = Math.min(1, volume) * 0.1
  playTone(audio, { type: 'sine', from: 940, to: 760, dur: 0.055, peak: v })
}

/** Aviso suave de cambio de fase del Pomodoro (foco ⇄ descanso). */
export function playPhaseChange(volume: number): void {
  const audio = getCtx()
  if (!audio || volume <= 0) return
  const v = Math.min(1, volume)
  playTone(audio, { type: 'sine', from: 660, dur: 0.35, peak: v * 0.25 })
  playTone(audio, { type: 'sine', from: 880, delay: 0.18, dur: 0.45, peak: v * 0.2 })
}

/** Arpegio ascendente (C-E-G-C) con brillo final: la recompensa "especial" del level-up. */
export function playLevelUp(volume: number): void {
  const audio = getCtx()
  if (!audio || volume <= 0) return
  const v = Math.min(1, volume)
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => {
    playTone(audio, { type: 'sine', from: freq, delay: i * 0.09, dur: 0.45, peak: v * 0.22 })
  })
  playTone(audio, { type: 'sine', from: 2093, delay: 0.36, dur: 0.55, peak: v * 0.08 })
}
