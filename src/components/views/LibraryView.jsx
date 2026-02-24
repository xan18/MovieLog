import React from 'react';
import { CustomSelect, LazyImg } from '../ui.jsx';
import { getYear } from '../../utils/appUtils.js';
import { IMG_500 } from '../../constants/appConstants.js';
import { tmdbFetchJson } from '../../services/tmdb.js';
import { isReleasedDate } from '../../utils/releaseUtils.js';
import { useQuickActionGesture } from '../../hooks/useQuickActionGesture.js';
import { useAutoLoadMoreOnScroll } from '../../hooks/useAutoLoadMoreOnScroll.js';

const pickDisplayTitle = (item, lang) => {
  if (!item) return '';
  const isRu = lang === 'ru';
  if (item.mediaType === 'movie') {
    if (isRu) return item.title_ru || item.title || item.title_en || item.original_title || '';
    return item.title_en || item.title || item.title_ru || item.original_title || '';
  }
  if (isRu) return item.name_ru || item.name || item.name_en || item.original_name || '';
  return item.name_en || item.name || item.name_ru || item.original_name || '';
};

const getGenreIdsFromItem = (item) => {
  const result = [];

  if (Array.isArray(item?.genre_ids)) {
    item.genre_ids.forEach((id) => {
      const parsed = Number(id);
      if (Number.isFinite(parsed)) result.push(parsed);
    });
  }

  if (Array.isArray(item?.genres)) {
    item.genres.forEach((genre) => {
      const parsed = Number(genre?.id);
      if (Number.isFinite(parsed)) result.push(parsed);
    });
  }

  return result;
};

const buildSearchText = (item, lang) => ([
  pickDisplayTitle(item, lang),
  item?.title,
  item?.name,
  item?.title_ru,
  item?.name_ru,
  item?.title_en,
  item?.name_en,
  item?.original_title,
  item?.original_name,
].filter(Boolean).join(' ')).toLocaleLowerCase();

const renderTvProgressBadgeIcon = (variant) => {
  if (variant === 'completed') {
    return (
      <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <path d="M6.6 10.2 8.8 12.4 13.5 7.7" />
      </svg>
    );
  }

  if (variant === 'airing') {
    return (
      <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <path d="M8.3 7.2v5.6l4.9-2.8-4.9-2.8Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return null;
};

export default function LibraryView({
  shown, library,
  libraryType, setLibraryType,
  shelf, setShelf,
  sortBy, setSortBy,
  MOVIE_STATUSES, TV_STATUSES,
  lang,
  t,
  onCardClick,
  openQuickActions,
  setActiveTab,
  autoLoadMoreOnScroll,
}) {
  const LIBRARY_PAGE_SIZE = 20;
  const [libraryQuery, setLibraryQuery] = React.useState('');
  const [selectedGenre, setSelectedGenre] = React.useState('');
  const [selectedYear, setSelectedYear] = React.useState('');
  const [selectedReleaseFilter, setSelectedReleaseFilter] = React.useState('all');
  const [visiblePageCount, setVisiblePageCount] = React.useState(1);
  const [genreCatalog, setGenreCatalog] = React.useState([]);
  const genreCacheRef = React.useRef({});
  const TMDB_LANG = lang === 'ru' ? 'ru-RU' : 'en-US';

  const {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    consumeLongPress,
  } = useQuickActionGesture(openQuickActions);

  const handleCardClick = (item) => {
    if (consumeLongPress()) return;
    onCardClick(item);
  };

  const mediaTypeStatuses = libraryType === 'movie' ? MOVIE_STATUSES : TV_STATUSES;
  const mediaTypeLibraryItems = React.useMemo(
    () => library.filter((item) => item.mediaType === libraryType),
    [library, libraryType]
  );

  React.useEffect(() => {
    setSelectedGenre('');
  }, [libraryType]);

  React.useEffect(() => {
    const cacheKey = `${libraryType}:${TMDB_LANG}`;
    if (genreCacheRef.current[cacheKey]) {
      setGenreCatalog(genreCacheRef.current[cacheKey]);
      return;
    }

    const controller = new AbortController();
    (async () => {
      try {
        const payload = await tmdbFetchJson(
          `/genre/${libraryType}/list`,
          { language: TMDB_LANG },
          { signal: controller.signal }
        );
        const list = Array.isArray(payload?.genres) ? payload.genres : [];
        genreCacheRef.current[cacheKey] = list;
        setGenreCatalog(list);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.error(`Failed to load library genres for ${libraryType}`, error);
        }
        setGenreCatalog([]);
      }
    })();

    return () => controller.abort();
  }, [libraryType, TMDB_LANG]);

  const canSortByMyRating = shelf !== 'planned';
  const sortOptions = React.useMemo(() => ([
    { value: 'imdbRating', label: t.byImdbRating },
    ...(canSortByMyRating ? [{ value: 'myRating', label: t.byMyRating }] : []),
    { value: 'dateAdded', label: t.byDateAdded },
    { value: 'releaseYear', label: t.byReleaseYear },
  ]), [canSortByMyRating, t.byDateAdded, t.byImdbRating, t.byMyRating, t.byReleaseYear]);

  const statusOptions = React.useMemo(() => ([
    {
      value: 'all',
      label: `${t.releaseAll} (${mediaTypeLibraryItems.length})`,
    },
    ...mediaTypeStatuses.map((status) => {
      const count = mediaTypeLibraryItems.filter((item) => item.status === status.id).length;
      return {
        value: status.id,
        label: `${status.label} (${count})`,
      };
    }),
  ]), [mediaTypeLibraryItems, mediaTypeStatuses, t.releaseAll]);
  const releaseFilterOptions = React.useMemo(() => ([
    { value: 'all', label: t.filterReleaseLabel || t.releaseAll },
    { value: 'released', label: t.releaseReleased },
    { value: 'upcoming', label: t.releaseUpcoming },
  ]), [t.filterReleaseLabel, t.releaseAll, t.releaseReleased, t.releaseUpcoming]);

  const availableGenreIdSet = React.useMemo(() => {
    const set = new Set();
    mediaTypeLibraryItems.forEach((item) => {
      getGenreIdsFromItem(item).forEach((id) => set.add(id));
    });
    return set;
  }, [mediaTypeLibraryItems]);

  const genreOptions = React.useMemo(() => {
    const collator = new Intl.Collator(lang === 'ru' ? 'ru' : 'en');
    const options = genreCatalog
      .filter((genre) => availableGenreIdSet.has(Number(genre.id)))
      .sort((a, b) => collator.compare(a.name || '', b.name || ''))
      .map((genre) => ({ value: String(genre.id), label: genre.name }));

    return [{ value: '', label: t.filterGenreLabel || t.allGenres }, ...options];
  }, [availableGenreIdSet, genreCatalog, lang, t.filterGenreLabel, t.allGenres]);

  React.useEffect(() => {
    if (!selectedGenre) return;
    const exists = genreOptions.some((option) => String(option.value) === String(selectedGenre));
    if (!exists) setSelectedGenre('');
  }, [genreOptions, selectedGenre]);

  const yearOptions = React.useMemo(() => {
    const years = Array.from(new Set(
      mediaTypeLibraryItems
        .map((item) => Number(getYear(item)))
        .filter((year) => Number.isFinite(year) && year > 1800)
    )).sort((a, b) => b - a);

    return [
      { value: '', label: t.filterYearLabel || t.allYears },
      ...years.map((year) => ({ value: String(year), label: String(year) })),
    ];
  }, [mediaTypeLibraryItems, t.filterYearLabel, t.allYears]);

  const normalizedLibraryQuery = libraryQuery.trim().toLocaleLowerCase();
  const filteredShown = React.useMemo(() => (
    shown.filter((item) => {
      if (normalizedLibraryQuery) {
        const haystack = buildSearchText(item, lang);
        if (!haystack.includes(normalizedLibraryQuery)) return false;
      }

      if (selectedYear) {
        const itemYear = String(getYear(item));
        if (itemYear !== String(selectedYear)) return false;
      }

      if (selectedReleaseFilter !== 'all') {
        const date = item.mediaType === 'movie' ? item.release_date : item.first_air_date;
        const released = isReleasedDate(date);
        if (selectedReleaseFilter === 'released' && !released) return false;
        if (selectedReleaseFilter === 'upcoming' && released) return false;
      }

      if (selectedGenre) {
        const targetGenreId = Number(selectedGenre);
        if (!Number.isFinite(targetGenreId)) return false;
        const genreIds = getGenreIdsFromItem(item);
        if (!genreIds.includes(targetGenreId)) return false;
      }

      return true;
    })
  ), [shown, normalizedLibraryQuery, lang, selectedYear, selectedReleaseFilter, selectedGenre]);

  const hasActiveLocalFilters = Boolean(
    libraryQuery.trim() || selectedGenre || selectedYear || selectedReleaseFilter !== 'all'
  );
  const targetVisibleCount = visiblePageCount * LIBRARY_PAGE_SIZE;
  const visibleLibraryItems = filteredShown.slice(0, targetVisibleCount);
  const canLoadMoreLibraryItems = filteredShown.length > visibleLibraryItems.length;

  const resetLocalFilters = () => {
    setLibraryQuery('');
    setSelectedGenre('');
    setSelectedYear('');
    setSelectedReleaseFilter('all');
    setVisiblePageCount(1);
  };

  React.useEffect(() => {
    setVisiblePageCount(1);
  }, [libraryType, shelf, sortBy, libraryQuery, selectedGenre, selectedYear, selectedReleaseFilter]);

  const handleLoadMore = React.useCallback(() => {
    setVisiblePageCount((prev) => prev + 1);
  }, []);

  const loadMoreSentinelRef = useAutoLoadMoreOnScroll({
    enabled: Boolean(autoLoadMoreOnScroll),
    canLoadMore: canLoadMoreLibraryItems,
    isLoading: false,
    itemCount: visibleLibraryItems.length,
    onLoadMore: handleLoadMore,
  });

  return (
    <div className="view-stack">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="app-page-title">{t.shelf.toUpperCase()}</h2>
        <div className="flex items-center gap-3">
          <div className="app-switch-wrap">
            <button onClick={() => setLibraryType('movie')} className={`app-switch-btn ${libraryType === 'movie' ? 'active' : ''}`}>{t.movies}</button>
            <button onClick={() => setLibraryType('tv')} className={`app-switch-btn ${libraryType === 'tv' ? 'active' : ''}`}>{t.tvShows}</button>
          </div>
        </div>
      </div>

      <div className="catalog-controls">
        <div className="relative">
          <input
            type="text"
            placeholder={libraryType === 'movie' ? t.searchMovies : t.searchTv}
            value={libraryQuery}
            onChange={(event) => setLibraryQuery(event.target.value)}
            className="app-input w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-12 text-sm font-bold placeholder-white/30 focus:outline-none"
          />
          {libraryQuery && (
            <button
              type="button"
              onClick={() => setLibraryQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-sm font-black transition-all"
              aria-label={t.clearSearch}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div>
            <CustomSelect
              value={shelf}
              options={statusOptions}
              onChange={setShelf}
              ariaLabel={t.filterStatusLabel || t.shelf}
            />
          </div>
          <div>
            <CustomSelect
              value={selectedGenre}
              options={genreOptions}
              onChange={setSelectedGenre}
              ariaLabel={t.filterGenreLabel || t.allGenres}
            />
          </div>
          <div>
            <CustomSelect
              value={selectedYear}
              options={yearOptions}
              onChange={setSelectedYear}
              ariaLabel={t.filterYearLabel || t.allYears}
            />
          </div>
          <div>
            <CustomSelect
              value={selectedReleaseFilter}
              options={releaseFilterOptions}
              onChange={setSelectedReleaseFilter}
              ariaLabel={t.filterReleaseLabel || t.releaseAll}
            />
          </div>
          <div>
            <CustomSelect
              value={sortBy}
              options={sortOptions}
              onChange={setSortBy}
              ariaLabel={t.filterSortLabel || t.byDateAdded}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs opacity-65">
          <p>{filteredShown.length} / {shown.length}</p>
          {hasActiveLocalFilters && (
            <button
              type="button"
              onClick={resetLocalFilters}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
            >
              {t.resetCatalogFilters || t.clearSearch}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {visibleLibraryItems.map((item, i) => {
          const displayTitle = pickDisplayTitle(item, lang);
          const epProgress = (() => {
            if (item.mediaType !== 'tv') return null;
            const w = item.watchedEpisodes || {};
            const watchedCount = Object.values(w).reduce((sum, eps) => sum + eps.length, 0);
            const totalCount = (item.number_of_episodes || item.seasons?.reduce((s, se) => se.season_number > 0 ? s + se.episode_count : s, 0) || 0);
            if (totalCount === 0) return null;
            const remaining = totalCount - watchedCount;
            const pct = Math.round((watchedCount / totalCount) * 100);
            const allTrackedWatched = remaining <= 0;
            const isOngoingSeries = Boolean(item.in_production) || Boolean(item.next_episode_to_air);
            const waitingForNewEpisodes = allTrackedWatched && isOngoingSeries;
            const badge = allTrackedWatched
              ? waitingForNewEpisodes
                ? { variant: 'airing', color: 'bg-sky-600', title: t.returning || t.inProduction || 'Ongoing (all aired watched)' }
                : { variant: 'completed', color: 'bg-green-600', title: t.ended || 'Ended (completed)' }
              : { text: `\u25B6 ${remaining}`, color: 'bg-white/80 text-black', title: `${remaining}` };
            return { badge, pct, done: allTrackedWatched && !waitingForNewEpisodes, waitingForNewEpisodes };
          })();
          return (
            <div
              key={`${item.mediaType}-${item.id}`}
              className="media-card group card-stagger"
              style={{ '--stagger-i': i }}
              onContextMenu={(event) => onContextMenu(event, item)}
              onTouchStart={(event) => onTouchStart(event, item)}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchCancel}
            >
              <div onClick={() => handleCardClick(item)} className="media-poster cursor-pointer">
                <LazyImg src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]" alt={displayTitle} />
                {item.rating > 0 && <div className="media-pill absolute top-2 right-2 bg-yellow-500 text-black">{'\u2605'} {item.rating}</div>}
                {epProgress?.badge && (
                  <div
                    className={`media-pill absolute top-2 left-2 ${epProgress.badge.color} shadow-lg`}
                    title={epProgress.badge.title}
                  >
                    {epProgress.badge.variant
                      ? renderTvProgressBadgeIcon(epProgress.badge.variant)
                      : epProgress.badge.text}
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openQuickActions(item, e.clientX, e.clientY);
                  }}
                  className="quick-action-trigger"
                  aria-label={t.quickActions}
                  title={t.quickActions}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <div className="card-info-overlay">
                  {item.vote_average > 0 && <p className="text-xs font-bold mb-0.5">{'\u2605'} {item.vote_average.toFixed(1)}</p>}
                  <p className="text-[10px] font-normal opacity-70">{getYear(item)}</p>
                </div>
              </div>
              {epProgress && (
                <div className="tv-progress-bar">
                  <div
                    className="tv-progress-fill"
                    style={{
                      width: `${epProgress.pct}%`,
                      background: epProgress.done
                        ? 'rgb(34, 197, 94)'
                        : epProgress.waitingForNewEpisodes
                          ? 'rgb(14, 165, 233)'
                          : 'rgb(59, 130, 246)',
                    }}
                  />
                </div>
              )}
              <h3 className="media-title line-clamp-2">{displayTitle}</h3>
              <p className="media-meta font-normal">{getYear(item)}</p>
            </div>
          );
        })}
      </div>

      {filteredShown.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">{'\u{1F3AC}'}</div>
          <p className="empty-state-title">{t.emptyShelfHint || t.empty}</p>
          <p className="empty-state-hint">{t.catalogEmptyHint || t.empty}</p>
          {hasActiveLocalFilters ? (
            <button
              type="button"
              onClick={resetLocalFilters}
              className="empty-state-action"
            >
              {t.resetCatalogFilters || t.clearSearch}
            </button>
          ) : (
            <button
              onClick={() => setActiveTab?.('catalog')}
              className="empty-state-action"
            >
              {t.goToCatalog || t.search}
            </button>
          )}
        </div>
      )}

      {visibleLibraryItems.length > 0 && canLoadMoreLibraryItems && (
        <>
          <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
          <button
            type="button"
            onClick={handleLoadMore}
            className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
          >
            {t.loadMore}
          </button>
        </>
      )}
    </div>
  );
}
