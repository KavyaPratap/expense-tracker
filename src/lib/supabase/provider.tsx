
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from './client'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
        console.log('Deep link received:', data.url);
        // toast.info('Verifying login...'); // Optional: uncomment if you want user to see this
        if (data.url.includes('google-auth')) {
          const url = new URL(data.url);
          const params = new URLSearchParams(url.hash.substring(1)); // remove #
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            toast.info('Authenticating...');
            const { data: { session }, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('Session error:', error);
              toast.error(`Login failed: ${error.message}`);
            }

            if (session) {
              toast.success('Login successful!');
              setSession(session);
              // Force hard navigation to ensure clean state
              window.location.href = '/dashboard';
            }
          } else {
            console.warn('No tokens found in URL');
            // toast.error('Login failed: No tokens found');
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
