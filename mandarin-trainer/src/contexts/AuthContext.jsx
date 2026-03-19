import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../utils/supabase';
import AuthContext from './authContextValue';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) {
      queueMicrotask(() => setLoading(false));
      return;
    }

    let cancelled = false;

    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch credits whenever user changes
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const sb = getSupabaseClient();
    sb.from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Credits fetch error:', error);
          setCredits(0);
          return;
        }
        setCredits(data?.balance ?? 0);
      });

    return () => { cancelled = true; };
  }, [user]);

  const refreshCredits = useCallback(async () => {
    if (!user) return;
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Credits refresh error:', error);
      setCredits(0);
      return;
    }
    setCredits(data?.balance ?? 0);
  }, [user]);

  const signUp = useCallback(async (email, password) => {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    setCredits(null);
  }, []);

  const getAccessToken = useCallback(() => {
    return session?.access_token ?? null;
  }, [session]);

  const updateCredits = useCallback((newBalance) => {
    if (typeof newBalance === 'number') setCredits(newBalance);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      credits,
      signUp,
      signIn,
      signOut,
      getAccessToken,
      refreshCredits,
      updateCredits,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
