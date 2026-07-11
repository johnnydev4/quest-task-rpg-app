import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cloudConfigured, supabase } from '../../services/supabase'
import { countPending, lastSyncAt, onSync, syncNow, type SyncState } from '../../services/sync'
import { formatDateTime } from '../../lib/dates'
import { Modal } from '../ui/Modal'

const inputClass =
  'w-full rounded-lg border border-line/10 bg-surface-700 px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'
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
      <Modal title="Cuenta y sincronización" onClose={onClose}>
        <div className="space-y-4 text-sm text-ink-dim">
          <p>
            La app funciona <strong className="text-ink">100% local y offline</strong> sin cuenta. Para
            sincronizar entre dispositivos, conecta un proyecto de Supabase (gratis):
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-ink-muted">
            <li>
              Crea un proyecto en <span className="text-accent-300">supabase.com</span>.
            </li>
            <li>
              En el editor SQL, ejecuta el contenido de <code className="rounded bg-surface-700 px-1.5 py-0.5 text-xs">supabase/schema.sql</code> (está en la carpeta del proyecto).
            </li>
            <li>
              Crea un archivo <code className="rounded bg-surface-700 px-1.5 py-0.5 text-xs">.env.local</code> en la raíz con:
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-surface-700 p-3 text-xs text-ink-dim">{`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON`}</pre>
            </li>
            <li>Reinicia el servidor de desarrollo.</li>
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
    void run(() => supabase!.auth.signInWithPassword({ email, password }), 'Sesión iniciada ✓')
  }

  return (
    <Modal title="Cuenta y sincronización" onClose={onClose}>
      {session ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-line/5 bg-surface-700/60 px-4 py-3">
            <p className="text-sm font-medium text-ink">{session.user.email}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {syncState === 'syncing'
                ? 'Sincronizando…'
                : lastSyncAt()
                  ? `Última sincronización: ${formatDateTime(lastSyncAt()!)}`
                  : 'Aún sin sincronizar'}
              {pending > 0 && ` · ${pending} cambios pendientes`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                const r = await syncNow()
                setMessage(r.ok ? 'Sincronizado ✓' : (r.error ?? 'Error'))
              }}
              disabled={syncState === 'syncing'}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-50"
            >
              Sincronizar ahora
            </button>
            <button
              onClick={() => run(() => supabase!.auth.signOut(), 'Sesión cerrada')}
              className={btnClass}
            >
              Cerrar sesión
            </button>
          </div>
          <p className="text-xs text-ink-faint">
            Tus datos siguen guardándose localmente al instante; la nube es respaldo y multi-dispositivo.
          </p>
          {message && <p className="text-xs text-accent-300">{message}</p>}
        </div>
      ) : (
        <form onSubmit={signIn} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Inicia sesión para sincronizar entre dispositivos. Sin cuenta, todo sigue funcionando local.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            aria-label="Correo"
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            aria-label="Contraseña"
            className={inputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-50"
            >
              Entrar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => supabase!.auth.signUp({ email, password }), 'Cuenta creada: revisa tu correo para confirmarla')
              }
              className={btnClass}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              disabled={busy || !email}
              onClick={() =>
                run(
                  () => supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }),
                  'Enlace mágico enviado a tu correo ✉',
                )
              }
              className={btnClass}
            >
              Enlace mágico
            </button>
          </div>
          {message && <p className="text-xs text-accent-300">{message}</p>}
        </form>
      )}
    </Modal>
  )
}
