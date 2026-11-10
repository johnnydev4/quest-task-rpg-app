import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { ThemeMode } from '../../db/types'
import { updateSettings } from '../../db/repo/settings'
import { setBgImage } from '../../db/repo/media'
import { useSettings } from '../../lib/useSettings'
import { COMPLETION_SOUNDS, playCompletion } from '../../lib/sound'
import { ACCENT_PRESETS, FONT_SCALES } from '../../lib/theme'
import { exportData, importData } from '../../services/backup'
import { notificationService } from '../../services/notifications'
import { cloudConfigured } from '../../services/supabase'
import { webPush, webPushConfigured } from '../../services/webPush'
import { Modal } from '../ui/Modal'
import { DEMO_MODE } from '../../lib/demoMode'
import { LANG, LANGS, setLang, t } from '../../lib/i18n'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line/5 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Avisos con la app CERRADA (Web Push). Sin esto, los recordatorios solo suenan
 * mientras Quest está abierta: quien los dispara es un temporizador de la
 * pestaña, que el sistema mata al cerrar la app. Con push suscrito, es el
 * servidor quien avisa a la hora exacta aunque el móvil esté bloqueado.
 */
function BackgroundPushSettings() {
  const [active, setActive] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void webPush.isActive().then((v) => alive && setActive(v))
    return () => {
      alive = false
    }
  }, [])

  async function toggle() {
    setBusy(true)
    setError(null)
    if (active) {
      await webPush.unsubscribe()
      setActive(false)
    } else {
      const result = await webPush.subscribe()
      if (!result.ok) setError(result.error ?? t("Couldn't enable it", 'No se pudo activar'))
      setActive(result.ok)
    }
    setBusy(false)
  }

  if (!webPushConfigured || !webPush.isSupported()) {
    return (
      <p className="text-[0.6875rem] text-ink-faint">
        {t(
          'Alerts only arrive while Quest is open. To get them with the app closed you need to set up the cloud and the push keys (see ',
          'Los avisos llegan solo con Quest abierta. Para recibirlos con la app cerrada hay que configurar la nube y las claves de push (ver ',
        )}
        <code>supabase/PUSH.md</code>).
      </p>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-line/10 glass-input p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-ink">{t('Alerts with the app closed', 'Avisos con la app cerrada')}</span>
          <span className="block text-[0.6875rem] text-ink-muted">
            {active
              ? t(
                  "This device will get reminders even when you're not using Quest.",
                  'Este dispositivo recibirá los recordatorios aunque no estés usando Quest.',
                )
              : t('Right now they only ring while Quest is open.', 'Ahora mismo solo suenan si tienes Quest abierta.')}
          </span>
        </span>
        <button
          onClick={() => void toggle()}
          disabled={busy || active === null}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            active
              ? 'border border-line/10 text-ink-dim hover:bg-ink/5'
              : 'bg-accent-600 text-on-accent hover:bg-accent-500'
          }`}
        >
          {busy ? t('One moment…', 'Un momento…') : active ? t('Turn off', 'Desactivar') : t('Turn on', 'Activar')}
        </button>
      </div>
      {error && <p className="text-[0.6875rem] text-warn">{error}</p>}
    </div>
  )
}

/**
 * Notificaciones del sistema (recordatorios, hábitos y fases de pomodoro).
 * En iPhone/iPad solo existen con la app INSTALADA en la pantalla de inicio
 * (iOS 16.4+); desde Safari a secas la API ni siquiera está disponible.
 */
function NotificationsSettings() {
  const [permission, setPermission] = useState(notificationService.permission())
  const [testSent, setTestSent] = useState(false)
  const ios = notificationService.isIos()
  const standalone = notificationService.isStandalone()

  async function enable() {
    await notificationService.requestPermission()
    setPermission(notificationService.permission())
  }

  function sendTest() {
    void notificationService.notify(
      t('🔔 Notifications on', '🔔 Notificaciones activas'),
      t('This is how your reminders and alerts will look.', 'Así se verán tus recordatorios y avisos.'),
    )
    setTestSent(true)
  }

  // iPhone sin instalar: el único camino es añadir a pantalla de inicio.
  if (permission === 'unsupported' && ios && !standalone) {
    return (
      <div className="space-y-2 rounded-xl border border-line/10 glass-input p-3.5 text-sm text-ink-dim">
        <p className="font-medium text-ink">{t('Install Quest to get alerts', 'Instala Quest para recibir avisos')}</p>
        <p className="text-xs text-ink-muted">
          {t(
            'On iPhone, notifications only work with the app installed:',
            'En iPhone las notificaciones solo funcionan con la app instalada:',
          )}
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-muted">
          <li>
            {t('Open Quest in Safari and tap the ', 'Abre Quest en Safari y toca el botón ')}
            <span className="font-semibold text-ink-dim">{t('Share', 'Compartir')}</span>
            {t(' button.', '.')}
          </li>
          <li>
            {t('Choose ', 'Elige ')}
            <span className="font-semibold text-ink-dim">{t('Add to Home Screen', 'Añadir a pantalla de inicio')}</span>.
          </li>
          <li>
            {t(
              'Open Quest from its new icon and come back to these Settings to turn them on.',
              'Abre Quest desde su icono nuevo y vuelve a estos Ajustes para activarlas.',
            )}
          </li>
        </ol>
      </div>
    )
  }

  if (permission === 'unsupported') {
    return (
      <p className="text-xs text-ink-faint">
        {t(
          "This browser doesn't support system notifications; alerts will show inside the app.",
          'Este navegador no soporta notificaciones del sistema; los avisos saldrán dentro de la app.',
        )}
      </p>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="space-y-1.5 rounded-xl border border-warn/25 bg-warn/5 p-3.5 text-sm">
        <p className="font-medium text-warn">{t('Notifications blocked', 'Notificaciones bloqueadas')}</p>
        <p className="text-xs text-ink-muted">
          {ios
            ? t(
                'Turn them on in iOS Settings → Notifications → Quest → Allow Notifications.',
                'Actívalas en Ajustes de iOS → Notificaciones → Quest → Permitir notificaciones.',
              )
            : t(
                "Turn them on in your browser's site permissions and reload the app.",
                'Actívalas en los permisos del sitio de tu navegador y recarga la app.',
              )}{' '}
          {t('Meanwhile, alerts will show inside the app.', 'Mientras tanto, los avisos saldrán dentro de la app.')}
        </p>
      </div>
    )
  }

  if (permission === 'granted') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm text-ink-dim">
            <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
            {t('On: reminders, habits and pomodoro', 'Activadas: recordatorios, hábitos y pomodoro')}
          </span>
          <button
            onClick={sendTest}
            className="rounded-lg border border-line/10 px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:bg-ink/5"
          >
            {testSent ? t('✓ Sent', '✓ Enviada') : t('Test notification', 'Probar notificación')}
          </button>
        </div>
        <BackgroundPushSettings />
      </div>
    )
  }

  // permission === 'default': aún sin pedir. En iOS la petición DEBE salir de un toque.
  return (
    <div className="space-y-2">
      <button
        onClick={() => void enable()}
        className="w-full rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500"
      >
        {t('Turn on notifications', 'Activar notificaciones')}
      </button>
      <p className="text-[0.6875rem] text-ink-faint">
        {t(
          'For task reminders, habit alerts and pomodoro phase changes.',
          'Para recordatorios de tareas, avisos de hábitos y cambios de fase del pomodoro.',
        )}
      </p>
    </div>
  )
}

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'dark', label: t('Dark', 'Oscuro') },
  { id: 'light', label: t('Light', 'Claro') },
  { id: 'system', label: t('System', 'Sistema') },
]

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
  const hasBg = useLiveQuery(async () => !!(await db.appMedia.get('bg')), []) ?? false
  // ¿El acento actual es un color libre (ninguno de los 6 predefinidos)?
  const isCustomAccent = !ACCENT_PRESETS.some(
    (p) => p.color.toLowerCase() === settings.accentColor.toLowerCase(),
  )

  return (
    <Modal title={t('Settings', 'Ajustes')} onClose={onClose}>
      <div className="space-y-5">
        <Section title={t('Account', 'Cuenta')}>
          <button
            onClick={() => {
              onClose()
              onOpenAccount()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-line/10 px-4 py-3 text-left transition-colors hover:bg-ink/5"
          >
            <span>
              <span className="block text-sm font-medium text-ink">{t('Account and sync', 'Cuenta y sincronización')}</span>
              <span className="text-xs text-ink-faint">
                {cloudConfigured ? t('Multi-device with Supabase', 'Multi-dispositivo con Supabase') : t('Optional — the app is 100% local', 'Opcional — la app es 100% local')}
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-ink-faint" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </Section>

        <Section title={t('Language', 'Idioma')}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Language', 'Idioma')}>
            {LANGS.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={LANG === l.id}
                onClick={() => {
                  if (l.id !== LANG) setLang(l.id, { reseedDemo: DEMO_MODE })
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  LANG === l.id
                    ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                    : 'border-line/10 text-ink-muted hover:bg-ink/5'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          {DEMO_MODE && (
            <p className="text-xs text-ink-faint">
              {t(
                'In the demo, switching language reloads the sample data in that language.',
                'En la demo, cambiar de idioma recarga los datos de ejemplo en ese idioma.',
              )}
            </p>
          )}
        </Section>

        <Section title={t('Notifications', 'Notificaciones')}>
          <NotificationsSettings />
        </Section>

        <Section title={t('Appearance', 'Apariencia')}>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('Theme', 'Tema')}>
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
                aria-label={`${t('Accent', 'Acento')} ${p.name}`}
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
              title={t('Pick any color', 'Elegir cualquier color')}
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
                aria-label={t('Custom accent color', 'Color de acento personalizado')}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              {t('Custom', 'Libre')}
            </label>
          </div>

          <div className="space-y-1.5 pt-1">
            <span className="block text-xs text-ink-faint">{t('Glass color (Liquid Glass)', 'Color del cristal (Liquid Glass)')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => updateSettings({ glassTint: null })}
                aria-label={t('Neutral glass', 'Cristal neutro')}
                aria-pressed={settings.glassTint === null}
                title={t('Neutral', 'Neutro')}
                className={`flex size-8 items-center justify-center rounded-full border-2 glass-input text-ink-faint transition-all ${
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
                  aria-label={`${t('Glass', 'Cristal')} ${p.name}`}
                  aria-pressed={settings.glassTint === p.color}
                  title={p.name}
                  className={`size-8 rounded-full border-2 transition-all ${
                    settings.glassTint === p.color ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: p.color, opacity: 0.75 }}
                />
              ))}
              <label className="relative ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted" title={t('Any glass color', 'Cualquier color de cristal')}>
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
                  aria-label={t('Custom glass color', 'Color del cristal personalizado')}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                {t('Custom', 'Libre')}
              </label>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <span className="block text-xs text-ink-faint">{t('Task area background', 'Fondo del área de tareas')}</span>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{t('Default animated background', 'Fondo animado por defecto')}</p>
                <p className="text-xs text-ink-faint">
                  {t(
                    "Nebula video on Today when you don't have your own image.",
                    'Video del nebula en Hoy cuando no tienes una imagen propia.',
                  )}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={settings.animatedBg}
                aria-label={t('Default animated background', 'Fondo animado por defecto')}
                onClick={() => updateSettings({ animatedBg: !settings.animatedBg })}
                className={`h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings.animatedBg ? 'bg-accent-600' : 'bg-ink/10'
                }`}
              >
                <span
                  className={`block size-5 rounded-full bg-white shadow transition-transform ${
                    settings.animatedBg ? 'translate-x-5.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => bgFileRef.current?.click()}
                className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5"
              >
                {hasBg ? t('Change image', 'Cambiar imagen') : t('Upload image', 'Subir imagen')}
              </button>
              {hasBg && (
                <button
                  onClick={() => void setBgImage(null)}
                  className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-ink/5"
                >
                  {t('Remove background', 'Quitar fondo')}
                </button>
              )}
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={t('Upload background image', 'Subir imagen de fondo')}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 10 * 1024 * 1024) {
                    setDataMsg(t('The image is larger than 10 MB', 'La imagen supera los 10 MB'))
                  } else {
                    void setBgImage(file)
                  }
                  e.target.value = ''
                }}
              />
            </div>
            {hasBg && (
              <label className="block max-w-xs">
                <span className="mb-1 block text-xs text-ink-faint">
                  {t('Blur', 'Difusión')} · {settings.bgBlur}px
                </span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={settings.bgBlur}
                  onChange={(e) => updateSettings({ bgBlur: Number(e.target.value) })}
                  aria-label={t('Background blur', 'Difusión del fondo')}
                  className="w-full"
                  style={{ accentColor: 'var(--color-accent-500)' }}
                />
              </label>
            )}
          </div>
        </Section>

        <Section title={t('Accessibility', 'Accesibilidad')}>
          <div className="space-y-1.5">
            <span className="block text-xs text-ink-faint">{t('Text size', 'Tamaño del texto')}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t('Text size', 'Tamaño del texto')}>
              {FONT_SCALES.map((f) => (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={settings.fontScale === f.scale}
                  onClick={() => updateSettings({ fontScale: f.scale })}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors ${
                    settings.fontScale === f.scale
                      ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                      : 'border-line/10 text-ink-muted hover:bg-ink/5'
                  }`}
                >
                  {/* Muestra en px: así la vista previa no cambia con el ajuste ya activo. */}
                  <span aria-hidden="true" className="leading-none font-semibold" style={{ fontSize: `${16 * f.scale}px` }}>
                    Aa
                  </span>
                  <span className="text-xs">{f.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-faint">
              {t(
                'Scales the whole interface —text, buttons and spacing— so nothing gets cut off.',
                'Escala toda la interfaz —textos, botones y espacios— para que nada se corte.',
              )}
            </p>
          </div>
        </Section>

        <Section title={t('Sound', 'Sonido')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">{t('Sounds', 'Sonidos')}</p>
              <p className="text-xs text-ink-faint">{t('Completing tasks, level-ups and Pomodoro', 'Completar tareas, level-up y Pomodoro')}</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.soundEnabled}
              aria-label={t('Sounds', 'Sonidos')}
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
                {t('Volume', 'Volumen')} · {Math.round(settings.soundVolume * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.soundVolume}
                onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
                onPointerUp={() => playCompletion(settings.completionSound, settings.soundVolume)}
                aria-label={t('Volume', 'Volumen')}
                className="w-full"
                style={{ accentColor: 'var(--color-accent-500)' }}
              />
            </label>
          </div>
        </Section>

        <Section title={t('Data', 'Datos')}>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void exportData()}
              className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5"
            >
              {t('Export JSON backup', 'Exportar respaldo JSON')}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5"
            >
              {t('Import backup', 'Importar respaldo')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              aria-label={t('Import backup', 'Importar respaldo')}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const n = await importData(file)
                  setDataMsg(t(`Imported ${n} records ✓`, `Importados ${n} registros ✓`))
                } catch (err) {
                  setDataMsg(err instanceof Error ? err.message : t("Couldn't import", 'No se pudo importar'))
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
