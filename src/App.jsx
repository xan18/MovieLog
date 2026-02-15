import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { RatingModal } from './components/ui.jsx';
import { useDebouncedStorageState } from './hooks/useDebouncedStorageState.js';
import { useAppSettings } from './hooks/useAppSettings.js';
import { useCatalog } from './hooks/useCatalog.js';
import { useLibrary } from './hooks/useLibrary.js';
import { tmdbUrl } from './services/tmdb.js';
import { isSupabaseConfigured, supabase } from './services/supabase.js';
import { getMovieStatuses, getTvStatuses, getStatusBadgeConfig, getTvShowStatusMap, getCrewRoleMap } from './utils/statusConfig.js';
import { isReleasedItem } from './utils/releaseUtils.js';
import { sanitizeLibraryData } from './utils/librarySanitizer.js';
import { STORAGE_KEY } from './constants/appConstants.js';
import { I18N } from './i18n/translations.js';

import CatalogView from './components/views/CatalogView.jsx';
import LibraryView from './components/views/LibraryView.jsx';
import StatsView from './components/views/StatsView.jsx';
import SettingsView from './components/views/SettingsView.jsx';
import AuthView from './components/views/AuthView.jsx';
import DetailsModal from './components/modals/DetailsModal.jsx';
import QuickActionsMenu from './components/modals/QuickActionsMenu.jsx';
import PersonModal from './components/modals/PersonModal.jsx';

/* в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ Main App в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
export default function App() {
  const {
    theme, setTheme,
    lang, setLang,
    startTab, setStartTab,
    librarySortDefault, setLibrarySortDefault,
    persistCatalogFilters, setPersistCatalogFilters,
    longPressMs, setLongPressMs,
    importMode, setImportMode,
    reducedMotion, setReducedMotion,
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
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState('');

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState(startTab);
  const [statsView, setStatsView] = useState('statistics');
  const [peopleView, setPeopleView] = useState('directors');
  const [libraryType, setLibraryType] = useState('movie');
  const [shelf, setShelf] = useState('planned');
  const [sortBy, setSortBy] = useState(librarySortDefault);
  const [showScrollTop, setShowScrollTop] = useState(false);

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
  const [confirmClear, setConfirmClear] = useState(false);
  const [closingDetails, setClosingDetails] = useState(false);
  const [closingPerson, setClosingPerson] = useState(false);
  const [addPulseId, setAddPulseId] = useState(null);

  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  const longPressTimer = useRef(null);
  const longPressActivated = useRef(false);
  const skipNextCloudSyncRef = useRef(false);
  const lastCloudSyncRef = useRef('');

  // Hooks
  const catalog = useCatalog({ lang, t, persistCatalogFilters });

  const {
    getLibraryEntry, addToLibrary, setTvStatus,
    setSeasonRating,
    removeFromLibrary, handleEpisodeClick, handleSeasonToggle,
  } = useLibrary({ library, setLibrary, setSelectedItem, selectedItemRef });

  const currentUserId = session?.user?.id || null;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let active = true;

    const initSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data?.session || null);
      setAuthReady(true);
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession || null);
      setAuthError('');
      setAuthNotice('');
      setCloudSyncError('');
      setCloudReady(false);
      if (!nextSession && event === 'SIGNED_OUT') {
        setLibrary([]);
        lastCloudSyncRef.current = '';
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setLibrary]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !currentUserId) return;

    let cancelled = false;
    setCloudReady(false);
    setCloudSyncError('');

    const loadCloudLibrary = async () => {
      const { data, error } = await supabase
        .from('library_items')
        .select('payload')
        .eq('user_id', currentUserId);

      if (cancelled) return;
      if (error) {
        setCloudSyncError(error.message);
        setCloudReady(true);
        return;
      }

      const remoteLibrary = sanitizeLibraryData((data || []).map((row) => row.payload));
      if (remoteLibrary.length > 0) {
        skipNextCloudSyncRef.current = true;
        setLibrary(remoteLibrary);
        lastCloudSyncRef.current = JSON.stringify(remoteLibrary);
      } else {
        lastCloudSyncRef.current = '';
      }

      setCloudReady(true);
    };

    loadCloudLibrary();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, setLibrary]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !currentUserId || !cloudReady) return;
    if (skipNextCloudSyncRef.current) {
      skipNextCloudSyncRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      const fingerprint = JSON.stringify(library);
      if (fingerprint === lastCloudSyncRef.current) return;

      try {
        setCloudSyncError('');

        if (library.length === 0) {
          const { error } = await supabase
            .from('library_items')
            .delete()
            .eq('user_id', currentUserId);

          if (error) throw error;
          lastCloudSyncRef.current = fingerprint;
          return;
        }

        const rows = library.map((item) => ({
          user_id: currentUserId,
          media_type: item.mediaType,
          tmdb_id: item.id,
          payload: item,
        }));

        const { error: upsertError } = await supabase
          .from('library_items')
          .upsert(rows, { onConflict: 'user_id,media_type,tmdb_id' });

        if (upsertError) throw upsertError;

        const { data: existingRows, error: existingError } = await supabase
          .from('library_items')
          .select('media_type,tmdb_id')
          .eq('user_id', currentUserId);

        if (existingError) throw existingError;

        const currentIds = {
          movie: new Set(),
          tv: new Set(),
        };

        library.forEach((item) => {
          const type = item.mediaType === 'tv' ? 'tv' : 'movie';
          currentIds[type].add(Number(item.id));
        });

        const stale = { movie: [], tv: [] };

        (existingRows || []).forEach((row) => {
          const type = row.media_type === 'tv' ? 'tv' : 'movie';
          const id = Number(row.tmdb_id);
          if (!currentIds[type].has(id)) stale[type].push(id);
        });

        for (const mediaType of ['movie', 'tv']) {
          if (!stale[mediaType].length) continue;
          const { error: deleteError } = await supabase
            .from('library_items')
            .delete()
            .eq('user_id', currentUserId)
            .eq('media_type', mediaType)
            .in('tmdb_id', stale[mediaType]);
          if (deleteError) throw deleteError;
        }

        lastCloudSyncRef.current = fingerprint;
      } catch (err) {
        setCloudSyncError(err?.message || t.authCloudSyncError);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [cloudReady, currentUserId, library, t.authCloudSyncError]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setAuthBusy(false);
  }, []);

  const signUp = useCallback(async (email, password) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setAuthError(error.message);
    } else if (!data?.session) {
      setAuthNotice(t.authCheckEmail);
    }
    setAuthBusy(false);
  }, [t.authCheckEmail]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
  }, []);

  // в”Ђв”Ђ Close modals with animation в”Ђв”Ђ
  const closeDetails = useCallback(() => {
    setClosingDetails(true);
    setTimeout(() => { setSelectedItem(null); setClosingDetails(false); }, 220);
  }, []);

  const closePerson = useCallback(() => {
    setClosingPerson(true);
    setTimeout(() => { setSelectedPerson(null); setClosingPerson(false); }, 220);
  }, []);

  // в”Ђв”Ђ Scroll to top on tab switch в”Ђв”Ђ
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // в”Ђв”Ђ Add pulse trigger в”Ђв”Ђ
  const triggerAddPulse = useCallback((itemId) => {
    setAddPulseId(itemId);
    setTimeout(() => setAddPulseId(null), 450);
  }, []);

  // в”Ђв”Ђ Shelf validation on libraryType change в”Ђв”Ђ
  useEffect(() => {
    if (libraryType === 'movie') {
      if (!['planned', 'completed'].includes(shelf)) setShelf('planned');
    } else {
      if (!['watching', 'planned', 'completed', 'dropped', 'on_hold'].includes(shelf)) setShelf('watching');
    }
  }, [libraryType]);

  useEffect(() => {
    if (shelf === 'planned' && sortBy === 'myRating') {
      setSortBy('dateAdded');
    }
  }, [shelf, sortBy]);

  useEffect(() => {
    setSortBy(librarySortDefault);
  }, [librarySortDefault]);

  // в”Ђв”Ђ Sync selectedItem with library changes в”Ђв”Ђ
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

  // в”Ђв”Ђ Modal cleanup on selectedItem change в”Ђв”Ђ
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

  // в”Ђв”Ђ Global keyboard & scroll listeners в”Ђв”Ђ
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') setQuickActions(null); };
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('keydown', onEsc);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ Context menu & touch в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
  const openQuickActions = useCallback((item, x, y) => {
    const menuWidth = 240;
    const menuHeight = item.mediaType === 'movie' ? 240 : 330;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const clampedX = Math.max(12, Math.min(x, viewW - menuWidth - 12));
    const clampedY = Math.max(12, Math.min(y, viewH - menuHeight - 12));
    setQuickActions({ item, x: clampedX, y: clampedY });
  }, []);

  const onCardContextMenu = useCallback((e, item) => {
    e.preventDefault();
    openQuickActions(item, e.clientX, e.clientY);
  }, [openQuickActions]);

  const onCardTouchStart = useCallback((e, item) => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    longPressActivated.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressActivated.current = true;
      openQuickActions(item, touch.clientX, touch.clientY);
    }, longPressMs);
  }, [openQuickActions, longPressMs]);

  const onCardTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const onCardClick = (item) => {
    if (longPressActivated.current) { longPressActivated.current = false; return; }
    getFullDetails(item);
  };

  const applyQuickMovieAction = useCallback((item, action) => {
    const released = isReleasedItem(item);
    if (action === 'planned') {
      addToLibrary(item, 'planned');
      triggerAddPulse(`${item.mediaType}-${item.id}`);
    } else if (action === 'completed') {
      if (!released) return;
      const libEntry = getLibraryEntry('movie', item.id);
      addToLibrary(item, 'completed', 0, false);
      triggerAddPulse(`${item.mediaType}-${item.id}`);
      setMovieRatingModal({ movieId: item.id, currentRating: libEntry?.rating || item.rating || 0, item });
    } else if (action === 'remove') {
      removeFromLibrary('movie', item.id);
    }
    setQuickActions(null);
  }, [addToLibrary, getLibraryEntry, removeFromLibrary, triggerAddPulse]);

  const applyQuickTvAction = useCallback((item, status) => {
    if (status === 'completed' && !isReleasedItem(item)) return;
    const existing = getLibraryEntry('tv', item.id);
    if (!existing) addToLibrary(item, status, 0, false);
    else setTvStatus(item.id, status, item);
    triggerAddPulse(`${item.mediaType}-${item.id}`);
    setQuickActions(null);
  }, [addToLibrary, getLibraryEntry, setTvStatus, triggerAddPulse]);

  /* в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ API calls в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
  const getFullDetails = useCallback(async (item) => {
    try {
      const [detailRes, creditsRes, videosRes, recsRes] = await Promise.all([
        fetch(tmdbUrl(`/${item.mediaType}/${item.id}`, { language: TMDB_LANG })),
        fetch(tmdbUrl(`/${item.mediaType}/${item.id}/credits`)),
        fetch(tmdbUrl(`/${item.mediaType}/${item.id}/videos`, { language: TMDB_LANG })),
        fetch(tmdbUrl(`/${item.mediaType}/${item.id}/recommendations`, { language: TMDB_LANG }))
      ]);
      const [detail, credits, videos, recs] = await Promise.all([
        detailRes.json(), creditsRes.json(), videosRes.json(), recsRes.json()
      ]);
      const trailer = (videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
      const libEntry = library.find(x => x.mediaType === item.mediaType && x.id === item.id);

      let collectionParts = null;
      if (item.mediaType === 'movie' && detail.belongs_to_collection) {
        try {
          const colRes = await fetch(tmdbUrl(`/collection/${detail.belongs_to_collection.id}`, { language: TMDB_LANG }));
          const colData = await colRes.json();
          if (colData?.parts) {
            collectionParts = {
              name: colData.name,
              parts: colData.parts.sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
            };
          }
        } catch {}
      }

      let relatedShows = null;
      if (item.mediaType === 'tv') {
        try {
          const keywordsRes = await fetch(tmdbUrl(`/tv/${item.id}/keywords`));
          const keywordsData = await keywordsRes.json();
          const rawKeywords = (keywordsData?.results || []).filter(k => k?.id && k?.name);

          const genericKeywordPatterns = [
            /^(tv|television|series|show|drama|comedy|thriller|mystery)$/i,
            /^(miniseries|mini[- ]?series)$/i,
            /^(based on (a )?(novel|book|comic|manga))$/i,
            /^(female protagonist|male protagonist)$/i,
            /^(period drama|historical fiction)$/i
          ];

          const filteredKeywords = rawKeywords
            .filter(k => !genericKeywordPatterns.some(rx => rx.test(k.name.trim())))
            .slice(0, 8);

          const keywordLists = await Promise.all(
            filteredKeywords.map(async (k) => {
              try {
                const res = await fetch(tmdbUrl(`/keyword/${k.id}/tv`, { language: TMDB_LANG, page: 1 }));
                const data = await res.json();
                return { keyword: k, data };
              } catch { return null; }
            })
          );

          const scored = new Map();
          keywordLists.filter(Boolean).forEach(({ data }) => {
            const total = Number(data?.total_results || 0);
            if (total < 2 || total > 12) return;
            (data?.results || []).forEach(show => {
              if (!show?.id || show.id === detail.id) return;
              const prev = scored.get(show.id) || { ...show, score: 0 };
              prev.score += 1;
              scored.set(show.id, prev);
            });
          });

          const relatedOnly = Array.from(scored.values())
            .filter(show => show.score > 0)
            .sort((a, b) => (b.score - a.score) || (a.first_air_date || '9999').localeCompare(b.first_air_date || '9999'))
            .slice(0, 20);

          if (relatedOnly.length > 0) {
            relatedShows = [
              { id: detail.id, name: detail.name, poster_path: detail.poster_path, first_air_date: detail.first_air_date, vote_average: detail.vote_average },
              ...relatedOnly
            ];
          }
        } catch {}
      }

      setSelectedItem({
        ...detail,
        mediaType: item.mediaType,
        credits,
        trailer: trailer?.key || null,
        recommendations: (recs?.results || []).slice(0, 10),
        rating: libEntry?.rating || 0,
        watchedEpisodes: libEntry?.watchedEpisodes || {},
        seasonRatings: libEntry?.seasonRatings || {},
        collectionParts,
        relatedShows
      });
      setSeasonEpisodes({});
    } catch {}
  }, [library, TMDB_LANG]);

  const getPersonDetails = useCallback(async (personId) => {
    try {
      const [personRes, creditsRes] = await Promise.all([
        fetch(tmdbUrl(`/person/${personId}`, { language: TMDB_LANG })),
        fetch(tmdbUrl(`/person/${personId}/combined_credits`, { language: TMDB_LANG }))
      ]);
      const [person, credits] = await Promise.all([personRes.json(), creditsRes.json()]);

      const allMovies = (credits.cast || []).filter(i => i.media_type === 'movie').map(i => ({ ...i, mediaType: 'movie' }));
      const allTvShows = (credits.cast || []).filter(i => i.media_type === 'tv').map(i => ({ ...i, mediaType: 'tv' }));
      const directedMovies = (credits.crew || []).filter(i => i.job === 'Director' && i.media_type === 'movie').map(i => ({ ...i, mediaType: 'movie' }));

      const uniqueContent = Array.from(
        new Map([...allMovies, ...allTvShows, ...directedMovies].map(i => [i.id, i])).values()
      ).sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''));

      const moviesInLibrary = uniqueContent.filter(item => {
        const libEntry = library.find(x => x.mediaType === item.mediaType && x.id === item.id);
        if (libEntry) { item.rating = libEntry.rating; item.inLibrary = true; return true; }
        return false;
      });

      const ratedInLib = moviesInLibrary.filter(m => m.rating > 0);
      const avgRating = ratedInLib.length > 0
        ? (ratedInLib.reduce((sum, m) => sum + m.rating, 0) / ratedInLib.length).toFixed(1)
        : 0;

      setSelectedPerson({
        ...person, allMovies: uniqueContent, moviesInLibrary,
        avgRating: isNaN(avgRating) ? 0 : avgRating
      });
    } catch (err) { console.error('Error fetching person:', err); }
  }, [library, TMDB_LANG]);

  const loadSeasonEpisodes = useCallback(async (tvId, seasonNumber) => {
    if (seasonEpisodes[seasonNumber]) return;
    setLoadingSeason(seasonNumber);
    try {
      const res = await fetch(tmdbUrl(`/tv/${tvId}/season/${seasonNumber}`, { language: TMDB_LANG }));
      const data = await res.json();
      const eps = data.episodes || [];
      setSeasonEpisodes(prev => ({ ...prev, [seasonNumber]: eps }));

      const runtimeMap = {};
      eps.forEach(ep => { if (ep.runtime > 0) runtimeMap[ep.episode_number] = ep.runtime; });
      if (Object.keys(runtimeMap).length > 0) {
        setLibrary(prev => prev.map(x => {
          if (x.mediaType === 'tv' && x.id === tvId) {
            const er = { ...(x.episodeRuntimes || {}), [seasonNumber]: runtimeMap };
            return { ...x, episodeRuntimes: er };
          }
          return x;
        }));
      }
    } catch {}
    setLoadingSeason(null);
  }, [seasonEpisodes, TMDB_LANG, setLibrary]);

  /* в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ Library views в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
  const getReleaseYear = (item) => {
    const date = item.release_date || item.first_air_date || '';
    const year = Number(date.slice(0, 4));
    return Number.isFinite(year) ? year : 0;
  };

  const compareByDateAdded = (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0);
  const compareByImdbRating = (a, b) => ((b.vote_average || 0) - (a.vote_average || 0)) || compareByDateAdded(a, b);
  const compareByMyRating = (a, b) => ((b.rating || 0) - (a.rating || 0)) || compareByDateAdded(a, b);
  const compareByReleaseYear = (a, b) => (getReleaseYear(b) - getReleaseYear(a)) || compareByDateAdded(a, b);

  const shownMovies = useMemo(() => {
    let arr = library.filter(x => x.mediaType === 'movie' && x.status === shelf);
    if (sortBy === 'imdbRating') arr.sort(compareByImdbRating);
    else if (sortBy === 'myRating') arr.sort(compareByMyRating);
    else if (sortBy === 'releaseYear') arr.sort(compareByReleaseYear);
    else arr.sort(compareByDateAdded);
    return arr;
  }, [library, shelf, sortBy]);

  const shownTv = useMemo(() => {
    let arr = library.filter(x => x.mediaType === 'tv' && x.status === shelf);
    if (sortBy === 'imdbRating') arr.sort(compareByImdbRating);
    else if (sortBy === 'myRating') arr.sort(compareByMyRating);
    else if (sortBy === 'releaseYear') arr.sort(compareByReleaseYear);
    else arr.sort(compareByDateAdded);
    return arr;
  }, [library, shelf, sortBy]);

  const shown = libraryType === 'movie' ? shownMovies : shownTv;

  /* в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ Stats в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
  const movieStats = useMemo(() => {
    const movies = library.filter(x => x.mediaType === 'movie');
    const completed = movies.filter(x => x.status === 'completed');
    const planned = movies.filter(x => x.status === 'planned');
    const rated = completed.filter(x => x.rating > 0);
    const totalRuntime = completed.reduce((sum, m) => sum + (m.runtime || 0), 0);
    const avgRating = rated.length > 0 ? (rated.reduce((s, m) => s + m.rating, 0) / rated.length).toFixed(1) : 0;

    const byYear = {}, byGenre = {}, ratingDist = {}, byDecade = {};
    completed.forEach(m => {
      const y = m.release_date ? new Date(m.release_date).getFullYear() : 'Unknown';
      byYear[y] = (byYear[y] || 0) + 1;
      (Array.isArray(m.genres) ? m.genres : []).forEach(g => {
        if (!g?.name) return;
        byGenre[g.name] = (byGenre[g.name] || 0) + 1;
      });
      if (m.release_date) {
        const decade = Math.floor(new Date(m.release_date).getFullYear() / 10) * 10;
        byDecade[decade] = (byDecade[decade] || 0) + 1;
      }
    });
    rated.forEach(m => { ratingDist[m.rating] = (ratingDist[m.rating] || 0) + 1; });

    const topRated = [...rated].sort((a, b) => b.rating - a.rating).slice(0, 5);
    const favDecade = Object.entries(byDecade).sort(([,a],[,b]) => b - a)[0];

    return {
      total: movies.length, completed: completed.length, planned: planned.length,
      rated: rated.length, totalRuntime, avgRating, byYear, byGenre, ratingDist,
      topRated, favDecade: favDecade ? `${favDecade[0]}-е` : null
    };
  }, [library]);

  const tvStats = useMemo(() => {
    const shows = library.filter(x => x.mediaType === 'tv');
    const completed = shows.filter(x => x.status === 'completed');
    const watching = shows.filter(x => x.status === 'watching');
    const planned = shows.filter(x => x.status === 'planned');
    const dropped = shows.filter(x => x.status === 'dropped');
    const onHold = shows.filter(x => x.status === 'on_hold');
    const ratedFromSeasons = shows
      .map((show) => {
        const seasonRatings = Object.values(show.seasonRatings || {}).filter((r) => Number(r) > 0);
        if (seasonRatings.length === 0) return null;
        const avgFromSeasons = Math.round(seasonRatings.reduce((sum, r) => sum + Number(r), 0) / seasonRatings.length);
        return { ...show, rating: avgFromSeasons };
      })
      .filter(Boolean);
    const avgRating = ratedFromSeasons.length > 0
      ? (ratedFromSeasons.reduce((s, sh) => s + sh.rating, 0) / ratedFromSeasons.length).toFixed(1)
      : 0;

    let totalEpisodes = 0, totalSeasons = 0, totalRuntime = 0;
    shows.forEach(sh => {
      const w = sh.watchedEpisodes || {};
      const er = sh.episodeRuntimes || {};
      const fallbackRuntime = (sh.episode_run_time && sh.episode_run_time.length > 0) ? sh.episode_run_time[0] : 45;
      Object.entries(w).forEach(([seasonNum, eps]) => {
        const safeEpisodes = Array.isArray(eps) ? eps : [];
        totalEpisodes += safeEpisodes.length;
        if (safeEpisodes.length > 0) totalSeasons++;
        const seasonRuntimes = er[seasonNum] || {};
        safeEpisodes.forEach(epNum => { totalRuntime += seasonRuntimes[epNum] || fallbackRuntime; });
      });
    });

    const byYear = {}, byGenre = {}, ratingDist = {};
    completed.forEach(sh => {
      const y = sh.first_air_date ? new Date(sh.first_air_date).getFullYear() : 'Unknown';
      byYear[y] = (byYear[y] || 0) + 1;
    });
    shows.forEach(sh => {
      (Array.isArray(sh.genres) ? sh.genres : []).forEach(g => {
        if (!g?.name) return;
        byGenre[g.name] = (byGenre[g.name] || 0) + 1;
      });
    });
    ratedFromSeasons.forEach((show) => {
      ratingDist[show.rating] = (ratingDist[show.rating] || 0) + 1;
    });
    const topRated = [...ratedFromSeasons].sort((a, b) => b.rating - a.rating).slice(0, 5);

    return {
      total: shows.length, completed: completed.length, watching: watching.length,
      planned: planned.length, dropped: dropped.length, onHold: onHold.length,
      rated: ratedFromSeasons.length, totalEpisodes, totalSeasons, totalRuntime,
      avgRating, byYear, byGenre, ratingDist, topRated
    };
  }, [library]);

  const peopleData = useMemo(() => {
    const peopleMap = {};
    library.forEach(item => {
      if (!item.credits) return;
      if (peopleView === 'directors') {
        if (item.mediaType === 'movie') {
          const director = item.credits.crew?.find(p => p.job === 'Director');
          if (director) {
            if (!peopleMap[director.id]) peopleMap[director.id] = { ...director, items: [], totalRating: 0, ratedCount: 0 };
            peopleMap[director.id].items.push(item);
            if (item.rating > 0) { peopleMap[director.id].totalRating += item.rating; peopleMap[director.id].ratedCount++; }
          }
        }
        if (item.mediaType === 'tv' && item.created_by) {
          item.created_by.forEach(creator => {
            if (!peopleMap[creator.id]) peopleMap[creator.id] = { ...creator, items: [], totalRating: 0, ratedCount: 0 };
            peopleMap[creator.id].items.push(item);
            if (item.rating > 0) { peopleMap[creator.id].totalRating += item.rating; peopleMap[creator.id].ratedCount++; }
          });
        }
      } else {
        const cast = Array.isArray(item.credits.cast) ? item.credits.cast : [];
        cast.slice(0, 5).forEach(actor => {
          if (!peopleMap[actor.id]) peopleMap[actor.id] = { ...actor, items: [], totalRating: 0, ratedCount: 0 };
          peopleMap[actor.id].items.push(item);
          if (item.rating > 0) { peopleMap[actor.id].totalRating += item.rating; peopleMap[actor.id].ratedCount++; }
        });
      }
    });
    return Object.values(peopleMap)
      .map(p => ({ ...p, avgRating: p.ratedCount > 0 ? (p.totalRating / p.ratedCount).toFixed(1) : 0 }))
      .sort((a, b) => b.items.length - a.items.length || Number(b.avgRating) - Number(a.avgRating))
      .slice(0, 20);
  }, [library, peopleView]);

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

  /* в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ RENDER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
  return (
    <div className="app-shell max-w-[1180px] mx-auto px-4 md:px-6 pt-5 pb-28 md:pb-12 relative">
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
            {session.user.email}
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
          t={t}
          onCardClick={onCardClick}
          openQuickActions={openQuickActions}
          onCardContextMenu={onCardContextMenu}
          onCardTouchStart={onCardTouchStart}
          onCardTouchEnd={onCardTouchEnd}
          setActiveTab={setActiveTab}
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
        />
        </div>
      )}

      {/* SETTINGS */}
      {activeTab === 'settings' && (
        <div className="tab-enter" key="tab-settings">
        <SettingsView
          library={library} setLibrary={setLibrary}
          t={t}
          theme={theme} setTheme={setTheme}
          lang={lang} setLang={setLang}
          startTab={startTab} setStartTab={setStartTab}
          librarySortDefault={librarySortDefault} setLibrarySortDefault={setLibrarySortDefault}
          persistCatalogFilters={persistCatalogFilters} setPersistCatalogFilters={setPersistCatalogFilters}
          longPressMs={longPressMs} setLongPressMs={setLongPressMs}
          importMode={importMode} setImportMode={setImportMode}
          reducedMotion={reducedMotion} setReducedMotion={setReducedMotion}
          confirmClear={confirmClear} setConfirmClear={setConfirmClear}
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
        removeFromLibrary={removeFromLibrary}
      />

      {/* RATING MODALS */}
      {ratingModal && (
        <RatingModal
          title={`${t.rateSeasonTitle} ${ratingModal.seasonNumber}`}
          subtitle={t.chooseRating}
          removeLabel={t.removeRating}
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
          onRemove={ratingModal.currentRating > 0 ? () => {
            setSeasonRating(ratingModal.tvId, ratingModal.seasonNumber, 0);
            const updatedRatings = {...(selectedItem.seasonRatings || {})};
            delete updatedRatings[ratingModal.seasonNumber];
            const ratedSeasons = Object.values(updatedRatings);
            const avg = ratedSeasons.length > 0 ? Math.round(ratedSeasons.reduce((s, r) => s + r, 0) / ratedSeasons.length) : 0;
            setSelectedItem({...selectedItem, seasonRatings: updatedRatings, rating: avg});
            setRatingModal(null);
          } : null}
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
              <div className="text-5xl mb-4">вљ пёЏ</div>
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
          { id: 'stats', icon: '\u{1F4CA}', label: t.stats },
          { id: 'settings', icon: '\u2699\uFE0F', label: t.settings }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center px-7 md:px-10 py-4 rounded-[2.5rem] transition-all ${activeTab === tab.id ? 'mobile-nav-active scale-105' : 'opacity-65 hover:opacity-100'}`}>
            <span className="text-2xl">{tab.icon}</span>
            <span className="mobile-nav-label text-[10px] font-black tracking-tight mt-1">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

