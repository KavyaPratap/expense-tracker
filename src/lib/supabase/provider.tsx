
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from './client'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

type SupabaseContextType = {
  supabase: SupabaseClient
  session: Session | null
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined)

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [session, setSession] = useState<Session | null>(null)
  const router = useRouter()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      // On sign-in or sign-out, refresh the page to trigger middleware
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        router.refresh()
      }
    })

    // Initial session fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for deep links (OAuth redirects)
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', async (data: { url: string }) => {
        if (data.url.includes('google-auth')) {
          // Extract the fragment from the URL (Supabase returns #access_token=...)
          // We can just let supabase handle the URL if we pass it correctly, 
          // or we can manually parse it. 
          // Ideally, supabase.auth.getSession() might pick it up if the URL is in the window,
          // but in Capacitor, we might need to help it.

          // Actually, the best way for Supabase in Capacitor is to extract the tokens from the URL.
          const url = new URL(data.url);
          const params = new URLSearchParams(url.hash.substring(1)); // remove #
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data: { session }, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (session) {
              setSession(session);
              router.push('/dashboard');
            }
          }
        }
      });
    });

    return () => {
      subscription.unsubscribe()
      import('@capacitor/app').then(({ App }) => {
        App.removeAllListeners();
      });
    }
  }, [supabase, router])

  return (
    <SupabaseContext.Provider value={{ supabase, session }}>
      {children}
    </SupabaseContext.Provider>
  )
}

export const useSupabase = () => {
  const context = useContext(SupabaseContext)
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return context
}
