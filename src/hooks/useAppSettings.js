import { useState, useEffect } from 'react';
import { APP_SETTINGS_KEY, LANG_KEY, THEME_KEY } from '../constants/appConstants.js';

const DEFAULT_APP_SETTINGS = {
  startTab: 'catalog',
  librarySortDefault: 'dateAdded',
  persistCatalogFilters: false,
  longPressMs: 550,
  importMode: 'replace',
  reducedMotion: false,
};

const START_TABS = new Set(['catalog', 'library', 'stats', 'settings']);
const LIBRARY_SORTS = new Set(['imdbRating', 'myRating', 'dateAdded', 'releaseYear']);
const LONG_PRESS_VALUES = new Set([350, 550, 800, 1000]);

function readAppSettings() {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw);
    const startTab = START_TABS.has(parsed?.startTab) ? parsed.startTab : DEFAULT_APP_SETTINGS.startTab;
    const librarySortDefault = LIBRARY_SORTS.has(parsed?.librarySortDefault)
      ? parsed.librarySortDefault
      : DEFAULT_APP_SETTINGS.librarySortDefault;
    const persistCatalogFilters = typeof parsed?.persistCatalogFilters === 'boolean'
      ? parsed.persistCatalogFilters
      : DEFAULT_APP_SETTINGS.persistCatalogFilters;
    const longPressMs = LONG_PRESS_VALUES.has(Number(parsed?.longPressMs))
      ? Number(parsed.longPressMs)
      : DEFAULT_APP_SETTINGS.longPressMs;
    const importMode = parsed?.importMode === 'merge' ? 'merge' : 'replace';
    const reducedMotion = typeof parsed?.reducedMotion === 'boolean'
      ? parsed.reducedMotion
      : DEFAULT_APP_SETTINGS.reducedMotion;

    return { startTab, librarySortDefault, persistCatalogFilters, longPressMs, importMode, reducedMotion };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function useAppSettings() {
  const [savedSettings] = useState(readAppSettings);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    if (saved === 'emerald' || saved === 'sky') return 'light';
    if (saved === 'night_gray') return 'dark';
    return ['black', 'dark', 'night', 'light'].includes(saved) ? saved : 'dark';
  });

  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || 'ru');
  const [startTab, setStartTab] = useState(savedSettings.startTab);
  const [librarySortDefault, setLibrarySortDefault] = useState(savedSettings.librarySortDefault);
  const [persistCatalogFilters, setPersistCatalogFilters] = useState(savedSettings.persistCatalogFilters);
  const [longPressMs, setLongPressMs] = useState(savedSettings.longPressMs);
  const [importMode, setImportMode] = useState(savedSettings.importMode);
  const [reducedMotion, setReducedMotion] = useState(savedSettings.reducedMotion);

  useEffect(() => {
    const bodyBg = document.getElementById('body-bg');
    if (bodyBg) bodyBg.className = `theme-${theme}${reducedMotion ? ' reduce-motion' : ''}`;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, reducedMotion]);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    const payload = {
      startTab,
      librarySortDefault,
      persistCatalogFilters,
      longPressMs,
      importMode,
      reducedMotion,
    };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(payload));
  }, [startTab, librarySortDefault, persistCatalogFilters, longPressMs, importMode, reducedMotion]);

  return {
    theme, setTheme,
    lang, setLang,
    startTab, setStartTab,
    librarySortDefault, setLibrarySortDefault,
    persistCatalogFilters, setPersistCatalogFilters,
    longPressMs, setLongPressMs,
    importMode, setImportMode,
    reducedMotion, setReducedMotion,
  };
}
