import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CustomSelect, LazyImg } from '../ui.jsx';
import { IMG_500 } from '../../constants/appConstants.js';
import { sanitizeLibraryData } from '../../utils/librarySanitizer.js';
import { readJsonFileWithFallback } from '../../utils/importUtils.js';
import {
  getEpisodeMarker,
  getTvSeasonsSignature,
  resolveTvProgressStatus,
} from '../../utils/tvStatusUtils.js';
import { getLanguageOptions, getThemeOptions } from '../../utils/uiOptions.js';
import { getYear } from '../../utils/appUtils.js';
import {
  clearHiddenPersonalRecommendationsForUser,
  parsePersonalRecommendationKey,
  readHiddenPersonalRecommendationKeys,
  unhidePersonalRecommendationForUser,
} from '../../services/personalRecommendations.js';
import { tmdbFetchJson } from '../../services/tmdb.js';

const TMDB_LIBRARY_REFRESH_CHUNK_SIZE = 4;

export default function SettingsView({
  library, setLibrary,
  currentUserId,
  authUser,
  userProfile,
  onSaveProfile,
  profileSaving = false,
  t,
  theme, setTheme,
  lang, setLang,
  startTab, setStartTab,
  librarySortDefault, setLibrarySortDefault,
  persistCatalogFilters, setPersistCatalogFilters,
  autoLoadMoreOnScroll, setAutoLoadMoreOnScroll,
  importMode, setImportMode,
  reducedMotion, setReducedMotion,
  canAuthorMode,
  authorModeEnabled, setAuthorModeEnabled,
  confirmClear, setConfirmClear,
  personalRecommendationsHiddenVersion,
  onPersonalRecommendationsHiddenChanged,
  onCardClick,
}) {
  const LANGUAGE_OPTIONS = getLanguageOptions(t);
  const THEME_OPTIONS = getThemeOptions(t);

  const [notice, setNotice] = useState(null);
  const [profileNickname, setProfileNickname] = useState(() => userProfile?.nickname || '');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(() => userProfile?.avatarUrl || '');
  const [profileBio, setProfileBio] = useState(() => userProfile?.bio || '');
  const [avatarPreviewBroken, setAvatarPreviewBroken] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [hiddenForYouKeys, setHiddenForYouKeys] = useState([]);
  const [isHiddenForYouModalOpen, setHiddenForYouModalOpen] = useState(false);
  const [hiddenForYouModalItems, setHiddenForYouModalItems] = useState([]);
  const [hiddenForYouModalLoading, setHiddenForYouModalLoading] = useState(false);
  const [hiddenForYouModalError, setHiddenForYouModalError] = useState('');
  const [isLibraryRefreshRunning, setIsLibraryRefreshRunning] = useState(false);
  const noticeTimerRef = useRef(null);

  const START_TAB_OPTIONS = useMemo(() => ([
    { value: 'catalog', label: t.search },
    { value: 'library', label: t.shelf },
    { value: 'collections', label: t.recommendations },
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

  useEffect(() => {
    setProfileNickname(userProfile?.nickname || '');
    setProfileAvatarUrl(userProfile?.avatarUrl || '');
    setProfileBio(userProfile?.bio || '');
    setAvatarPreviewBroken(false);
  }, [userProfile]);

  useEffect(() => {
    setHiddenForYouKeys(readHiddenPersonalRecommendationKeys(currentUserId || 'anonymous'));
  }, [currentUserId, personalRecommendationsHiddenVersion]);

  const getItemKey = (item) => `${item.mediaType}-${item.id}`;

  const hiddenForYouItems = useMemo(() => (
    hiddenForYouKeys
      .map((key) => parsePersonalRecommendationKey(key))
      .filter(Boolean)
  ), [hiddenForYouKeys]);

  const hiddenForYouModalTitle = useMemo(
    () => t.forYouHiddenModalTitle || t.forYouHiddenListTitle || t.collectionsForYouTab,
    [t]
  );

  const profileAvatarPreviewUrl = profileAvatarUrl.trim();
  const normalizedSavedNickname = (userProfile?.nickname || '').trim();
  const normalizedSavedAvatar = (userProfile?.avatarUrl || '').trim();
  const normalizedSavedBio = (userProfile?.bio || '').trim();
  const normalizedDraftNickname = profileNickname.trim();
  const normalizedDraftAvatar = profileAvatarUrl.trim();
  const normalizedDraftBio = profileBio.trim();
  const profileHasChanges = (
    normalizedDraftNickname !== normalizedSavedNickname
    || normalizedDraftAvatar !== normalizedSavedAvatar
    || normalizedDraftBio !== normalizedSavedBio
  );
  const profilePreviewName = normalizedDraftNickname
    || normalizedSavedNickname
    || authUser?.email?.split('@')?.[0]
    || 'U';
  const profileInitial = (profilePreviewName || 'U').slice(0, 1).toUpperCase();
  const currentProfileLanguageLabel = lang === 'en' ? (t.langEn || 'English') : (t.langRu || 'Русский');

  useEffect(() => {
    if (!isHiddenForYouModalOpen) return;
    const onEsc = (event) => {
      if (event.key === 'Escape') setHiddenForYouModalOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isHiddenForYouModalOpen]);

  useEffect(() => {
    if (!isHiddenForYouModalOpen) return;
    if (hiddenForYouItems.length === 0) {
      setHiddenForYouModalItems([]);
      setHiddenForYouModalLoading(false);
      setHiddenForYouModalError('');
      return;
    }

    let cancelled = false;
    const tmdbLanguage = lang === 'ru' ? 'ru-RU' : 'en-US';

    const loadHiddenRecommendationDetails = async () => {
      setHiddenForYouModalLoading(true);
      setHiddenForYouModalError('');

      try {
        const resolvedItems = await Promise.all(hiddenForYouItems.map(async (entry) => {
          try {
            const detail = await tmdbFetchJson(`/${entry.mediaType}/${entry.id}`, { language: tmdbLanguage });
            if (detail?.id) {
              return {
                ...detail,
                mediaType: entry.mediaType,
                _hiddenKey: entry.key,
              };
            }
          } catch {
            // fall through to fallback object
          }

          return {
            id: entry.id,
            mediaType: entry.mediaType,
            title: `TMDB #${entry.id}`,
            name: `TMDB #${entry.id}`,
            poster_path: null,
            vote_average: 0,
            _hiddenKey: entry.key,
          };
        }));

        if (cancelled) return;
        setHiddenForYouModalItems(resolvedItems);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load hidden for-you recommendation details', error);
        setHiddenForYouModalItems([]);
        setHiddenForYouModalError(t.forYouHiddenLoadError || t.networkError);
      } finally {
        if (!cancelled) setHiddenForYouModalLoading(false);
      }
    };

    loadHiddenRecommendationDetails();

    return () => {
      cancelled = true;
    };
  }, [hiddenForYouItems, isHiddenForYouModalOpen, lang, t.forYouHiddenLoadError, t.networkError]);

  const handleHiddenForYouCardClick = (item) => {
    if (!onCardClick) return;
    setHiddenForYouModalOpen(false);
    onCardClick(item);
  };

  const restoreHiddenForYouItem = (entry) => {
    if (!entry?.mediaType || !entry?.id) return;
    const changed = unhidePersonalRecommendationForUser(
      currentUserId || 'anonymous',
      entry.mediaType,
      entry.id
    );
    if (!changed) return;

    setHiddenForYouKeys((prev) => prev.filter((key) => key !== entry.key));
    setHiddenForYouModalItems((prev) => prev.filter((item) => item._hiddenKey !== entry.key));
    onPersonalRecommendationsHiddenChanged?.();
    showNotice('success', t.forYouHiddenRestoreOneDone || t.fileSaved);
  };

  const restoreAllHiddenForYou = () => {
    const hadAny = clearHiddenPersonalRecommendationsForUser(currentUserId || 'anonymous');
    if (!hadAny) return;
    setHiddenForYouKeys([]);
    setHiddenForYouModalItems([]);
    onPersonalRecommendationsHiddenChanged?.();
    showNotice('success', t.forYouHiddenRestoreAllDone || t.fileSaved);
  };

  const saveProfile = async () => {
    if (!onSaveProfile) return;

    try {
      const result = await onSaveProfile({
        nickname: profileNickname,
        avatarUrl: profileAvatarUrl,
        bio: profileBio,
      });

      if (result?.ok) {
        showNotice('success', t.profileSaveSuccess || t.fileSaved);
        return;
      }

      showNotice('error', result?.error || t.profileSaveError || t.networkError);
    } catch (error) {
      console.error('Failed to save user profile', error);
      showNotice('error', error?.message || t.profileSaveError || t.networkError);
    }
  };

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

  const refreshLibraryStatsAndTvStatuses = async () => {
    if (isLibraryRefreshRunning) return;

    const tvItems = library.filter((item) => item.mediaType === 'tv');
    if (tvItems.length === 0) {
      showNotice('info', t.libraryRefreshNoTv || t.empty);
      return;
    }

    setIsLibraryRefreshRunning(true);
    const tmdbLanguage = lang === 'ru' ? 'ru-RU' : 'en-US';
    const detailMap = new Map();
    let failedCount = 0;

    try {
      for (let index = 0; index < tvItems.length; index += TMDB_LIBRARY_REFRESH_CHUNK_SIZE) {
        const chunk = tvItems.slice(index, index + TMDB_LIBRARY_REFRESH_CHUNK_SIZE);
        const results = await Promise.all(chunk.map(async (item) => {
          try {
            const detail = await tmdbFetchJson(`/tv/${item.id}`, { language: tmdbLanguage });
            return { id: item.id, detail };
          } catch (error) {
            console.warn(`Failed to refresh TV library item ${item.id}`, error);
            return { id: item.id, detail: null };
          }
        }));

        results.forEach((result) => {
          if (!result?.detail?.id) {
            failedCount += 1;
            return;
          }
          detailMap.set(result.id, result.detail);
        });
      }

      let metadataUpdatedCount = 0;
      let statusChangedCount = 0;
      let movedToWatchingCount = 0;

      const nextLibrary = library.map((item) => {
        if (item.mediaType !== 'tv') return item;

        const detail = detailMap.get(item.id);
        if (!detail) return item;

        const nextStatus = resolveTvProgressStatus(item.status, item.watchedEpisodes || {}, detail, item);
        const nextSeasons = Array.isArray(detail.seasons) ? detail.seasons : item.seasons;
        const nextNumberOfEpisodes = Number(detail.number_of_episodes) || item.number_of_episodes || 0;
        const nextNumberOfSeasons = Number(detail.number_of_seasons) || item.number_of_seasons || 0;

        const metadataChanged = (
          Boolean(item.in_production) !== Boolean(detail.in_production)
          || nextNumberOfEpisodes !== (Number(item.number_of_episodes) || 0)
          || nextNumberOfSeasons !== (Number(item.number_of_seasons) || 0)
          || getTvSeasonsSignature(item.seasons) !== getTvSeasonsSignature(nextSeasons)
          || getEpisodeMarker(item.next_episode_to_air) !== getEpisodeMarker(detail.next_episode_to_air)
          || getEpisodeMarker(item.last_episode_to_air) !== getEpisodeMarker(detail.last_episode_to_air)
        );
        const statusChanged = nextStatus !== item.status;

        if (!metadataChanged && !statusChanged) return item;

        if (metadataChanged) metadataUpdatedCount += 1;
        if (statusChanged) {
          statusChangedCount += 1;
          if (item.status === 'completed' && nextStatus === 'watching') movedToWatchingCount += 1;
        }

        return {
          ...item,
          status: nextStatus,
          in_production: detail.in_production,
          next_episode_to_air: detail.next_episode_to_air || null,
          last_episode_to_air: detail.last_episode_to_air || null,
          number_of_episodes: nextNumberOfEpisodes,
          number_of_seasons: nextNumberOfSeasons,
          seasons: nextSeasons,
        };
      });

      setLibrary(nextLibrary);

      const hasChanges = metadataUpdatedCount > 0 || statusChangedCount > 0;
      const summaryParts = [
        `${t.libraryRefreshChecked || 'Checked'}: ${tvItems.length}`,
        `${t.libraryRefreshUpdated || 'Updated'}: ${metadataUpdatedCount}`,
        `${t.libraryRefreshStatusesChanged || 'Statuses'}: ${statusChangedCount}`,
        `${t.libraryRefreshMovedToWatching || 'To watching'}: ${movedToWatchingCount}`,
      ];
      if (failedCount > 0) {
        summaryParts.push(`${t.libraryRefreshErrors || 'Errors'}: ${failedCount}`);
      }

      showNotice(
        failedCount > 0 ? 'info' : (hasChanges ? 'success' : 'info'),
        `${hasChanges ? (t.libraryRefreshDone || t.fileSaved) : (t.libraryRefreshNoChanges || t.empty)}. ${summaryParts.join(' • ')}`
      );
    } catch (error) {
      console.error('Failed to refresh library TV statuses', error);
      showNotice('error', t.libraryRefreshFailed || t.networkError);
    } finally {
      setIsLibraryRefreshRunning(false);
    }
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
        <div className="settings-section-head p-5 border-b border-white/5">
          <p className="text-sm font-black">{t.profileTitle || 'Профиль'}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
              {profileAvatarPreviewUrl && !avatarPreviewBroken ? (
                <img
                  src={profileAvatarPreviewUrl}
                  alt={profilePreviewName}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarPreviewBroken(true)}
                />
              ) : (
                <span className="text-xl font-black opacity-80">{profileInitial}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black truncate">
                {normalizedDraftNickname || authUser?.email || (t.profileNoNickname || 'User')}
              </p>
              <p className="text-xs opacity-55 truncate">{authUser?.email || ''}</p>
              <p className="text-[10px] opacity-40 mt-1">
                {(t.profileLanguageHint || 'Язык профиля')}: {currentProfileLanguageLabel}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="settings-profile-nickname" className="text-xs uppercase tracking-widest opacity-60 font-bold">
                {t.profileNicknameLabel || t.authNickname || 'Nickname'}
              </label>
              <input
                id="settings-profile-nickname"
                type="text"
                autoComplete="nickname"
                maxLength={48}
                value={profileNickname}
                onChange={(event) => setProfileNickname(event.target.value)}
                className="w-full h-[46px] rounded-xl bg-white/5 border border-white/10 px-4 outline-none focus:border-white/30"
                placeholder={t.profileNicknamePlaceholder || t.authNicknamePlaceholder || 'Your nickname'}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-profile-avatar-url" className="text-xs uppercase tracking-widest opacity-60 font-bold">
                {t.profileAvatarUrlLabel || 'Avatar URL'}
              </label>
              <input
                id="settings-profile-avatar-url"
                type="url"
                inputMode="url"
                maxLength={500}
                value={profileAvatarUrl}
                onChange={(event) => {
                  setProfileAvatarUrl(event.target.value);
                  if (avatarPreviewBroken) setAvatarPreviewBroken(false);
                }}
                className="w-full h-[46px] rounded-xl bg-white/5 border border-white/10 px-4 outline-none focus:border-white/30"
                placeholder={t.profileAvatarUrlPlaceholder || 'https://example.com/avatar.jpg'}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="settings-profile-bio" className="text-xs uppercase tracking-widest opacity-60 font-bold">
              {t.profileBioLabel || 'About'}
            </label>
            <textarea
              id="settings-profile-bio"
              rows={3}
              maxLength={240}
              value={profileBio}
              onChange={(event) => setProfileBio(event.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30 resize-y min-h-[92px]"
              placeholder={t.profileBioPlaceholder || 'Short bio'}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] opacity-40 leading-relaxed">
              {t.profileCloudHint || 'Профиль сохраняется в облачном аккаунте. Язык берется из текущих настроек интерфейса.'}
            </p>
            <button
              type="button"
              onClick={saveProfile}
              disabled={profileSaving || !profileHasChanges}
              className={`shrink-0 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border ${
                profileSaving || !profileHasChanges
                  ? 'bg-white/5 border-white/5 text-white/40 cursor-not-allowed'
                  : 'accent-soft'
              }`}
            >
              {profileSaving
                ? (t.profileSaving || t.loading)
                : (t.profileSaveButton || t.save || 'Save')}
            </button>
          </div>
        </div>
      </div>

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
            onClick={() => setAutoLoadMoreOnScroll(prev => !prev)}
            className={`settings-toggle ${autoLoadMoreOnScroll ? 'active' : ''}`}
          >
            <span className="settings-toggle-copy">
              <span className="settings-toggle-title">{t.autoLoadMoreOnScrollLabel || t.loadMore}</span>
              <span className="settings-toggle-hint">{t.autoLoadMoreOnScrollHint || t.loadMore}</span>
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
          {canAuthorMode && (
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
        <div className="settings-section-head p-5 border-b border-white/5"><p className="text-sm font-black">{t.forYouSettingsTitle || t.collectionsForYouTab}</p></div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-50">{t.forYouHiddenListTitle || t.collectionsForYouTab}</p>
              <p className="text-xs opacity-55 mt-1">{t.forYouHiddenListHint || t.collectionsForYouEmptyHint}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-black">{hiddenForYouItems.length}</p>
              <p className="text-[10px] opacity-45 uppercase tracking-widest">{t.total}</p>
            </div>
          </div>

          {hiddenForYouItems.length === 0 ? (
            <div className="settings-preview-box">
              <p className="text-xs opacity-65">{t.forYouHiddenListEmpty || t.empty}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setHiddenForYouModalOpen(true)}
              className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
            >
              {t.forYouHiddenManageOpen || t.forYouHiddenListTitle || t.collectionsForYouTab}
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

          <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-50">
              {t.libraryRefreshButton || t.yourLibrary}
            </p>
            <p className="text-xs opacity-55">
              {t.libraryRefreshHint || t.dataHint}
            </p>
            <button
              type="button"
              onClick={refreshLibraryStatsAndTvStatuses}
              disabled={isLibraryRefreshRunning}
              className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border ${
                isLibraryRefreshRunning
                  ? 'bg-white/5 border-white/5 text-white/40 cursor-not-allowed'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
            >
              {isLibraryRefreshRunning
                ? (t.libraryRefreshRunning || t.loading)
                : (t.libraryRefreshButton || t.yourLibrary)}
            </button>
          </div>
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

      {isHiddenForYouModalOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={() => setHiddenForYouModalOpen(false)}>
          <div className="absolute inset-0 modal-overlay" />
          <div
            className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto glass app-panel-padded p-4 md:p-5 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.forYouSettingsTitle || t.collectionsForYouTab}</p>
                <h3 className="text-xl md:text-2xl font-black leading-tight">{hiddenForYouModalTitle}</h3>
                <p className="text-xs opacity-60 mt-1">{t.forYouHiddenListHint || t.collectionsForYouEmptyHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setHiddenForYouModalOpen(false)}
                className="collections-modal-close"
                aria-label={t.close}
                title={t.close}
              >
                {'\u2715'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs opacity-65">{t.forYouHiddenListTitle || t.collectionsForYouTab}</p>
              <p className="text-sm font-black">{hiddenForYouItems.length}</p>
            </div>

            {hiddenForYouModalError && (
              <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {hiddenForYouModalError}
              </div>
            )}

            {hiddenForYouModalLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: Math.min(Math.max(hiddenForYouItems.length, 4), 10) }).map((_, index) => (
                  <div key={`hidden-for-you-skeleton-${index}`} className="media-card">
                    <div className="media-poster catalog-skeleton-poster">
                      <div className="catalog-skeleton-shimmer" />
                    </div>
                    <div className="catalog-skeleton-line" style={{ width: '88%' }} />
                    <div className="catalog-skeleton-line" style={{ width: '46%' }} />
                  </div>
                ))}
              </div>
            )}

            {!hiddenForYouModalLoading && hiddenForYouModalItems.length === 0 && (
              <div className="empty-state compact">
                <div className="empty-state-icon" aria-hidden="true">{'\u2728'}</div>
                <p className="empty-state-title">{t.forYouHiddenListEmpty || t.empty}</p>
                <p className="empty-state-hint">{t.forYouHiddenListHint || t.collectionsForYouEmptyHint}</p>
              </div>
            )}

            {!hiddenForYouModalLoading && hiddenForYouModalItems.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {hiddenForYouModalItems.map((item, index) => {
                    const title = item.title || item.name || `TMDB #${item.id}`;
                    const year = getYear(item);
                    const genre = (item.genres?.[0]?.name || '');
                    const mediaTypeLabel = item.mediaType === 'movie' ? t.movies : t.tvShows;
                    const restoreEntry = { key: item._hiddenKey, mediaType: item.mediaType, id: item.id };

                    return (
                      <div
                        key={item._hiddenKey || `${item.mediaType}-${item.id}`}
                        onClick={() => handleHiddenForYouCardClick(item)}
                        className="media-card group cursor-pointer card-stagger"
                        style={{ '--stagger-i': index }}
                      >
                        <div className="media-poster">
                          <LazyImg
                            src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'}
                            className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                            alt={title}
                          />
                          <div className="media-pill absolute top-2 left-2 bg-white/85 text-black">
                            {mediaTypeLabel}
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              restoreHiddenForYouItem(restoreEntry);
                            }}
                            className="media-pill absolute top-2 right-2 bg-white/85 text-black hover:bg-white transition-all"
                            aria-label={t.forYouHiddenRestoreOne || t.cancel}
                            title={t.forYouHiddenRestoreOne || t.cancel}
                          >
                            {t.forYouHiddenRestoreOne || t.cancel}
                          </button>
                          <div className="card-info-overlay">
                            {item.vote_average > 0 && <p className="text-xs font-bold mb-0.5">{'\u2605'} {item.vote_average.toFixed(1)}</p>}
                            {genre && <p className="text-[10px] font-medium opacity-80">{genre}</p>}
                            {year && <p className="text-[10px] font-normal opacity-60">{year}</p>}
                          </div>
                        </div>
                        <h3 className="media-title line-clamp-2">{title}</h3>
                        <p className="media-meta">{year}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={restoreAllHiddenForYou}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    {t.forYouHiddenRestoreAll || t.resetCatalogFilters || t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHiddenForYouModalOpen(false)}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    {t.close}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
