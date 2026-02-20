import { useCallback, useEffect, useState } from 'react';

export function useAuthSession({
  supabaseClient,
  isConfigured,
  authCheckEmailNotice,
  onSignedOut,
}) {
  const [authReady, setAuthReady] = useState(!isConfigured);
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    if (!isConfigured || !supabaseClient) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;

    const initSession = async () => {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (!active) return;
        if (error) {
          setAuthError(error.message || 'Unable to restore auth session.');
        }
        setSession(data?.session || null);
      } catch (error) {
        if (active) {
          setAuthError(error?.message || 'Unable to restore auth session.');
          console.error('Failed to initialize auth session', error);
        }
      } finally {
        if (active) setAuthReady(true);
      }
    };

    initSession();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession || null);
      setAuthError('');
      setAuthNotice('');

      if (!nextSession && event === 'SIGNED_OUT') {
        onSignedOut?.();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isConfigured, onSignedOut, supabaseClient]);

  const signIn = useCallback(async (email, password) => {
    if (!supabaseClient) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message || 'Unable to sign in.');
      }
    } catch (error) {
      setAuthError(error?.message || 'Unable to sign in.');
      console.error('Sign in failed', error);
    } finally {
      setAuthBusy(false);
    }
  }, [supabaseClient]);

  const signUp = useCallback(async (email, password) => {
    if (!supabaseClient) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) {
        setAuthError(error.message || 'Unable to sign up.');
      } else if (!data?.session) {
        setAuthNotice(authCheckEmailNotice);
      }
    } catch (error) {
      setAuthError(error?.message || 'Unable to sign up.');
      console.error('Sign up failed', error);
    } finally {
      setAuthBusy(false);
    }
  }, [authCheckEmailNotice, supabaseClient]);

  const signOut = useCallback(async () => {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        setAuthError(error.message || 'Unable to sign out.');
      }
    } catch (error) {
      setAuthError(error?.message || 'Unable to sign out.');
      console.error('Sign out failed', error);
    }
  }, [supabaseClient]);

  return {
    authReady,
    session,
    authMode,
    setAuthMode,
    authBusy,
    authError,
    authNotice,
    setAuthError,
    setAuthNotice,
    signIn,
    signUp,
    signOut,
  };
}
