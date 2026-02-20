import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CustomSelect } from '../ui.jsx';
import { sanitizeLibraryData } from '../../utils/librarySanitizer.js';
import { readJsonFileWithFallback } from '../../utils/importUtils.js';
import { getLanguageOptions, getThemeOptions } from '../../utils/uiOptions.js';

export default function SettingsView({
  library, setLibrary,
  t,
  theme, setTheme,
  lang, setLang,
  startTab, setStartTab,
  librarySortDefault, setLibrarySortDefault,
  persistCatalogFilters, setPersistCatalogFilters,
  importMode, setImportMode,
  reducedMotion, setReducedMotion,
  isAdmin,
  authorModeEnabled, setAuthorModeEnabled,
  confirmClear, setConfirmClear,
}) {
  const LANGUAGE_OPTIONS = getLanguageOptions(t);
  const THEME_OPTIONS = getThemeOptions(t);

  const [notice, setNotice] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const noticeTimerRef = useRef(null);

  const START_TAB_OPTIONS = useMemo(() => ([
    { value: 'catalog', label: t.search },
    { value: 'library', label: t.shelf },
    { value: 'collections', label: t.collections },
    { value: 'stats', label: t.stats },
    { value: 'settings', label: t.settings },
  ]), [t]);

  const SORT_DEFAULT_OPTIONS = useMemo(() => ([
    { value: 'imdbRating', label: t.byImdbRating },
    { value: 'myRating', label: t.byMyRating },
    { value: 'dateAdded', label: t.byDateAdded },
    { value: 'releaseYear', label: t.byReleaseYear },
  ]), [t]);

  const IMPORT_MODE_OPTIONS = useMemo(() => ([
    { value: 'replace', label: t.importModeReplace },
    { value: 'merge', label: t.importModeMerge },
  ]), [t]);

  const showNotice = (type, text) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice({ type, text });
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
  };

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  const getItemKey = (item) => `${item.mediaType}-${item.id}`;

  const computeImportPreview = (incomingItems) => {
    const currentMap = new Map(library.map(item => [getItemKey(item), item]));
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    incomingItems.forEach((item) => {
      const key = getItemKey(item);
      const existing = currentMap.get(key);
      if (!existing) {
        newCount += 1;
        return;
      }
      if (JSON.stringify(existing) === JSON.stringify(item)) unchangedCount += 1;
      else updatedCount += 1;
    });

    return {
      totalIncoming: incomingItems.length,
      overlapCount: updatedCount + unchangedCount,
      newCount,
      updatedCount,
      unchangedCount,
    };
  };

  const exportLibrary = (filePrefix = 'movielog_backup') => {
    const data = JSON.stringify(library, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `${filePrefix}_${new Date().toISOString().slice(0, 10)}.json`;
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return fileName;
  };

  return (
    <div className="view-stack settings-view max-w-2xl mx-auto">
      <div className="text-center mb-2">
        <h2 className="text-2xl font-black">{t.settings}</h2>
        <p className="text-xs opacity-40 mt-1">{t.personalization}</p>
      </div>

      {notice && (
        <div className={`settings-notice ${notice.type}`}>
          {notice.text}
        </div>
      )}

      <div className="glass app-panel">
        <div className="settings-section-head p-5 border-b border-white/5"><p className="text-sm font-black">{t.interfaceTitle}</p></div>
        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-3">{t.langTitle}</p>
            <div className="grid grid-cols-2 gap-3">
              {LANGUAGE_OPTIONS.map(l => (
                <button key={l.id} onClick={() => setLang(l.id)}
                  className={`settings-lang-choice ${lang === l.id ? 'active' : ''}`}>
                  <span className="settings-lang-main">
                    <span className="settings-lang-code">{l.flag}</span>
                    <span className="text-sm font-black">{l.label}</span>
                  </span>
                  <span className="settings-lang-mark">{'\u2713'}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-3">{t.themeTitle}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {THEME_OPTIONS.map(th => (
                <button key={th.id} onClick={() => setTheme(th.id)}
                  className={`settings-choice relative p-4 rounded-2xl transition-all ${theme === th.id ? 'active scale-105' : 'hover:border-white/20'}`}
                  style={{ background: th.color }}>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-5 rounded-md" style={{ background: th.color, border: '1px solid rgba(128,128,128,0.3)' }} />
                    <span className="text-[10px] font-black uppercase" style={{ color: th.textColor }}>{th.label}</span>
                  </div>
                  {theme === th.id && <div className="settings-check absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black">{'\u2713'}</div>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="glass app-panel">
        <div className="settings-section-head p-5 border-b border-white/5"><p className="text-sm font-black">{t.behaviorTitle}</p></div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-2">{t.startTabLabel}</p>
            <CustomSelect value={startTab} options={START_TAB_OPTIONS} onChange={setStartTab} ariaLabel={t.startTabLabel} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-2">{t.defaultLibrarySortLabel}</p>
            <CustomSelect
              value={librarySortDefault}
              options={SORT_DEFAULT_OPTIONS}
              onChange={setLibrarySortDefault}
              ariaLabel={t.defaultLibrarySortLabel}
            />
          </div>
          <button
            type="button"
            onClick={() => setPersistCatalogFilters(prev => !prev)}
            className={`settings-toggle ${persistCatalogFilters ? 'active' : ''}`}
          >
            <span className="settings-toggle-copy">
              <span className="settings-toggle-title">{t.persistCatalogFiltersLabel}</span>
              <span className="settings-toggle-hint">{t.persistCatalogFiltersHint}</span>
            </span>
            <span className="settings-toggle-switch">
              <span className="settings-toggle-dot" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setReducedMotion(prev => !prev)}
            className={`settings-toggle ${reducedMotion ? 'active' : ''}`}
          >
            <span className="settings-toggle-copy">
              <span className="settings-toggle-title">{t.reducedMotionLabel}</span>
              <span className="settings-toggle-hint">{t.reducedMotionHint}</span>
            </span>
            <span className="settings-toggle-switch">
              <span className="settings-toggle-dot" />
            </span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAuthorModeEnabled(prev => !prev)}
              className={`settings-toggle ${authorModeEnabled ? 'active' : ''}`}
            >
              <span className="settings-toggle-copy">
                <span className="settings-toggle-title">{t.authorModeToggleLabel}</span>
                <span className="settings-toggle-hint">{t.authorModeToggleHint}</span>
              </span>
              <span className="settings-toggle-switch">
                <span className="settings-toggle-dot" />
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="glass app-panel">
        <div className="settings-section-head p-5 border-b border-white/5"><p className="text-sm font-black">{t.dataTitle}</p></div>
        <div className="p-5 space-y-3">
          <p className="text-xs opacity-50">{t.dataHint}</p>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-2">{t.importModeLabel}</p>
            <CustomSelect
              value={importMode}
              options={IMPORT_MODE_OPTIONS}
              onChange={setImportMode}
              ariaLabel={t.importModeLabel}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                exportLibrary();
                showNotice('success', t.fileSaved);
              }}
              className="accent-soft py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
            >
              {t.export}
            </button>
            <label className="py-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer text-center">
              {t.import}
              <input type="file" accept=".json" className="hidden" onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                (async () => {
                  try {
                    const data = await readJsonFileWithFallback(file);
                    if (!Array.isArray(data)) {
                      showNotice('error', t.badFormat);
                      return;
                    }
                    const normalized = sanitizeLibraryData(data);
                    const preview = computeImportPreview(normalized);
                    setPendingImport({
                      fileName: file.name,
                      items: normalized,
                      preview,
                    });
                    showNotice('info', `${t.importReady}: ${file.name}`);
                  } catch {
                    showNotice('error', t.readError);
                  }
                })();
                e.target.value = '';
              }} />
            </label>
          </div>

          {pendingImport && (
            <div className="settings-preview-box">
              <p className="text-xs font-black uppercase tracking-widest mb-2">{t.importPreviewTitle}</p>
              <p className="text-[11px] opacity-70 mb-2">{pendingImport.fileName}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <p>{t.total}: <span className="font-black">{pendingImport.preview.totalIncoming}</span></p>
                <p>{t.importPreviewOverlap}: <span className="font-black">{pendingImport.preview.overlapCount}</span></p>
                <p>{t.importPreviewNew}: <span className="font-black">{pendingImport.preview.newCount}</span></p>
                <p>{t.importPreviewUpdated}: <span className="font-black">{pendingImport.preview.updatedCount}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  onClick={() => {
                    const incoming = pendingImport.items;
                    let result = incoming;
                    if (importMode === 'merge') {
                      const mergedMap = new Map(library.map(item => [getItemKey(item), item]));
                      incoming.forEach(item => mergedMap.set(getItemKey(item), item));
                      result = Array.from(mergedMap.values());
                    }
                    setLibrary(result);
                    setPendingImport(null);
                    if (importMode === 'merge') showNotice('success', `${t.importMergeDone} ${result.length} ${t.records}`);
                    else showNotice('success', `${t.importReplaceDone} ${result.length} ${t.records}`);
                  }}
                  className="accent-soft py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  {t.importApply}
                </button>
                <button
                  onClick={() => setPendingImport(null)}
                  className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] opacity-35 text-center">
            {importMode === 'merge' ? t.importModeMergeHint : t.importModeReplaceHint}
          </p>
        </div>
      </div>

      <div className="glass app-panel">
        <div className="settings-section-head p-5 border-b border-white/5"><p className="text-sm font-black">{t.yourLibrary}</p></div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center bg-white/5 rounded-xl py-3">
              <p className="text-xl font-black">{library.filter(x => x.mediaType === 'movie').length}</p>
              <p className="text-[9px] font-bold opacity-40 uppercase">{t.moviesCount}</p>
            </div>
            <div className="text-center bg-white/5 rounded-xl py-3">
              <p className="text-xl font-black">{library.filter(x => x.mediaType === 'tv').length}</p>
              <p className="text-[9px] font-bold opacity-40 uppercase">{t.tvCount}</p>
            </div>
            <div className="text-center bg-white/5 rounded-xl py-3">
              <p className="text-xl font-black">{library.length}</p>
              <p className="text-[9px] font-bold opacity-40 uppercase">{t.totalCount}</p>
            </div>
          </div>
          <p className="text-[10px] opacity-30 text-center">
            {t.storedIn} ({(new Blob([JSON.stringify(library)]).size / 1024).toFixed(1)} KB)
          </p>
        </div>
      </div>

      <div className="glass rounded-3xl border border-red-500/20 overflow-hidden">
        <div className="settings-section-head p-5 border-b border-red-500/10"><p className="text-sm font-black text-red-400">{t.safetyTitle}</p></div>
        <div className="p-5 space-y-4">
          <button
            onClick={() => {
              exportLibrary('movielog_preclear_backup');
              showNotice('success', t.preClearBackupDone);
            }}
            className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
          >
            {t.preClearBackup}
          </button>

          {!confirmClear ? (
            <button onClick={() => setConfirmClear(true)} className="w-full py-4 bg-red-600/15 hover:bg-red-600/25 border border-red-500/25 rounded-2xl font-black text-xs uppercase tracking-widest transition-all text-red-400">
              {t.clearLibrary}
            </button>
          ) : (
            <div className="bg-red-600/10 border border-red-500/30 rounded-2xl p-5 space-y-4">
              <div className="text-center">
                <p className="text-sm font-black text-red-400 mb-1">{t.areYouSure}</p>
                <p className="text-xs opacity-60">
                  {t.willBeDeleted} {library.length} - {library.filter(x => x.mediaType === 'movie').length} {t.moviesAnd} {library.filter(x => x.mediaType === 'tv').length} {t.tvShowsAnd}. {t.cannotUndo}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setConfirmClear(false)} className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">{t.cancel}</button>
                <button onClick={() => { setLibrary([]); setConfirmClear(false); showNotice('success', t.libraryCleared); }} className="py-3 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all text-white">{t.yesDelete}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="glass app-panel">
        <div className="settings-section-head p-5 border-b border-white/5"><p className="text-sm font-black">{t.aboutTitle}</p></div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between"><span className="text-xs opacity-50">{t.version}</span><span className="text-xs font-black">v27 Enhanced</span></div>
          <div className="flex items-center justify-between"><span className="text-xs opacity-50">{t.dataSource}</span><span className="text-xs font-black">TMDB API</span></div>
          <div className="flex items-center justify-between"><span className="text-xs opacity-50">{t.storage}</span><span className="text-xs font-black">{t.offline}</span></div>
          <div className="pt-3 border-t border-white/5"><p className="text-[10px] opacity-30 text-center leading-relaxed">{t.aboutText}</p></div>
        </div>
      </div>
    </div>
  );
}
