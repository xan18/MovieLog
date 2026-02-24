import React, { useEffect, useState } from 'react';

export default function AuthView({
  t,
  lang,
  setLang,
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
  const [nickname, setNickname] = useState('');
  const [signupLanguage, setSignupLanguage] = useState(lang === 'en' ? 'en' : 'ru');

  useEffect(() => {
    if (lang === 'ru' || lang === 'en') {
      setSignupLanguage(lang);
    }
  }, [lang]);

  const submit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanNickname = nickname.trim().replace(/\s+/g, ' ').slice(0, 48);
    if (!cleanEmail || !password) return;

    if (mode === 'signup') {
      if (!cleanNickname) return;
      await onSignUp({
        email: cleanEmail,
        password,
        nickname: cleanNickname,
        preferredLanguage: signupLanguage,
      });
    } else {
      await onSignIn(cleanEmail, password);
    }
  };

  const isSignUp = mode === 'signup';
  const languageChoices = [
    { id: 'ru', code: 'RU', label: t.langRu || 'Русский' },
    { id: 'en', code: 'EN', label: t.langEn || 'English' },
  ];

  const selectSignupLanguage = (nextLang) => {
    if (nextLang !== 'ru' && nextLang !== 'en') return;
    setSignupLanguage(nextLang);
    setLang?.(nextLang);
  };

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

          {isSignUp && (
            <div className="space-y-2">
              <label htmlFor="auth-nickname" className="text-xs uppercase tracking-widest opacity-60 font-bold">
                {t.authNickname || 'Nickname'}
              </label>
              <input
                id="auth-nickname"
                type="text"
                autoComplete="nickname"
                minLength={2}
                maxLength={48}
                required={isSignUp}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full h-[46px] rounded-xl bg-white/5 border border-white/10 px-4 outline-none focus:border-white/30"
                placeholder={t.authNicknamePlaceholder || 'Your nickname'}
              />
            </div>
          )}

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

        <div className="space-y-2 pt-1">
          <p className="text-xs uppercase tracking-widest opacity-60 font-bold">
            {t.authLanguage || t.langTitle || 'Language'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {languageChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => selectSignupLanguage(choice.id)}
                className={`settings-lang-choice ${signupLanguage === choice.id ? 'active' : ''}`}
                aria-pressed={signupLanguage === choice.id}
              >
                <span className="settings-lang-main">
                  <span className="settings-lang-code">{choice.code}</span>
                  <span className="text-sm font-black">{choice.label}</span>
                </span>
                <span className="settings-lang-mark">{'\u2713'}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] opacity-55">
            {isSignUp
              ? (t.authLanguageHint || 'This language will be used after sign up.')
              : (t.authLanguageSignInHint || 'Changes the app language on the sign-in screen.')}
          </p>
        </div>
      </div>
    </div>
  );
}

