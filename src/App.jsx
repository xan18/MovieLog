import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { RatingModal } from './components/ui.jsx';
import { useDebouncedStorageState } from './hooks/useDebouncedStorageState.js';
import { useAppSettings } from './hooks/useAppSettings.js';
import { useCatalog } from './hooks/useCatalog.js';
import { useLibrary } from './hooks/useLibrary.js';
import { useAuthSession } from './hooks/useAuthSession.js';
import { useCloudLibrarySync } from './hooks/useCloudLibrarySync.js';
import { useUserRoles } from './hooks/useUserRoles.js';
import { useTmdbDetailsApi } from './hooks/useTmdbDetailsApi.js';
import { useModalHistory } from './hooks/useModalHistory.js';
import { useStatsSelectors } from './hooks/useStatsSelectors.js';
import { isSupabaseConfigured, supabase } from './services/supabase.js';
import { tmdbFetchManyJson } from './services/tmdb.js';
import { hidePersonalRecommendationForUser } from './services/personalRecommendations.js';
import { getMovieStatuses, getTvStatuses, getStatusBadgeConfig, getTvShowStatusMap, getCrewRoleMap } from './utils/statusConfig.js';
import { isReleasedItem } from './utils/releaseUtils.js';
import { sanitizeLibraryData } from './utils/librarySanitizer.js';
import {
  buildTvWatchedEpisodesForCompletion,
  getTvProgressSnapshot,
  resolveTvProgressStatus,
} from './utils/tvStatusUtils.js';
import { STORAGE_KEY } from './constants/appConstants.js';
import { I18N } from './i18n/translations.js';

import CatalogView from './components/views/CatalogView.jsx';
import LibraryView from './components/views/LibraryView.jsx';
import CollectionsView from './components/views/CollectionsView.jsx';
import StatsView from './components/views/StatsView.jsx';
import SettingsView from './components/views/SettingsView.jsx';
import AuthView from './components/views/AuthView.jsx';
import DetailsModal from './components/modals/DetailsModal.jsx';
import QuickActionsMenu from './components/modals/QuickActionsMenu.jsx';
import PersonModal from './components/modals/PersonModal.jsx';

const APP_TABS = ['catalog', 'library', 'collections', 'stats', 'settings'];
const APP_TAB_SET = new Set(APP_TABS);
const DEFAULT_APP_TAB = 'catalog';

function isAppTab(tabId) {
  return APP_TAB_SET.has(tabId);
}

function getDefaultAppTab(startTab) {
  return isAppTab(startTab) ? startTab : DEFAULT_APP_TAB;
}

function getAppTabFromHash() {
  if (typeof window === 'undefined') return null;
  const rawHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return isAppTab(rawHash) ? rawHash : null;
}

function replaceHashWithTab(tabId) {
  if (typeof window === 'undefined' || !isAppTab(tabId)) return;

  const nextHash = `#/${tabId}`;
  if (window.location.hash === nextHash) return;

  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

/* Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Main App Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ */
export default function App() {
  const {
    theme, setTheme,
    lang, setLang,
    startTab, setStartTab,
    librarySortDefault, setLibrarySortDefault,
    persistCatalogFilters, setPersistCatalogFilters,
    autoLoadMoreOnScroll, setAutoLoadMoreOnScroll,
    importMode, setImportMode,
    reducedMotion, setReducedMotion,
    authorModeEnabled, setAuthorModeEnabled,
  } = useAppSettings();

  const t = I18N[lang] || I18N.ru;
  const TMDB_LANG = lang === 'ru' ? 'ru-RU' : 'en-US';
  const DATE_LOCALE = lang === 'ru' ? 'ru-RU' : 'en-US';

  const MOVIE_STATUSES = useMemo(() => getMovieStatuses(t), [t]);
  const TV_STATUSES = useMemo(() => getTvStatuses(t), [t]);
  const STATUS_BADGE_CONFIG = useMemo(() => getStatusBadgeConfig(t), [t]);
  const TV_SHOW_STATUS_MAP = useMemo(() => getTvShowStatusMap(t), [t]);
  const CREW_ROLE_MAP = useMemo(() => getCrewRoleMap(t), [t]);

  const [library, setLibrary] = useDebouncedStorageState(STORAGE_KEY, [], {
    debounceMs: 500,
    normalize: sanitizeLibraryData,
  });
  const [globalError, setGlobalError] = useState('');

  // Navigation & UI state
  const [activeTab, setActiveTabState] = useState(() => getAppTabFromHash() || getDefaultAppTab(startTab));
  const [statsView, setStatsView] = useState('statistics');
  const [peopleView, setPeopleView] = useState('directors');
  const [libraryType, setLibraryType] = useState('movie');
  const [shelf, setShelf] = useState('planned');
  const [sortBy, setSortBy] = useState(librarySortDefault);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const setActiveTab = useCallback((tabId) => {
    if (!isAppTab(tabId)) return;

    setActiveTabState((prev) => (prev === tabId ? prev : tabId));

    if (typeof window !== 'undefined' && window.location.hash !== `#/${tabId}`) {
      window.location.hash = `/${tabId}`;
    }
  }, []);

  // Modal & detail state
  const [selectedItem, setSelectedItem] = useState(null);
  const [trailerId, setTrailerId] = useState(null);
  const [ratingModal, setRatingModal] = useState(null);
  const [movieRatingModal, setMovieRatingModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState({});
  const [loadingSeason, setLoadingSeason] = useState(null);
  const [quickActions, setQuickActions] = useState(null);
  const [personalRecommendationsHiddenVersion, setPersonalRecommendationsHiddenVersion] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [closingDetails, setClosingDetails] = useState(false);
  const [closingPerson, setClosingPerson] = useState(false);
  const [addPulseId, setAddPulseId] = useState(null);

  const selectedItemRef = useRef(selectedItem);
  useEffect(() => {
    selectedItemRef.current = selectedItem;
  }, [selectedItem]);

  useEffect(() => {
    const syncActiveTabFromUrl = () => {
      const tabFromHash = getAppTabFromHash();
      if (tabFromHash) {
        setActiveTabState((prev) => (prev === tabFromHash ? prev : tabFromHash));
        return;
      }

      const fallbackTab = getDefaultAppTab(startTab);
      setActiveTabState((prev) => (prev === fallbackTab ? prev : fallbackTab));
      replaceHashWithTab(fallbackTab);
    };

    syncActiveTabFromUrl();
    window.addEventListener('hashchange', syncActiveTabFromUrl);
    return () => window.removeEventListener('hashchange', syncActiveTabFromUrl);
  }, [startTab]);

  const handleSignedOut = useCallback(() => {
    setLibrary([]);
    setGlobalError('');
  }, [setLibrary]);

  const {
    authReady,
    session,
    authMode,
    setAuthMode,
    authBusy,
    authError,
    authNotice,
    signIn,
    signUp,
    updateProfile,
    signOut,
  } = useAuthSession({
    supabaseClient: supabase,
    isConfigured: isSupabaseConfigured,
    authCheckEmailNotice: t.authCheckEmail,
    onSignedOut: handleSignedOut,
  });

  const currentUserId = session?.user?.id || null;
  const currentUserProfile = useMemo(() => {
    const metadata = session?.user?.user_metadata || {};
    return {
      nickname: typeof metadata.nickname === 'string' ? metadata.nickname : '',
      avatarUrl: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : '',
      bio: typeof metadata.bio === 'string' ? metadata.bio : '',
      preferredLanguage: typeof metadata.preferred_language === 'string' ? metadata.preferred_language : '',
      email: session?.user?.email || '',
    };
  }, [session?.user?.email, session?.user?.user_metadata]);

  const headerUserLabel = currentUserProfile.nickname || currentUserProfile.email;

  useEffect(() => {
    const preferredLanguage = currentUserProfile.preferredLanguage;
    if (preferredLanguage === 'ru' || preferredLanguage === 'en') {
      setLang((prev) => (prev === preferredLanguage ? prev : preferredLanguage));
    }
  }, [currentUserProfile.preferredLanguage, setLang]);

  const saveUserProfile = useCallback(async (profilePayload) => (
    updateProfile({
      ...profilePayload,
      preferredLanguage: lang,
    })
  ), [lang, updateProfile]);

  const { cloudSyncError } = useCloudLibrarySync({
    enabled: isSupabaseConfigured && Boolean(supabase),
    supabaseClient: supabase,
    currentUserId,
    library,
    setLibrary,
    syncErrorFallback: t.authCloudSyncError,
  });

  const {
    rolesReady,
    rolesError,
    canAuthorMode,
  } = useUserRoles({
    currentUserId,
    supabaseClient: supabase,
    enabled: isSupabaseConfigured && Boolean(supabase),
  });

  const isAuthor = canAuthorMode && authorModeEnabled;

  const onApiError = useCallback((message) => {
    setGlobalError(message || t.networkError);
  }, [t.networkError]);

  // Hooks
  const catalog = useCatalog({ lang, t, persistCatalogFilters });

  const {
    getLibraryEntry, addToLibrary, setTvStatus,
    setSeasonRating,
    removeFromLibrary, handleEpisodeClick, handleSeasonToggle,
  } = useLibrary({ library, setLibrary, setSelectedItem, selectedItemRef });
  const {
    getFullDetails,
    getPersonDetails,
    loadSeasonEpisodes,
  } = useTmdbDetailsApi({
    library,
    setLibrary,
    setSelectedItem,
    setSelectedPerson,
    setSeasonEpisodes,
    seasonEpisodes,
    setLoadingSeason,
    TMDB_LANG,
    networkErrorMessage: t.networkError,
    onError: onApiError,
  });

  useEffect(() => {
    if (!rolesError) return;
    setGlobalError(rolesError);
  }, [rolesError]);

  // Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Close modals with animation Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
  const closeDetails = useCallback(() => {
    setClosingDetails(true);
    setTimeout(() => { setSelectedItem(null); setClosingDetails(false); }, 220);
  }, []);

  const closePerson = useCallback(() => {
    setClosingPerson(true);
    setTimeout(() => { setSelectedPerson(null); setClosingPerson(false); }, 220);
  }, []);

  const closeTopModal = useCallback((immediate = false) => {
    if (quickActions) { setQuickActions(null); return; }
    if (movieRatingModal) { setMovieRatingModal(null); return; }
    if (ratingModal) { setRatingModal(null); return; }
    if (deleteModal) { setDeleteModal(null); return; }
    if (trailerId) { setTrailerId(null); return; }

    if (selectedPerson) {
      if (immediate) {
        setSelectedPerson(null);
        setClosingPerson(false);
      } else {
        closePerson();
      }
      return;
    }

    if (selectedItem) {
      if (immediate) {
        setSelectedItem(null);
        setClosingDetails(false);
      } else {
        closeDetails();
      }
    }
  }, [
    closeDetails,
    closePerson,
    deleteModal,
    movieRatingModal,
    quickActions,
    ratingModal,
    selectedItem,
    selectedPerson,
    trailerId,
  ]);

  const modalDepth = useMemo(() => (
    Number(Boolean(selectedItem)) +
    Number(Boolean(selectedPerson)) +
    Number(Boolean(trailerId)) +
    Number(Boolean(deleteModal)) +
    Number(Boolean(ratingModal)) +
    Number(Boolean(movieRatingModal)) +
    Number(Boolean(quickActions))
  ), [
    deleteModal,
    movieRatingModal,
    quickActions,
    ratingModal,
    selectedItem,
    selectedPerson,
    trailerId,
  ]);

  // Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Scroll to top on tab switch Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  useModalHistory({ modalDepth, closeTopModal });

  // Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Add pulse trigger Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
  const triggerAddPulse = useCallback((itemId) => {
    setAddPulseId(itemId);
    setTimeout(() => setAddPulseId(null), 450);
  }, []);

  // Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Shelf validation on libraryType change Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
  useEffect(() => {
    if (libraryType === 'movie') {
      if (!['all', 'planned', 'completed'].includes(shelf)) setShelf('planned');
    } else {
      if (!['all', 'watching', 'planned', 'completed', 'dropped'].includes(shelf)) setShelf('watching');
    }
  }, [libraryType]);

  useEffect(() => {
    if (shelf === 'planned' && sortBy === 'myRating') {
      setSortBy('dateAdded');
    }
  }, [shelf, sortBy]);

  useEffect(() => {
    if (libraryType === 'movie' && sortBy === 'remainingEpisodes') {
      setSortBy('dateAdded');
    }
  }, [libraryType, sortBy]);

  useEffect(() => {
    setSortBy(librarySortDefault);
  }, [librarySortDefault]);

  // Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Sync selectedItem with library changes Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
  useEffect(() => {
    const si = selectedItemRef.current;
    if (!si) return;
    const libEntry = library.find(x => x.mediaType === si.mediaType && x.id === si.id);
    if (libEntry) {
      setSelectedItem(prev => {
        if (!prev) return prev;
        if (prev.rating === libEntry.rating &&
            prev.watchedEpisodes === libEntry.watchedEpisodes &&
            prev.seasonRatings === libEntry.seasonRatings) return prev;
        return {
          ...prev,
          rating: libEntry.rating,
          watchedEpisodes: libEntry.watchedEpisodes || {},
          seasonRatings: libEntry.seasonRatings || {}
        };
      });
    }
  }, [library]);

  // Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Modal cleanup on selectedItem change Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
  useEffect(() => {
    if (!selectedItem) {
      if (ratingModal) setRatingModal(null);
      if (movieRatingModal && !movieRatingModal.item) setMovieRatingModal(null);
      return;
    }
    if (ratingModal && (selectedItem.mediaType !== 'tv' || selectedItem.id !== ratingModal.tvId)) {
      setRatingModal(null);
    }
    if (movieRatingModal && (
      !((movieRatingModal.item || selectedItem)?.mediaType === 'movie') ||
      (movieRatingModal.item || selectedItem)?.id !== movieRatingModal.movieId ||
      !isReleasedItem(movieRatingModal.item || selectedItem)
    )) {
      setMovieRatingModal(null);
    }
  }, [movieRatingModal, ratingModal, selectedItem]);

  // Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Global keyboard & scroll listeners Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') setQuickActions(null); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Context menu Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ */
  const openQuickActions = useCallback((item, x, y, options = {}) => {
    const showHideFromForYou = Boolean(options.showHideFromForYou);
    const menuWidth = 240;
    const menuHeight = item.mediaType === 'movie' ? 300 : 390;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const clampedX = Math.max(12, Math.min(x, viewW - menuWidth - 12));
    const clampedY = Math.max(12, Math.min(y, viewH - menuHeight - 12));
    setQuickActions({ item, x: clampedX, y: clampedY, showHideFromForYou });
  }, []);

  const onCardClick = (item) => {
    getFullDetails(item);
  };

  const notifyPersonalRecommendationsHiddenChanged = useCallback(() => {
    setPersonalRecommendationsHiddenVersion((prev) => prev + 1);
  }, []);

  const hideFromForYouRecommendations = useCallback((item) => {
    const changed = hidePersonalRecommendationForUser(currentUserId || 'anonymous', item?.mediaType, item?.id);
    if (changed) notifyPersonalRecommendationsHiddenChanged();
    setQuickActions(null);
  }, [currentUserId, notifyPersonalRecommendationsHiddenChanged]);

  const hydrateQuickAddedItemForPeopleStats = useCallback(async (item) => {
    if (!item?.id || !item?.mediaType) return;

    const existing = getLibraryEntry(item.mediaType, item.id);
    const hasCredits = Boolean(existing?.credits);
    const hasTvCreators = item.mediaType !== 'tv' || Array.isArray(existing?.created_by);
    const hasTvSeasons = item.mediaType !== 'tv' || Array.isArray(existing?.seasons);
    if (hasCredits && hasTvCreators && hasTvSeasons) return;

    try {
      const [detail, credits] = await tmdbFetchManyJson([
        { path: `/${item.mediaType}/${item.id}`, params: { language: TMDB_LANG } },
        { path: `/${item.mediaType}/${item.id}/credits`, params: { language: TMDB_LANG } },
      ]);

      if (!detail?.id || !credits) return;

      setLibrary((prev) => prev.map((entry) => {
        if (entry.mediaType !== item.mediaType || entry.id !== item.id) return entry;

        const entryHasCredits = Boolean(entry?.credits);
        const entryHasTvCreators = entry.mediaType !== 'tv' || Array.isArray(entry?.created_by);
        if (entryHasCredits && entryHasTvCreators) return entry;

        const mergedEntry = {
          ...detail,
          ...entry,
          credits,
        };

        if (Array.isArray(detail.created_by)) {
          mergedEntry.created_by = detail.created_by;
        }

        if (
          mergedEntry.mediaType === 'tv'
        ) {
          if (mergedEntry.status === 'completed') {
            const completionWatchedEpisodes = buildTvWatchedEpisodesForCompletion(detail, mergedEntry);
            if (Object.keys(completionWatchedEpisodes).length > 0) {
              mergedEntry.watchedEpisodes = completionWatchedEpisodes;
            }
          }
          mergedEntry.status = resolveTvProgressStatus(
            mergedEntry.status,
            mergedEntry.watchedEpisodes || {},
            detail,
            mergedEntry
          );
        }

        return mergedEntry;
      }));
    } catch (error) {
      console.warn(`Failed to hydrate quick-added ${item.mediaType}:${item.id} for people stats`, error);
    }
  }, [getLibraryEntry, TMDB_LANG, setLibrary]);

  const applyQuickMovieAction = useCallback((item, action) => {
    const released = isReleasedItem(item);
    if (action === 'planned') {
      addToLibrary(item, 'planned');
      void hydrateQuickAddedItemForPeopleStats(item);
      triggerAddPulse(`${item.mediaType}-${item.id}`);
    } else if (action === 'completed') {
      if (!released) return;
      const libEntry = getLibraryEntry('movie', item.id);
      addToLibrary(item, 'completed', 0, false);
      void hydrateQuickAddedItemForPeopleStats(item);
      triggerAddPulse(`${item.mediaType}-${item.id}`);
      setMovieRatingModal({ movieId: item.id, currentRating: libEntry?.rating || item.rating || 0, item });
    } else if (action === 'remove') {
      removeFromLibrary('movie', item.id);
    }
    setQuickActions(null);
  }, [addToLibrary, getLibraryEntry, hydrateQuickAddedItemForPeopleStats, removeFromLibrary, triggerAddPulse]);

  const applyQuickTvAction = useCallback((item, status) => {
    if (status === 'completed' && !isReleasedItem(item)) return;
    const existing = getLibraryEntry('tv', item.id);
    if (!existing) addToLibrary(item, status, 0, false);
    else setTvStatus(item.id, status, item);
    void hydrateQuickAddedItemForPeopleStats(item);
    triggerAddPulse(`${item.mediaType}-${item.id}`);
    setQuickActions(null);
  }, [addToLibrary, getLibraryEntry, hydrateQuickAddedItemForPeopleStats, setTvStatus, triggerAddPulse]);

  /* Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ API calls Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ */
  const getReleaseYear = (item) => {
    const date = item.release_date || item.first_air_date || '';
    const year = Number(date.slice(0, 4));
    return Number.isFinite(year) ? year : 0;
  };

  const compareByDateAdded = (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0);
  const compareByImdbRating = (a, b) => ((b.vote_average || 0) - (a.vote_average || 0)) || compareByDateAdded(a, b);
  const compareByMyRating = (a, b) => ((b.rating || 0) - (a.rating || 0)) || compareByDateAdded(a, b);
  const compareByReleaseYear = (a, b) => (getReleaseYear(b) - getReleaseYear(a)) || compareByDateAdded(a, b);
  const getRemainingEpisodesSortValue = (item) => {
    if (item?.mediaType !== 'tv') return Number.POSITIVE_INFINITY;
    const snapshot = getTvProgressSnapshot(item.watchedEpisodes || {}, item);
    if ((snapshot?.targetEpisodes || 0) <= 0) return Number.POSITIVE_INFINITY;
    return Number(snapshot.remainingToTarget) || 0;
  };
  const compareByRemainingEpisodes = (a, b) => {
    const aValue = getRemainingEpisodesSortValue(a);
    const bValue = getRemainingEpisodesSortValue(b);
    const aKnown = Number.isFinite(aValue);
    const bKnown = Number.isFinite(bValue);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (!aKnown && !bKnown) return compareByDateAdded(a, b);
    return (bValue - aValue) || compareByDateAdded(a, b);
  };

  const shownMovies = useMemo(() => {
    let arr = library.filter(x => x.mediaType === 'movie' && (shelf === 'all' || x.status === shelf));
    if (sortBy === 'imdbRating') arr.sort(compareByImdbRating);
    else if (sortBy === 'myRating') arr.sort(compareByMyRating);
    else if (sortBy === 'releaseYear') arr.sort(compareByReleaseYear);
    else arr.sort(compareByDateAdded);
    return arr;
  }, [library, shelf, sortBy]);

  const shownTv = useMemo(() => {
    let arr = library.filter(x => x.mediaType === 'tv' && (shelf === 'all' || x.status === shelf));
    if (sortBy === 'imdbRating') arr.sort(compareByImdbRating);
    else if (sortBy === 'myRating') arr.sort(compareByMyRating);
    else if (sortBy === 'releaseYear') arr.sort(compareByReleaseYear);
    else if (sortBy === 'remainingEpisodes') arr.sort(compareByRemainingEpisodes);
    else arr.sort(compareByDateAdded);
    return arr;
  }, [library, shelf, sortBy]);

  const shown = libraryType === 'movie' ? shownMovies : shownTv;

  /* Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ Stats Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ */
  const { movieStats, tvStats, peopleData } = useStatsSelectors({ library, peopleView });

  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="app-shell max-w-[740px] mx-auto px-4 md:px-6 pt-10 pb-12 relative">
        <div className="glass app-panel p-7 md:p-9 space-y-4">
          <h2 className="text-2xl font-black">Supabase not configured</h2>
          <p className="text-sm opacity-80">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment variables.
          </p>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="app-shell max-w-[740px] mx-auto px-4 md:px-6 pt-10 pb-12 relative">
        <div className="glass app-panel p-7 md:p-9">
          <p className="text-sm opacity-80">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthView
        t={t}
        lang={lang}
        setLang={setLang}
        mode={authMode}
        onModeChange={setAuthMode}
        onSignIn={signIn}
        onSignUp={signUp}
        isBusy={authBusy}
        error={authError}
        notice={authNotice}
      />
    );
  }

  if (!rolesReady) {
    return (
      <div className="app-shell max-w-[740px] mx-auto px-4 md:px-6 pt-10 pb-12 relative">
        <div className="glass app-panel p-7 md:p-9">
          <p className="text-sm opacity-80">{t.loading}</p>
        </div>
      </div>
    );
  }

  /* Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ RENDER Р Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљР Р†РІР‚СњР вЂљ */
  return (
    <div className="app-shell has-fixed-topbar max-w-[1180px] mx-auto px-4 md:px-6 pt-5 pb-28 md:pb-12 relative">
      {/* HEADER */}
      <div className="app-topbar mb-9">
        <button type="button" onClick={() => setActiveTab('catalog')} className="flex items-center gap-3 text-left cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-blue-500 text-white font-black text-xl flex items-center justify-center shadow-lg">M</div>
          <p className="text-3xl md:text-[2rem] font-black tracking-tight">MovieLog</p>
        </button>
        <div className="flex items-center gap-3">
          <div className="app-nav-wrap">
            {[
              { id: 'catalog', label: t.search },
              { id: 'library', label: t.shelf },
              { id: 'collections', label: t.recommendations },
              { id: 'stats', label: t.stats },
              { id: 'settings', label: t.settings }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`app-nav-btn ${activeTab === tab.id ? 'active' : ''}`}>
                {tab.label}
              </button>
            ))}
          </div>
          <span className="hidden xl:block text-xs opacity-55 max-w-[220px] truncate">
            {headerUserLabel}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="h-[46px] px-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-[11px] md:text-xs font-black uppercase tracking-widest transition-colors"
          >
            {t.authLogout}
          </button>
        </div>
      </div>

      {cloudSyncError && (
        <div className="mb-5 rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {t.authCloudSyncError}: {cloudSyncError}
        </div>
      )}
      {globalError && (
        <div className="mb-5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {globalError}
        </div>
      )}

      {/* CATALOG */}
      {activeTab === 'catalog' && (
        <div className="tab-enter" key="tab-catalog">
        <CatalogView
          {...catalog}
          getLibraryEntry={getLibraryEntry}
          openQuickActions={openQuickActions}
          onCardClick={onCardClick}
          t={t}
          STATUS_BADGE_CONFIG={STATUS_BADGE_CONFIG}
          addPulseId={addPulseId}
          autoLoadMoreOnScroll={autoLoadMoreOnScroll}
        />
        </div>
      )}

      {/* LIBRARY */}
      {activeTab === 'library' && (
        <div className="tab-enter" key="tab-library">
        <LibraryView
          shown={shown}
          library={library}
          libraryType={libraryType} setLibraryType={setLibraryType}
          shelf={shelf} setShelf={setShelf}
          sortBy={sortBy} setSortBy={setSortBy}
          MOVIE_STATUSES={MOVIE_STATUSES} TV_STATUSES={TV_STATUSES}
          lang={lang}
          t={t}
          onCardClick={onCardClick}
          openQuickActions={openQuickActions}
          setActiveTab={setActiveTab}
          autoLoadMoreOnScroll={autoLoadMoreOnScroll}
        />
        </div>
      )}

      {/* STATS */}
      {activeTab === 'stats' && (
        <div className="tab-enter" key="tab-stats">
        <StatsView
          movieStats={movieStats} tvStats={tvStats} peopleData={peopleData}
          t={t}
          statsView={statsView} setStatsView={setStatsView}
          peopleView={peopleView} setPeopleView={setPeopleView}
          getPersonDetails={getPersonDetails}
          getFullDetails={getFullDetails}
          openQuickActions={openQuickActions}
        />
        </div>
      )}

      {/* COLLECTIONS */}
      {activeTab === 'collections' && (
        <div className="tab-enter" key="tab-collections">
        <CollectionsView
          t={t}
          lang={lang}
          currentUserId={currentUserId}
          library={library}
          canAuthorMode={canAuthorMode}
          isAuthor={isAuthor}
          authorModeEnabled={authorModeEnabled}
          setAuthorModeEnabled={setAuthorModeEnabled}
          personalRecommendationsHiddenVersion={personalRecommendationsHiddenVersion}
          getLibraryEntry={getLibraryEntry}
          openQuickActions={openQuickActions}
          onCardClick={onCardClick}
          STATUS_BADGE_CONFIG={STATUS_BADGE_CONFIG}
          autoLoadMoreOnScroll={autoLoadMoreOnScroll}
        />
        </div>
      )}

      {/* SETTINGS */}
      {activeTab === 'settings' && (
        <div className="tab-enter" key="tab-settings">
        <SettingsView
          library={library} setLibrary={setLibrary}
          currentUserId={currentUserId}
          authUser={session.user}
          userProfile={currentUserProfile}
          onSaveProfile={saveUserProfile}
          profileSaving={authBusy}
          t={t}
          theme={theme} setTheme={setTheme}
          lang={lang} setLang={setLang}
          startTab={startTab} setStartTab={setStartTab}
          librarySortDefault={librarySortDefault} setLibrarySortDefault={setLibrarySortDefault}
          persistCatalogFilters={persistCatalogFilters} setPersistCatalogFilters={setPersistCatalogFilters}
          autoLoadMoreOnScroll={autoLoadMoreOnScroll} setAutoLoadMoreOnScroll={setAutoLoadMoreOnScroll}
          importMode={importMode} setImportMode={setImportMode}
          reducedMotion={reducedMotion} setReducedMotion={setReducedMotion}
          canAuthorMode={canAuthorMode}
          authorModeEnabled={authorModeEnabled}
          setAuthorModeEnabled={setAuthorModeEnabled}
          confirmClear={confirmClear} setConfirmClear={setConfirmClear}
          personalRecommendationsHiddenVersion={personalRecommendationsHiddenVersion}
          onPersonalRecommendationsHiddenChanged={notifyPersonalRecommendationsHiddenChanged}
          onCardClick={onCardClick}
        />
        </div>
      )}

      {/* DETAILS MODAL */}
      <DetailsModal
        selectedItem={selectedItem}
        isClosing={closingDetails} onClose={closeDetails}
        t={t} DATE_LOCALE={DATE_LOCALE}
        TV_SHOW_STATUS_MAP={TV_SHOW_STATUS_MAP} TV_STATUSES={TV_STATUSES} CREW_ROLE_MAP={CREW_ROLE_MAP}
        getLibraryEntry={getLibraryEntry} addToLibrary={addToLibrary}
        setTvStatus={setTvStatus} setDeleteModal={setDeleteModal}
        setTrailerId={setTrailerId} setRatingModal={setRatingModal} setMovieRatingModal={setMovieRatingModal}
        seasonEpisodes={seasonEpisodes} loadingSeason={loadingSeason}
        loadSeasonEpisodes={loadSeasonEpisodes}
        handleEpisodeClick={handleEpisodeClick} handleSeasonToggle={handleSeasonToggle}
        getPersonDetails={getPersonDetails} getFullDetails={getFullDetails}
        triggerAddPulse={triggerAddPulse}
      />

      {/* QUICK ACTIONS */}
      <QuickActionsMenu
        quickActions={quickActions} setQuickActions={setQuickActions}
        t={t} TV_STATUSES={TV_STATUSES}
        getLibraryEntry={getLibraryEntry}
        applyQuickMovieAction={applyQuickMovieAction}
        applyQuickTvAction={applyQuickTvAction}
        hideFromForYouRecommendations={hideFromForYouRecommendations}
        removeFromLibrary={removeFromLibrary}
      />

      {/* RATING MODALS */}
      {ratingModal && (
        <RatingModal
          title={`${t.rateSeasonTitle} ${ratingModal.seasonNumber}`}
          subtitle={t.chooseRating}
          removeLabel={ratingModal.currentRating > 0 ? t.removeRating : t.leaveUnrated}
          cancelLabel={t.cancel}
          confirmLabel={t.confirmRating}
          currentRating={ratingModal.currentRating}
          onRate={(rating) => {
            const libEntry = getLibraryEntry('tv', ratingModal.tvId);
            if (libEntry) {
              setSeasonRating(ratingModal.tvId, ratingModal.seasonNumber, rating);
              const updatedRatings = {...(selectedItem.seasonRatings || {}), [ratingModal.seasonNumber]: rating};
              const ratedSeasons = Object.values(updatedRatings);
              const avg = ratedSeasons.length > 0 ? Math.round(ratedSeasons.reduce((s, r) => s + r, 0) / ratedSeasons.length) : 0;
              const updatedWatched = {...(selectedItem.watchedEpisodes || {})};
              const season = selectedItem?.seasons?.find(s => s.season_number === ratingModal.seasonNumber);
              if (season) updatedWatched[ratingModal.seasonNumber] = Array.from({ length: season.episode_count }, (_, i) => i + 1);
              setSelectedItem({...selectedItem, seasonRatings: updatedRatings, rating: avg, watchedEpisodes: updatedWatched});
            } else {
              const season = selectedItem?.seasons?.find(s => s.season_number === ratingModal.seasonNumber);
              const watchedEpisodes = season ? { [ratingModal.seasonNumber]: Array.from({ length: season.episode_count }, (_, i) => i + 1) } : {};
              setLibrary(prev => [...prev, { ...selectedItem, status: 'watching', rating, dateAdded: Date.now(), watchedEpisodes, seasonRatings: { [ratingModal.seasonNumber]: rating }, episodeRuntimes: {} }]);
              setSelectedItem({...selectedItem, watchedEpisodes, seasonRatings: { [ratingModal.seasonNumber]: rating }, rating});
            }
            setRatingModal(null);
          }}
          onRemove={() => {
            if (ratingModal.currentRating > 0) {
              setSeasonRating(ratingModal.tvId, ratingModal.seasonNumber, 0);
              const updatedRatings = {...(selectedItem.seasonRatings || {})};
              delete updatedRatings[ratingModal.seasonNumber];
              const ratedSeasons = Object.values(updatedRatings);
              const avg = ratedSeasons.length > 0 ? Math.round(ratedSeasons.reduce((s, r) => s + r, 0) / ratedSeasons.length) : 0;
              setSelectedItem({...selectedItem, seasonRatings: updatedRatings, rating: avg});
              setRatingModal(null);
              return;
            }

            const season = selectedItem?.seasons?.find(s => s.season_number === ratingModal.seasonNumber);
            const seasonEpisodes = season
              ? Array.from({ length: season.episode_count }, (_, i) => i + 1)
              : [];
            const libEntry = getLibraryEntry('tv', ratingModal.tvId);

            if (libEntry) {
              const updatedWatched = {...(selectedItem.watchedEpisodes || {})};
              if (seasonEpisodes.length > 0) updatedWatched[ratingModal.seasonNumber] = seasonEpisodes;

              const updatedRatings = {...(selectedItem.seasonRatings || {})};
              delete updatedRatings[ratingModal.seasonNumber];

              const ratedSeasons = Object.values(updatedRatings);
              const avg = ratedSeasons.length > 0 ? Math.round(ratedSeasons.reduce((s, r) => s + r, 0) / ratedSeasons.length) : 0;
              const baseStatus = libEntry.status === 'planned' ? 'watching' : (libEntry.status || 'watching');
              const newStatus = resolveTvProgressStatus(baseStatus, updatedWatched, selectedItem, libEntry);

              setLibrary(prev => prev.map(x => (
                x.mediaType === 'tv' && x.id === ratingModal.tvId
                  ? { ...x, watchedEpisodes: updatedWatched, seasonRatings: updatedRatings, rating: avg, status: newStatus }
                  : x
              )));
              setSelectedItem({...selectedItem, watchedEpisodes: updatedWatched, seasonRatings: updatedRatings, rating: avg, status: newStatus});
            } else {
              const watchedEpisodes = seasonEpisodes.length > 0 ? { [ratingModal.seasonNumber]: seasonEpisodes } : {};
              const newStatus = resolveTvProgressStatus('watching', watchedEpisodes, selectedItem);
              setLibrary(prev => [...prev, {
                ...selectedItem,
                status: newStatus,
                rating: 0,
                dateAdded: Date.now(),
                watchedEpisodes,
                seasonRatings: {},
                episodeRuntimes: {},
              }]);
              setSelectedItem({...selectedItem, watchedEpisodes, seasonRatings: {}, rating: 0, status: newStatus});
            }

            setRatingModal(null);
          }}
          onClose={() => setRatingModal(null)}
        />
      )}

      {movieRatingModal && (
        <RatingModal
          title={t.rateMovieTitle}
          subtitle={t.chooseRating}
          removeLabel={movieRatingModal.currentRating > 0 ? t.removeRating : t.leaveUnrated}
          cancelLabel={t.cancel}
          confirmLabel={t.confirmRating}
          currentRating={movieRatingModal.currentRating}
          onRate={(rating) => {
            const contextItem = movieRatingModal.item || selectedItem;
            if (!contextItem || !isReleasedItem(contextItem)) { setMovieRatingModal(null); return; }
            const libEntry = getLibraryEntry('movie', movieRatingModal.movieId);
            if (libEntry) {
              setLibrary(prev => prev.map(x => x.mediaType === 'movie' && x.id === movieRatingModal.movieId ? { ...x, rating, status: 'completed' } : x));
            } else {
              setLibrary(prev => [...prev, { ...contextItem, status: 'completed', rating, dateAdded: Date.now() }]);
            }
            setSelectedItem(prev => {
              if (!prev || prev.mediaType !== 'movie' || prev.id !== movieRatingModal.movieId) return prev;
              return { ...prev, rating };
            });
            setMovieRatingModal(null);
          }}
          onRemove={() => {
            const contextItem = movieRatingModal.item || selectedItem;
            if (!contextItem || !isReleasedItem(contextItem)) { setMovieRatingModal(null); return; }
            setLibrary(prev => prev.map(x => x.mediaType === 'movie' && x.id === movieRatingModal.movieId ? { ...x, rating: 0, status: 'completed' } : x));
            setSelectedItem(prev => {
              if (!prev || prev.mediaType !== 'movie' || prev.id !== movieRatingModal.movieId) return prev;
              return { ...prev, rating: 0 };
            });
            setMovieRatingModal(null);
          }}
          onClose={() => setMovieRatingModal(null)}
        />
      )}

      {/* DELETE MODAL */}
      {deleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4" onClick={() => setDeleteModal(null)}>
          <div className="w-full max-w-md glass app-panel-padded p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">{'\u26A0\uFE0F'}</div>
              <h3 className="text-2xl font-black mb-3">{t.deleteConfirmTitle}</h3>
              <p className="text-sm opacity-80 mb-2">{deleteModal.title}</p>
              <p className="text-xs opacity-60">{deleteModal.mediaType === 'tv' ? t.deleteConfirmTv : t.deleteConfirmMovie}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { removeFromLibrary(deleteModal.mediaType, deleteModal.id); setSelectedItem(null); setDeleteModal(null); }}
                className="flex-1 py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg active:scale-95">{t.delete}</button>
              <button onClick={() => setDeleteModal(null)}
                className="flex-1 py-4 bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95">{t.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* PERSON MODAL */}
      <PersonModal
        selectedPerson={selectedPerson} setSelectedPerson={setSelectedPerson}
        isClosing={closingPerson} onClose={closePerson}
        library={library} t={t} DATE_LOCALE={DATE_LOCALE}
        STATUS_BADGE_CONFIG={STATUS_BADGE_CONFIG}
        getFullDetails={getFullDetails}
      />

      {/* TRAILER */}
      {trailerId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4" onClick={() => setTrailerId(null)}>
          <button className="absolute top-8 right-8 text-white text-4xl font-black z-[210]" onClick={() => setTrailerId(null)} title={t.close}>{'\u2715'}</button>
          <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${trailerId}?autoplay=1`} allow="autoplay; encrypted-media" allowFullScreen title="Trailer"></iframe>
          </div>
        </div>
      )}

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="scroll-top-btn fixed right-4 md:right-8 bottom-24 md:bottom-8 z-[95] w-12 h-12 rounded-full font-black text-xl shadow-2xl transition-all hover:scale-105 active:scale-95"
          aria-label="Scroll to top" title="Up"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5" /><path d="M6.5 10.5 12 5l5.5 5.5" />
          </svg>
        </button>
      )}

      {/* MOBILE NAV */}
      <nav className="mobile-bottom-nav fixed left-1/2 -translate-x-1/2 glass rounded-[3rem] border border-white/10 flex p-2 z-[90] shadow-2xl md:hidden">
        {[
          { id: 'catalog', icon: '\u{1F50D}', label: t.search },
          { id: 'library', icon: '\u{1F4DA}', label: t.shelf },
          { id: 'collections', icon: '\u{1F381}', label: t.recommendations },
          { id: 'stats', icon: '\u{1F4CA}', label: t.stats },
          { id: 'settings', icon: '\u2699\uFE0F', label: t.settings }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center px-4 md:px-6 py-3 rounded-[2.5rem] transition-all ${activeTab === tab.id ? 'mobile-nav-active scale-105' : 'opacity-65 hover:opacity-100'}`}>
            <span className="text-2xl">{tab.icon}</span>
            <span className="mobile-nav-label text-[10px] font-black tracking-tight mt-1">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}


