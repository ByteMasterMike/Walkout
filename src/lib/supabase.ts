import { createClient } from '@supabase/supabase-js'

/**
 * Returns a fresh Supabase client instance.
 * Called at request time (not module-evaluation time) to avoid build-time errors
 * when env vars are not available during static analysis.
 */
export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set')
  }
  return createClient(url, key)
}
