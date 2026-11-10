import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cloudConfigured, supabase } from '../../services/supabase'
import { countPending, lastSyncAt, onSync, syncNow, type SyncState } from '../../services/sync'
import { formatDateTime } from '../../lib/dates'
import { Modal } from '../ui/Modal'
import { t } from '../../lib/i18n'

const inputClass =
  'w-full rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'
const btnClass =
  'rounded-lg border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5'

export function AccountModal({ onClose }: { onClose: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    void countPending().then(setPending)
    return onSync((state) => {
      setSyncState(state)
      if (state === 'done') void countPending().then(setPending)
    })
  }, [])

  if (!cloudConfigured) {
    return (
      <Modal title={t('Account and sync', 'Cuenta y sincronización')} onClose={onClose}>
        <div className="space-y-4 text-sm text-ink-dim">
          <p>
            {t('The app works ', 'La app funciona ')}
            <strong className="text-ink">{t('100% local and offline', '100% local y offline')}</strong>
            {t(
              ' without an account. To sync across devices, connect a Supabase project (free):',
              ' sin cuenta. Para sincronizar entre dispositivos, conecta un proyecto de Supabase (gratis):',
            )}
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-ink-muted">
            <li>
              {t('Create a project at ', 'Crea un proyecto en ')}
              <span className="text-accent-300">supabase.com</span>.
            </li>
            <li>
              {t('In the SQL editor, run the contents of ', 'En el editor SQL, ejecuta el contenido de ')}
              <code className="rounded glass-input px-1.5 py-0.5 text-xs">supabase/schema.sql</code>
              {t(' (it is in the project folder).', ' (está en la carpeta del proyecto).')}
            </li>
            <li>
              {t('Create a ', 'Crea un archivo ')}
              <code className="rounded glass-input px-1.5 py-0.5 text-xs">.env.local</code>
              {t(' file in the root with:', ' en la raíz con:')}
              <pre className="mt-1.5 overflow-x-auto rounded-lg glass-input p-3 text-xs text-ink-dim">{`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON`}</pre>
            </li>
            <li>{t('Restart the dev server.', 'Reinicia el servidor de desarrollo.')}</li>
          </ol>
        </div>
      </Modal>
    )
  }

  async function run(action: () => Promise<{ error: { message: string } | null }>, okMsg: string) {
    setBusy(true)
    setMessage(null)
    try {
      const { error } = await action()
      setMessage(error ? error.message : okMsg)
    } finally {
      setBusy(false)
    }
  }

  function signIn(e: FormEvent) {
    e.preventDefault()
    void run(() => supabase!.auth.signInWithPassword({ email, password }), t('Signed in ✓', 'Sesión iniciada ✓'))
  }

  function signInWithGoogle() {
    // Redirige a Google y vuelve al origen actual (Supabase detecta la sesión al volver).
    void supabase!.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <Modal title={t('Account and sync', 'Cuenta y sincronización')} onClose={onClose}>
      {session ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-line/5 glass-input px-4 py-3">
            <p className="text-sm font-medium text-ink">{session.user.email}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {syncState === 'syncing'
                ? t('Syncing…', 'Sincronizando…')
                : lastSyncAt()
                  ? `${t('Last sync', 'Última sincronización')}: ${formatDateTime(lastSyncAt()!)}`
                  : t('Not synced yet', 'Aún sin sincronizar')}
              {pending > 0 && ` · ${t(`${pending} pending changes`, `${pending} cambios pendientes`)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                const r = await syncNow(true)
                setMessage(r.ok ? t('Synced ✓', 'Sincronizado ✓') : (r.error ?? 'Error'))
              }}
              disabled={syncState === 'syncing'}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-50"
            >
              {t('Sync now', 'Sincronizar ahora')}
            </button>
            <button
              onClick={() => run(() => supabase!.auth.signOut(), t('Signed out', 'Sesión cerrada'))}
              className={btnClass}
            >
              {t('Sign out', 'Cerrar sesión')}
            </button>
          </div>
          <p className="text-xs text-ink-faint">
            {t(
              'Your data is still saved locally instantly; the cloud is a backup and multi-device.',
              'Tus datos siguen guardándose localmente al instante; la nube es respaldo y multi-dispositivo.',
            )}
          </p>
          {message && <p className="text-xs text-accent-300">{message}</p>}
        </div>
      ) : (
        <form onSubmit={signIn} className="space-y-4">
          <p className="text-sm text-ink-muted">
            {t(
              'Sign in to sync across devices. Without an account, everything keeps working locally.',
              'Inicia sesión para sincronizar entre dispositivos. Sin cuenta, todo sigue funcionando local.',
            )}
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line/15 glass-input px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t('Continue with Google', 'Continuar con Google')}
          </button>
          <div className="flex items-center gap-3 text-[0.6875rem] text-ink-faint">
            <span className="h-px flex-1 bg-line/10" />
            {t('or with your email', 'o con tu correo')}
            <span className="h-px flex-1 bg-line/10" />
          </div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email@example.com', 'correo@ejemplo.com')}
            aria-label={t('Email', 'Correo')}
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('Password', 'Contraseña')}
            aria-label={t('Password', 'Contraseña')}
            className={inputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-50"
            >
              {t('Sign in', 'Entrar')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => supabase!.auth.signUp({ email, password }), t('Account created: check your email to confirm it', 'Cuenta creada: revisa tu correo para confirmarla'))
              }
              className={btnClass}
            >
              {t('Create account', 'Crear cuenta')}
            </button>
            <button
              type="button"
              disabled={busy || !email}
              onClick={() =>
                run(
                  () => supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }),
                  t('Magic link sent to your email ✉', 'Enlace mágico enviado a tu correo ✉'),
                )
              }
              className={btnClass}
            >
              {t('Magic link', 'Enlace mágico')}
            </button>
          </div>
          {message && <p className="text-xs text-accent-300">{message}</p>}
        </form>
      )}
    </Modal>
  )
}
