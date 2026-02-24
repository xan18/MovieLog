import { useCallback, useEffect, useState } from 'react';

const SUPPORTED_LANGS = new Set(['ru', 'en']);

function normalizeProfileString(value, maxLength = 300) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

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

  const signUp = useCallback(async (payloadOrEmail, legacyPassword) => {
    if (!supabaseClient) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const isObjectPayload = payloadOrEmail && typeof payloadOrEmail === 'object';
      const email = String(isObjectPayload ? payloadOrEmail.email : payloadOrEmail || '').trim();
      const password = String(isObjectPayload ? payloadOrEmail.password : legacyPassword || '');
      const nickname = normalizeProfileString(isObjectPayload ? payloadOrEmail.nickname : '', 48);
      const preferredLanguage = isObjectPayload ? payloadOrEmail.preferredLanguage : '';
      const signUpMetadata = {};

      if (nickname) signUpMetadata.nickname = nickname;
      if (SUPPORTED_LANGS.has(preferredLanguage)) {
        signUpMetadata.preferred_language = preferredLanguage;
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          ...(Object.keys(signUpMetadata).length > 0 ? { data: signUpMetadata } : {}),
        },
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

  const updateProfile = useCallback(async ({
    nickname,
    avatarUrl,
    bio,
    preferredLanguage,
  } = {}) => {
    if (!supabaseClient) {
      return { ok: false, error: 'Supabase is not configured.' };
    }

    const payload = {};

    if (nickname !== undefined) {
      const cleanNickname = normalizeProfileString(nickname, 48);
      payload.nickname = cleanNickname || null;
    }
    if (avatarUrl !== undefined) {
      const cleanAvatarUrl = normalizeProfileString(avatarUrl, 500);
      payload.avatar_url = cleanAvatarUrl || null;
    }
    if (bio !== undefined) {
      const cleanBio = normalizeProfileString(bio, 240);
      payload.bio = cleanBio || null;
    }
    if (preferredLanguage !== undefined) {
      payload.preferred_language = SUPPORTED_LANGS.has(preferredLanguage) ? preferredLanguage : null;
    }

    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const { data, error } = await supabaseClient.auth.updateUser({
        data: payload,
      });

      if (error) {
        const message = error.message || 'Unable to update profile.';
        setAuthError(message);
        return { ok: false, error: message };
      }

      if (data?.user) {
        setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
      }

      return { ok: true, user: data?.user || null };
    } catch (error) {
      const message = error?.message || 'Unable to update profile.';
      setAuthError(message);
      console.error('Profile update failed', error);
      return { ok: false, error: message };
    } finally {
      setAuthBusy(false);
    }
  }, [supabaseClient]);

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
    updateProfile,
    signOut,
  };
}
