import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase (Fase 9). Se configura con variables de entorno en `.env.local`:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...
 * Sin configuración, la app funciona 100% local y la sección de cuenta explica cómo activarla.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export const cloudConfigured = supabase !== null
