import { useState, useRef, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce.js';
import { tmdbFetchJson } from '../services/tmdb.js';
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
  };
}

export function resolveCatalogSort(mediaType, sortValue) {
  const newest = mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
  if (sortValue === 'primary_release_date.desc' && mediaType === 'tv') return newest;
  if (sortValue === 'first_air_date.desc' && mediaType === 'movie') return newest;
  return ['popularity.desc', 'vote_average.desc', newest].includes(sortValue) ? sortValue : 'popularity.desc';
}

function readStoredCatalogFilters() {
  const defaults = { movie: createDefaultProfile(), tv: createDefaultProfile() };
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
    });
    const mediaType = parsed?.mediaType === 'tv' ? 'tv' : 'movie';
    return {
      mediaType,
      profiles: {
        movie: safeProfile(parsed?.profiles?.movie),
        tv: safeProfile(parsed?.profiles?.tv),
      },
    };
  } catch (error) {
    console.warn('Failed to read saved catalog filters. Using defaults.', error);
    return { mediaType: 'movie', profiles: defaults };
  }
}

export function useCatalog({ lang, t, persistCatalogFilters }) {
  const TMDB_LANG = lang === 'ru' ? 'ru-RU' : 'en-US';

  const initialStoredRef = useRef(null);
  if (!initialStoredRef.current) {
    initialStoredRef.current = persistCatalogFilters
      ? readStoredCatalogFilters()
      : { mediaType: 'movie', profiles: { movie: createDefaultProfile(), tv: createDefaultProfile() } };
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
  const [genres, setGenres] = useState([]);
  const genreCache = useRef({});
  const catalogProfilesRef = useRef(initialStored.profiles);
  const [catalogItems, setCatalogItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);

  const CATALOG_SORT_OPTIONS = getCatalogSortOptions(t, mediaType);
  const RELEASE_FILTER_OPTIONS = getReleaseFilterOptions(t);

  const setMediaType = useCallback((nextMediaType) => {
    if (!['movie', 'tv'].includes(nextMediaType)) return;
    if (nextMediaType === mediaType) return;
    setMediaTypeState(nextMediaType);

    if (persistCatalogFilters) {
      const saved = catalogProfilesRef.current[nextMediaType] || createDefaultProfile();
      setQuery(saved.query);
      setSelectedGenre(saved.selectedGenre);
      setSelectedYear(saved.selectedYear);
      setSelectedReleaseFilter(saved.selectedReleaseFilter);
      setCatalogSort(resolveCatalogSort(nextMediaType, saved.catalogSort));
    } else {
      setSelectedGenre('');
      setSelectedYear('');
      setQuery('');
      setCatalogSort((prev) => resolveCatalogSort(nextMediaType, prev));
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
    };
    const payload = {
      mediaType,
      profiles: catalogProfilesRef.current,
    };
    localStorage.setItem(CATALOG_FILTERS_KEY, JSON.stringify(payload));
  }, [persistCatalogFilters, mediaType, query, selectedGenre, selectedYear, selectedReleaseFilter, catalogSort]);

  // Fetch genres with cache
  useEffect(() => {
    if (genreCache.current[mediaType]) {
      setGenres(genreCache.current[mediaType]);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const data = await tmdbFetchJson(
          `/genre/${mediaType}/list`,
          { language: TMDB_LANG },
          { signal: controller.signal }
        );
        const list = Array.isArray(data?.genres) ? data.genres : [];
        genreCache.current[mediaType] = list;
        setGenres(list);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error(`Failed to load genres for ${mediaType}`, error);
        }
        setGenres([]);
      }
    })();
    return () => controller.abort();
  }, [mediaType, TMDB_LANG]);

  // Fetch catalog
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(null);
    setIsCatalogLoading(true);
    (async () => {
      try {
        let data;
        if (debouncedQuery.trim()) {
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

        const items = (data?.results || []).map((it) => ({ ...it, mediaType }));
        const filteredItems = items.filter((it) => {
          if (selectedReleaseFilter === 'all') return true;
          const date = mediaType === 'movie' ? it.release_date : it.first_air_date;
          const released = isReleasedDate(date);
          return selectedReleaseFilter === 'released' ? released : !released;
        });

        const nextTotalPages = Math.max(1, Number(data?.total_pages || 1));
        setTotalPages(nextTotalPages);
        setHasMore(page < nextTotalPages);
        setCatalogItems((prev) => (page === 1 ? filteredItems : [...prev, ...filteredItems]));
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
  }, [mediaType, debouncedQuery, selectedGenre, selectedYear, selectedReleaseFilter, catalogSort, page, TMDB_LANG, t.networkError]);

  return {
    mediaType, setMediaType,
    query, setQuery,
    debouncedQuery,
    selectedGenre, setSelectedGenre,
    selectedYear, setSelectedYear,
    selectedReleaseFilter, setSelectedReleaseFilter,
    catalogSort, setCatalogSort,
    genres,
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
