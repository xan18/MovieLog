import { useState, useRef, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce.js';
import { tmdbFetchJson } from '../services/tmdb.js';
import { normalizeRawgGame, rawgFetchJson } from '../services/rawg.js';
import { isReleasedDate } from '../utils/releaseUtils.js';
import { getCatalogSortOptions, getReleaseFilterOptions } from '../utils/uiOptions.js';
import { CATALOG_FILTERS_KEY } from '../constants/appConstants.js';

function createDefaultProfile() {
  return {
    query: '',
    selectedGenre: '',
    selectedYear: '',
    selectedReleaseFilter: 'all',
    catalogSort: 'popularity.desc',
    catalogLibraryFilter: 'all',
    selectedPlatform: '',
  };
}

export function resolveCatalogSort(mediaType, sortValue) {
  if (mediaType === 'game') {
    return ['-added', '-rating', '-metacritic', '-released'].includes(sortValue) ? sortValue : '-added';
  }
  const newest = mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
  if (sortValue === 'primary_release_date.desc' && mediaType === 'tv') return newest;
  if (sortValue === 'first_air_date.desc' && mediaType === 'movie') return newest;
  return ['popularity.desc', 'vote_average.desc', newest].includes(sortValue) ? sortValue : 'popularity.desc';
}

function readStoredCatalogFilters() {
  const defaults = { movie: createDefaultProfile(), tv: createDefaultProfile(), game: createDefaultProfile() };
  try {
    const raw = localStorage.getItem(CATALOG_FILTERS_KEY);
    if (!raw) return { mediaType: 'movie', profiles: defaults };
    const parsed = JSON.parse(raw);
    const safeProfile = (profile) => ({
      ...createDefaultProfile(),
      query: typeof profile?.query === 'string' ? profile.query : '',
      selectedGenre: typeof profile?.selectedGenre === 'string' ? profile.selectedGenre : '',
      selectedYear: typeof profile?.selectedYear === 'string' ? profile.selectedYear : '',
      selectedReleaseFilter: ['all', 'released', 'upcoming'].includes(profile?.selectedReleaseFilter)
        ? profile.selectedReleaseFilter
        : 'all',
      catalogSort: typeof profile?.catalogSort === 'string' ? profile.catalogSort : 'popularity.desc',
      catalogLibraryFilter: ['all', 'hideAdded'].includes(profile?.catalogLibraryFilter)
        ? profile.catalogLibraryFilter
        : 'all',
      selectedPlatform: typeof profile?.selectedPlatform === 'string' ? profile.selectedPlatform : '',
    });
    const mediaType = ['movie', 'tv', 'game'].includes(parsed?.mediaType) ? parsed.mediaType : 'movie';
    return {
      mediaType,
      profiles: {
        movie: safeProfile(parsed?.profiles?.movie),
        tv: safeProfile(parsed?.profiles?.tv),
        game: safeProfile(parsed?.profiles?.game),
      },
    };
  } catch (error) {
    console.warn('Failed to read saved catalog filters. Using defaults.', error);
    return { mediaType: 'movie', profiles: defaults };
  }
}

export function useCatalog({ lang, t, persistCatalogFilters, enabled = true }) {
  const TMDB_LANG = lang === 'ru' ? 'ru-RU' : 'en-US';

  const initialStoredRef = useRef(null);
  if (!initialStoredRef.current) {
    initialStoredRef.current = persistCatalogFilters
      ? readStoredCatalogFilters()
      : { mediaType: 'movie', profiles: { movie: createDefaultProfile(), tv: createDefaultProfile(), game: createDefaultProfile() } };
  }
  const initialStored = initialStoredRef.current;

  const [mediaType, setMediaTypeState] = useState(initialStored.mediaType);
  const [query, setQuery] = useState(initialStored.profiles[initialStored.mediaType].query);
  const debouncedQuery = useDebounce(query, 300);
  const [selectedGenre, setSelectedGenre] = useState(initialStored.profiles[initialStored.mediaType].selectedGenre);
  const [selectedYear, setSelectedYear] = useState(initialStored.profiles[initialStored.mediaType].selectedYear);
  const [selectedReleaseFilter, setSelectedReleaseFilter] = useState(initialStored.profiles[initialStored.mediaType].selectedReleaseFilter);
  const [catalogSort, setCatalogSort] = useState(
    resolveCatalogSort(initialStored.mediaType, initialStored.profiles[initialStored.mediaType].catalogSort)
  );
  const [catalogLibraryFilter, setCatalogLibraryFilter] = useState(
    initialStored.profiles[initialStored.mediaType].catalogLibraryFilter
  );
  const [selectedPlatform, setSelectedPlatform] = useState(
    initialStored.profiles[initialStored.mediaType].selectedPlatform
  );
  const [genres, setGenres] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const genreCache = useRef({});
  const catalogProfilesRef = useRef(initialStored.profiles);
  const [catalogItems, setCatalogItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const loadedRequestRef = useRef(null);

  const CATALOG_SORT_OPTIONS = getCatalogSortOptions(t, mediaType);
  const RELEASE_FILTER_OPTIONS = getReleaseFilterOptions(t);

  const setMediaType = useCallback((nextMediaType) => {
    if (!['movie', 'tv', 'game'].includes(nextMediaType)) return;
    if (nextMediaType === mediaType) return;
    setMediaTypeState(nextMediaType);

    if (persistCatalogFilters) {
      const saved = catalogProfilesRef.current[nextMediaType] || createDefaultProfile();
      setSelectedGenre(saved.selectedGenre);
      setSelectedYear(saved.selectedYear);
      setSelectedReleaseFilter(saved.selectedReleaseFilter);
      setCatalogSort(resolveCatalogSort(nextMediaType, saved.catalogSort));
      setCatalogLibraryFilter(saved.catalogLibraryFilter);
      setSelectedPlatform(saved.selectedPlatform);
    } else {
      setSelectedGenre('');
      setSelectedYear('');
      setCatalogSort((prev) => resolveCatalogSort(nextMediaType, prev));
      setSelectedPlatform('');
    }

    setCatalogItems([]);
    setPage(1);
    setTotalPages(1);
    setHasMore(true);
  }, [mediaType, persistCatalogFilters]);

  useEffect(() => {
    if (persistCatalogFilters) return;
    localStorage.removeItem(CATALOG_FILTERS_KEY);
  }, [persistCatalogFilters]);

  useEffect(() => {
    if (!persistCatalogFilters) return;
    catalogProfilesRef.current[mediaType] = {
      query,
      selectedGenre,
      selectedYear,
      selectedReleaseFilter,
      catalogSort: resolveCatalogSort(mediaType, catalogSort),
      catalogLibraryFilter,
      selectedPlatform,
    };
    const payload = {
      mediaType,
      profiles: catalogProfilesRef.current,
    };
    localStorage.setItem(CATALOG_FILTERS_KEY, JSON.stringify(payload));
  }, [persistCatalogFilters, mediaType, query, selectedGenre, selectedYear, selectedReleaseFilter, catalogSort, catalogLibraryFilter, selectedPlatform]);

  // Fetch genres with cache
  useEffect(() => {
    if (!enabled) return;
    const cacheKey = `${mediaType}:${TMDB_LANG}`;
    if (genreCache.current[cacheKey]) {
      setGenres(genreCache.current[cacheKey]);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const data = mediaType === 'game'
          ? await rawgFetchJson('genres', { page_size: 40 }, { signal: controller.signal })
          : await tmdbFetchJson(
              `/genre/${mediaType}/list`,
              { language: TMDB_LANG },
              { signal: controller.signal }
            );
        if (controller.signal.aborted) return;
        const list = mediaType === 'game'
          ? (Array.isArray(data?.results) ? data.results : [])
          : (Array.isArray(data?.genres) ? data.genres : []);
        genreCache.current[cacheKey] = list;
        setGenres(list);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error(`Failed to load genres for ${mediaType}`, error);
        }
        if (!controller.signal.aborted) setGenres([]);
      }
    })();
    return () => controller.abort();
  }, [enabled, mediaType, TMDB_LANG]);

  useEffect(() => {
    if (!enabled || mediaType !== 'game') return;
    const controller = new AbortController();
    rawgFetchJson('platforms/lists/parents', {}, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setPlatforms(Array.isArray(data?.results) ? data.results : []);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.error('Failed to load RAWG platforms', error);
        if (!controller.signal.aborted) setPlatforms([]);
      });
    return () => controller.abort();
  }, [enabled, mediaType]);

  // Fetch catalog
  useEffect(() => {
    if (!enabled) return;
    const requestKey = JSON.stringify([
      mediaType, debouncedQuery, selectedGenre, selectedYear, selectedPlatform,
      selectedReleaseFilter, catalogSort, page, TMDB_LANG,
    ]);
    // Returning to the tab must retain loaded pages without appending the last page twice.
    if (loadedRequestRef.current === requestKey) return;
    const controller = new AbortController();
    setCatalogError(null);
    setIsCatalogLoading(true);
    (async () => {
      try {
        let data;
        if (mediaType === 'game') {
          const params = {
            page,
            page_size: 20,
            ordering: resolveCatalogSort('game', catalogSort),
            exclude_additions: true,
          };
          if (debouncedQuery.trim()) {
            params.search = debouncedQuery.trim();
            params.search_precise = true;
          }
          if (selectedGenre) params.genres = selectedGenre;
          if (selectedPlatform) params.parent_platforms = selectedPlatform;
          if (selectedYear) params.dates = `${selectedYear}-01-01,${selectedYear}-12-31`;
          data = await rawgFetchJson('games', params, { signal: controller.signal });
        } else if (debouncedQuery.trim()) {
          data = await tmdbFetchJson(`/search/${mediaType}`, {
            language: TMDB_LANG,
            query: debouncedQuery,
            page,
          }, { signal: controller.signal });
        } else {
          const params = {
            language: TMDB_LANG,
            page,
            sort_by: catalogSort,
          };
          if (selectedGenre) params.with_genres = selectedGenre;
          if (selectedYear) {
            if (mediaType === 'movie') params.primary_release_year = selectedYear;
            else params.first_air_date_year = selectedYear;
          }
          data = await tmdbFetchJson(`/discover/${mediaType}`, params, { signal: controller.signal });
        }

        if (controller.signal.aborted) return;
        const items = mediaType === 'game'
          ? (data?.results || []).map(normalizeRawgGame).filter(Boolean)
          : (data?.results || []).map((it) => ({ ...it, mediaType }));
        const filteredItems = items.filter((it) => {
          if (selectedReleaseFilter === 'all') return true;
          const date = mediaType === 'tv' ? it.first_air_date : it.release_date;
          const released = isReleasedDate(date);
          return selectedReleaseFilter === 'released' ? released : !released;
        });

        const nextTotalPages = mediaType === 'game'
          ? (data?.next ? page + 1 : page)
          : Math.max(1, Number(data?.total_pages || 1));
        setTotalPages(nextTotalPages);
        setHasMore(mediaType === 'game' ? Boolean(data?.next) : page < nextTotalPages);
        setCatalogItems((prev) => (page === 1 ? filteredItems : [...prev, ...filteredItems]));
        loadedRequestRef.current = requestKey;
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error(`Failed to load ${mediaType} catalog page ${page}`, error);
          setCatalogError(error?.message || t.networkError || 'Ошибка загрузки');
          setHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted) setIsCatalogLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [enabled, mediaType, debouncedQuery, selectedGenre, selectedYear, selectedPlatform, selectedReleaseFilter, catalogSort, page, TMDB_LANG, t.networkError]);

  return {
    mediaType, setMediaType,
    query, setQuery,
    debouncedQuery,
    selectedGenre, setSelectedGenre,
    selectedYear, setSelectedYear,
    selectedPlatform, setSelectedPlatform,
    selectedReleaseFilter, setSelectedReleaseFilter,
    catalogSort, setCatalogSort,
    catalogLibraryFilter, setCatalogLibraryFilter,
    genres,
    platforms,
    catalogItems,
    page, setPage,
    totalPages,
    hasMore,
    catalogError,
    isCatalogLoading,
    TMDB_LANG,
    CATALOG_SORT_OPTIONS,
    RELEASE_FILTER_OPTIONS,
  };
}
