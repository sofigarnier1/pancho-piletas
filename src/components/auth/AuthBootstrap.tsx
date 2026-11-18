'use client';

import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from '@/state/auth.store';
import { mapSupabaseUserToAppUser } from '@/lib/supabase/user';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function AuthBootstrap() {
  const { setUser, logout, setLoading } = useAuthStore();

  useEffect(() => {
    let isActive = true;
    const supabase = createBrowserSupabaseClient();

    const bootstrap = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!isActive) return;
        if (user) {
          setUser(mapSupabaseUserToAppUser(user));
        } else {
          logout();
        }
      } catch {
        if (!isActive) return;
        logout();
      }
    };

    bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: Session | null) => {
      if (!isActive) return;
      if (session?.user) {
        setUser(mapSupabaseUserToAppUser(session.user));
      } else {
        logout();
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [setUser, logout, setLoading]);

  return null;
}
