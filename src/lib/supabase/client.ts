import { createBrowserClient } from '@supabase/ssr'
import { Capacitor } from '@capacitor/core'
import { CapacitorStorage } from './storage'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        ...(Capacitor.isNativePlatform() && {
          storage: CapacitorStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        }),
      },
    }
  )
}
