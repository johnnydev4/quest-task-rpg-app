import { useRef, useState, type ReactNode } from 'react'
import type { ThemeMode } from '../../db/types'
import { updateSettings } from '../../db/repo/settings'
import { useSettings } from '../../lib/useSettings'
import { COMPLETION_SOUNDS, playCompletion } from '../../lib/sound'
import { ACCENT_PRESETS } from '../../lib/theme'
import { exportData, importData } from '../../services/backup'
import { cloudConfigured } from '../../services/supabase'
import { Modal } from '../ui/Modal'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line/5 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">{title}</h3>
      {children}
    </section>
  )
}

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'dark', label: 'Oscuro' },
  { id: 'light', label: 'Claro' },
  { id: 'system', label: 'Sistema' },
]

const numClass =
  'w-16 rounded-lg border border-line/10 bg-surface-700 px-2 py-1.5 text-center text-sm text-ink outline-none focus:border-accent-500/60'

export function SettingsModal({
  onClose,
  onOpenAccount,
}: {
  onClose: () => void
  onOpenAccount: () => void
}) {
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const [dataMsg, setDataMsg] = useState<string | null>(null)
  // ¿El acento actual es un color libre (ninguno de los 6 predefinidos)?
  const isCustomAccent = !ACCENT_PRESETS.some(
    (p) => p.color.toLowerCase() === settings.accentColor.toLowerCase(),
  )

  return (
    <Modal title="Ajustes" onClose={onClose}>
      <div className="space-y-5">
        <Section title="Cuenta">
          <button
            onClick={() => {
              onClose()
              onOpenAccount()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-line/10 px-4 py-3 text-left transition-colors hover:bg-ink/5"
          >
            <span>
              <span className="block text-sm font-medium text-ink">Cuenta y sincronización</span>
              <span className="text-xs text-ink-faint">
                {cloudConfigured ? 'Multi-dispositivo con Supabase' : 'Opcional — la app es 100% local'}
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-ink-faint" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </Section>

        <Section title="Apariencia">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
            {THEME_MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={settings.theme === m.id}
                onClick={() => updateSettings({ theme: m.id })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  settings.theme === m.id
                    ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                    : 'border-line/10 text-ink-muted hover:bg-ink/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.color}
                onClick={() => updateSettings({ accentColor: p.color })}
                aria-label={`Acento ${p.name}`}
                aria-pressed={settings.accentColor === p.color}
                title={p.name}
                className={`size-8 rounded-full border-2 transition-all ${
                  settings.accentColor.toLowerCase() === p.color ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: p.color }}
              />
            ))}
            <label
              className="relative ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted"
              title="Elegir cualquier color"
            >
              <span
                aria-hidden="true"
                className={`size-8 rounded-full border-2 transition-all ${
                  isCustomAccent ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'
                }`}
                style={
                  isCustomAccent
                    ? { background: settings.accentColor }
                    : {
                        background:
                          'conic-gradient(from 0deg, #ef4444, #f59e0b, #facc15, #22c55e, #0ea5e9, #6366f1, #a855f7, #ec4899, #ef4444)',
                      }
                }
              />
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) => updateSettings({ accentColor: e.target.value })}
                aria-label="Color de acento personalizado"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              Libre
            </label>
          </div>

          <div className="space-y-1.5 pt-1">
            <span className="block text-xs text-ink-faint">Color del cristal (Liquid Glass)</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => updateSettings({ glassTint: null })}
                aria-label="Cristal neutro"
                aria-pressed={settings.glassTint === null}
                title="Neutro"
                className={`flex size-8 items-center justify-center rounded-full border-2 bg-surface-700 text-ink-faint transition-all ${
                  settings.glassTint === null ? 'scale-110 border-ink' : 'border-line/15 hover:scale-105'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M5.6 5.6l12.8 12.8" />
                </svg>
              </button>
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.color}
                  onClick={() => updateSettings({ glassTint: p.color })}
                  aria-label={`Cristal ${p.name}`}
                  aria-pressed={settings.glassTint === p.color}
                  title={p.name}
                  className={`size-8 rounded-full border-2 transition-all ${
                    settings.glassTint === p.color ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: p.color, opacity: 0.75 }}
                />
              ))}
              <label className="relative ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted" title="Cualquier color de cristal">
                <span
                  aria-hidden="true"
                  className={`size-8 rounded-full border-2 transition-all ${
                    settings.glassTint !== null && !ACCENT_PRESETS.some((p) => p.color === settings.glassTint)
                      ? 'scale-110 border-ink'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={
                    settings.glassTint !== null && !ACCENT_PRESETS.some((p) => p.color === settings.glassTint)
                      ? { background: settings.glassTint, opacity: 1 }
                      : {
                          background:
                            'conic-gradient(from 0deg, #ef4444, #f59e0b, #facc15, #22c55e, #0ea5e9, #6366f1, #a855f7, #ec4899, #ef4444)',
                          opacity: 0.8,
                        }
                  }
                />
                <input
                  type="color"
                  value={settings.glassTint ?? '#1f2430'}
                  onChange={(e) => updateSettings({ glassTint: e.target.value })}
                  aria-label="Color del cristal personalizado"
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                Libre
              </label>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <span className="block text-xs text-ink-faint">Fondo del área de tareas</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => bgFileRef.current?.click()}
                className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5"
              >
                {settings.bgImage ? 'Cambiar imagen' : 'Subir imagen'}
              </button>
              {settings.bgImage && (
                <button
                  onClick={() => updateSettings({ bgImage: null })}
                  className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-ink/5"
                >
                  Quitar fondo
                </button>
              )}
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Subir imagen de fondo"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 10 * 1024 * 1024) {
                    setDataMsg('La imagen supera los 10 MB')
                  } else {
                    void updateSettings({ bgImage: file })
                  }
                  e.target.value = ''
                }}
              />
            </div>
            {settings.bgImage && (
              <label className="block max-w-xs">
                <span className="mb-1 block text-xs text-ink-faint">Difusión · {settings.bgBlur}px</span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={settings.bgBlur}
                  onChange={(e) => updateSettings({ bgBlur: Number(e.target.value) })}
                  aria-label="Difusión del fondo"
                  className="w-full"
                  style={{ accentColor: 'var(--color-accent-500)' }}
                />
              </label>
            )}
          </div>
        </Section>

        <Section title="Sonido">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Sonidos</p>
              <p className="text-xs text-ink-faint">Completar tareas, level-up y Pomodoro</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.soundEnabled}
              aria-label="Sonidos"
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              className={`h-6 w-11 shrink-0 rounded-full transition-colors ${
                settings.soundEnabled ? 'bg-accent-600' : 'bg-ink/10'
              }`}
            >
              <span
                className={`block size-5 rounded-full bg-white shadow transition-transform ${
                  settings.soundEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <div className={settings.soundEnabled ? 'space-y-3' : 'pointer-events-none space-y-3 opacity-40'}>
            <div className="grid grid-cols-3 gap-2">
              {COMPLETION_SOUNDS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    updateSettings({ completionSound: s.id })
                    playCompletion(s.id, settings.soundVolume)
                  }}
                  aria-pressed={settings.completionSound === s.id}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    settings.completionSound === s.id
                      ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                      : 'border-line/10 text-ink-muted hover:bg-ink/5'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-faint">
                Volumen · {Math.round(settings.soundVolume * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.soundVolume}
                onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
                onPointerUp={() => playCompletion(settings.completionSound, settings.soundVolume)}
                aria-label="Volumen"
                className="w-full"
                style={{ accentColor: 'var(--color-accent-500)' }}
              />
            </label>
          </div>
        </Section>

        <Section title="Pomodoro (minutos)">
          <div className="grid grid-cols-2 gap-3 text-sm text-ink-dim sm:grid-cols-4">
            {(
              [
                ['Foco', 'pomodoroFocusMin', 120],
                ['Descanso', 'pomodoroShortBreakMin', 60],
                ['D. largo', 'pomodoroLongBreakMin', 90],
                ['Cada', 'pomodoroLongBreakEvery', 12],
              ] as const
            ).map(([label, key, max]) => (
              <label key={key} className="space-y-1 text-center">
                <span className="block text-xs text-ink-faint">{label}</span>
                <input
                  type="number"
                  min={1}
                  max={max}
                  value={settings[key]}
                  onChange={(e) =>
                    updateSettings({ [key]: Math.max(1, Math.min(max, Number(e.target.value) || 1)) })
                  }
                  aria-label={label}
                  className={numClass}
                />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint">
            "Cada" = número de focos antes de un descanso largo. Los cambios aplican en la próxima fase.
          </p>
        </Section>

        <Section title="Datos">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void exportData()}
              className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5"
            >
              Exportar respaldo JSON
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5"
            >
              Importar respaldo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              aria-label="Importar respaldo"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const n = await importData(file)
                  setDataMsg(`Importados ${n} registros ✓`)
                } catch (err) {
                  setDataMsg(err instanceof Error ? err.message : 'No se pudo importar')
                }
                e.target.value = ''
              }}
            />
          </div>
          {dataMsg && <p className="text-xs text-accent-300">{dataMsg}</p>}
        </Section>
      </div>
    </Modal>
  )
}
