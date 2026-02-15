import { useState, useRef, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce.js';
import { tmdbUrl, tmdbFetchJson } from '../services/tmdb.js';
import { isReleasedDate } from '../utils/releaseUtils.js';
import { getCatalogSortOptions, getReleaseFilterOptions } from '../utils/uiOptions.js';
import { CATALOG_FILTERS_KEY } from '../constants/appConstants.js';

function createDefaultProfile() {
  return {
    query: '',
    selectedGenre: '',
    selectedYear: '',
    selectedDecade: '',
    selectedReleaseFilter: 'all',
    catalogSort: 'popularity.desc',
  };
}

function resolveCatalogSort(mediaType, sortValue) {
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
      selectedDecade: typeof profile?.selectedDecade === 'string' ? profile.selectedDecade : '',
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
  } catch {
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
  const [selectedDecade, setSelectedDecade] = useState(initialStored.profiles[initialStored.mediaType].selectedDecade);
  const [selectedReleaseFilter, setSelectedReleaseFilter] = useState(initialStored.profiles[initialStored.mediaType].selectedReleaseFilter);
  const [catalogSort, setCatalogSort] = useState(
    resolveCatalogSort(initialStored.mediaType, initialStored.profiles[initialStored.mediaType].catalogSort)
  );
  const [genres, setGenres] = useState([]);
  const genreCache = useRef({});
  const catalogProfilesRef = useRef(initialStored.profiles);
  const [catalogItems, setCatalogItems] = useState([]);
  const [page, setPage] = useState(1);
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
      setSelectedDecade(saved.selectedDecade);
      setSelectedReleaseFilter(saved.selectedReleaseFilter);
      setCatalogSort(resolveCatalogSort(nextMediaType, saved.catalogSort));
    } else {
      setSelectedGenre('');
      setSelectedYear('');
      setSelectedDecade('');
      setQuery('');
      setCatalogSort(prev => resolveCatalogSort(nextMediaType, prev));
    }

    setCatalogItems([]);
    setPage(1);
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
      selectedDecade,
      selectedReleaseFilter,
      catalogSort: resolveCatalogSort(mediaType, catalogSort),
    };
    const payload = {
      mediaType,
      profiles: catalogProfilesRef.current,
    };
    localStorage.setItem(CATALOG_FILTERS_KEY, JSON.stringify(payload));
  }, [persistCatalogFilters, mediaType, query, selectedGenre, selectedYear, selectedDecade, selectedReleaseFilter, catalogSort]);

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
      } catch { setGenres([]); }
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
        let url = '';
        if (debouncedQuery.trim()) {
          url = tmdbUrl(`/search/${mediaType}`, {
            language: TMDB_LANG,
            query: debouncedQuery,
            page
          });
        } else {
          const params = {
            language: TMDB_LANG,
            page,
            sort_by: catalogSort
          };
          if (selectedGenre) params.with_genres = selectedGenre;
          if (selectedYear) {
            if (mediaType === 'movie') params.primary_release_year = selectedYear;
            else params.first_air_date_year = selectedYear;
          }
          if (selectedDecade) {
            const start = `${selectedDecade}-01-01`;
            const end = `${Number(selectedDecade) + 9}-12-31`;
            if (mediaType === 'movie') {
              params['primary_release_date.gte'] = start;
              params['primary_release_date.lte'] = end;
            } else {
              params['first_air_date.gte'] = start;
              params['first_air_date.lte'] = end;
            }
          }
          url = tmdbUrl(`/discover/${mediaType}`, params);
        }
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        const items = (data?.results || []).map(it => ({ ...it, mediaType }));
        const filteredItems = items.filter(it => {
          if (selectedReleaseFilter === 'all') return true;
          const date = mediaType === 'movie' ? it.release_date : it.first_air_date;
          const released = isReleasedDate(date);
          return selectedReleaseFilter === 'released' ? released : !released;
        });
        setCatalogItems(prev => page === 1 ? filteredItems : [...prev, ...filteredItems]);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setCatalogError(t.networkError || 'Ошибка загрузки');
        }
      } finally {
        if (!controller.signal.aborted) setIsCatalogLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [mediaType, debouncedQuery, selectedGenre, selectedYear, selectedDecade, selectedReleaseFilter, catalogSort, page, TMDB_LANG]);

  return {
    mediaType, setMediaType,
    query, setQuery,
    debouncedQuery,
    selectedGenre, setSelectedGenre,
    selectedYear, setSelectedYear,
    selectedDecade, setSelectedDecade,
    selectedReleaseFilter, setSelectedReleaseFilter,
    catalogSort, setCatalogSort,
    genres,
    catalogItems,
    page, setPage,
    catalogError,
    isCatalogLoading,
    TMDB_LANG,
    CATALOG_SORT_OPTIONS,
    RELEASE_FILTER_OPTIONS,
  };
}
