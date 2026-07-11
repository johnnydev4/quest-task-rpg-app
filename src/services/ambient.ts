import type { AmbientSoundId } from '../db/types'

/**
 * Sonidos ambientales generados con Web Audio (sin descargas, funcionan offline):
 * ruido blanco, ruido marrón (más grave) y "lluvia" (marrón filtrado con vaivén suave).
 */

export const AMBIENT_SOUNDS: { id: AmbientSoundId; label: string }[] = [
  { id: 'none', label: 'Ninguno' },
  { id: 'rain', label: 'Lluvia' },
  { id: 'white', label: 'Ruido blanco' },
  { id: 'brown', label: 'Ruido marrón' },
]

let ctx: AudioContext | null = null
let source: AudioBufferSourceNode | null = null
let gainNode: GainNode | null = null
let lfo: OscillatorNode | null = null
/** Pausa manual del usuario: mientras esté activa, el motor Pomodoro no rearranca el ambiente. */
let suspended = false

export function setAmbientSuspended(value: boolean): void {
  suspended = value
  if (value) stopAmbient()
}

export function isAmbientSuspended(): boolean {
  return suspended
}

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function makeNoiseBuffer(audio: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const seconds = 4
  const buffer = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    if (kind === 'white') {
      data[i] = white * 0.3
    } else {
      // Integración con fuga → espectro 1/f² (ruido marrón, suave y grave).
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
  }
  return buffer
}

export function startAmbient(id: AmbientSoundId, volume: number): void {
  stopAmbient()
  if (id === 'none' || volume <= 0 || suspended) return
  const audio = getCtx()
  if (!audio) return

  source = audio.createBufferSource()
  source.buffer = makeNoiseBuffer(audio, id === 'white' ? 'white' : 'brown')
  source.loop = true

  gainNode = audio.createGain()
  gainNode.gain.value = Math.min(1, volume) * 0.5

  if (id === 'rain') {
    const lowpass = audio.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 900
    // Vaivén lento de intensidad para que "respire" como lluvia real.
    lfo = audio.createOscillator()
    lfo.frequency.value = 0.15
    const lfoGain = audio.createGain()
    lfoGain.gain.value = 0.12
    lfo.connect(lfoGain)
    lfoGain.connect(gainNode.gain)
    lfo.start()
    source.connect(lowpass)
    lowpass.connect(gainNode)
  } else {
    source.connect(gainNode)
  }

  gainNode.connect(audio.destination)
  source.start()
}

export function stopAmbient(): void {
  try {
    source?.stop()
    lfo?.stop()
  } catch {
    // ya estaba detenido
  }
  source?.disconnect()
  gainNode?.disconnect()
  lfo?.disconnect()
  source = null
  gainNode = null
  lfo = null
}
