import React, { useState } from 'react';

export default function AuthView({
  t,
  mode,
  onModeChange,
  onSignIn,
  onSignUp,
  isBusy,
  error,
  notice,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return;

    if (mode === 'signup') {
      await onSignUp(cleanEmail, password);
    } else {
      await onSignIn(cleanEmail, password);
    }
  };

  const isSignUp = mode === 'signup';

  return (
    <div className="app-shell max-w-[560px] mx-auto px-4 md:px-6 pt-10 pb-16 relative">
      <div className="glass app-panel p-7 md:p-9 space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">MovieLog</h1>
          <p className="text-sm opacity-70 mt-2">{t.authSubtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="auth-email" className="text-xs uppercase tracking-widest opacity-60 font-bold">
              {t.authEmail}
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[46px] rounded-xl bg-white/5 border border-white/10 px-4 outline-none focus:border-white/30"
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="auth-password" className="text-xs uppercase tracking-widest opacity-60 font-bold">
              {t.authPassword}
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-[46px] rounded-xl bg-white/5 border border-white/10 px-4 outline-none focus:border-white/30"
              placeholder="******"
            />
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full h-[46px] rounded-xl font-black text-xs uppercase tracking-widest bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isBusy
              ? (isSignUp ? t.authSigningUp : t.authSigningIn)
              : (isSignUp ? t.authSignUp : t.authSignIn)}
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        <div className="text-sm opacity-80">
          {isSignUp ? t.authHasAccount : t.authNoAccount}{' '}
          <button
            type="button"
            onClick={() => onModeChange(isSignUp ? 'signin' : 'signup')}
            className="font-black underline underline-offset-2"
          >
            {isSignUp ? t.authSwitchToSignIn : t.authSwitchToSignUp}
          </button>
        </div>
      </div>
    </div>
  );
}

