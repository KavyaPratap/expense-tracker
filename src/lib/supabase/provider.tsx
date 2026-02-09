
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
    // 4. Listen for auth state changes and redirect UI
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        // toast.success('Session active'); 
        // Optional: Logic to redirect if on login page? 
        // Typically handle redirection in the component or middleware, 
        // but we can force it here if strictly needed.
        router.refresh()
      }
    })

    // Initial session fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // 3. Handle redirect inside the app (Capacitor)
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', async (data: { url: string }) => {
        console.log('Deep link received:', data.url);

        // Strict check matching the manifest host/scheme if needed, or just include check
        if (data.url.includes('google-auth')) {
          toast.info('Verifying authentication...');

          // Strategies:
          // A) Parse #access_token (Implicit Flow - default for client-side)
          // B) Parse ?code (PKCE Flow - safer, often used with SSR)

          const url = new URL(data.url);
          const hashParams = new URLSearchParams(url.hash.substring(1));
          const searchParams = url.searchParams;

          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const code = searchParams.get('code');

          if (accessToken && refreshToken) {
            // Implicit Flow handling
            const { data: { session }, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              toast.error(`Auth Error: ${error.message}`);
            } else if (session) {
              toast.success('Login Successful!');
              setSession(session);
              window.location.href = '/dashboard';
            }
          } else if (code) {
            // PKCE Flow handling (if exchangeCodeForSession is needed)
            // Note: supabase-js usually handles this if you pass the URL to getSession
            // but exchangeCodeForSession is explicit.
            const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              toast.error(`Exchange Error: ${error.message}`);
            } else if (session) {
              toast.success('Login Successful!');
              setSession(session);
              window.location.href = '/dashboard';
            }
          } else {
            // If Supabase can handle the URL automatically
            // await supabase.auth.getSession(); 
            console.warn('No tokens or code found in URL');
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
