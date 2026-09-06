import React from 'react';
import { CustomSelect, LazyImg } from '../ui.jsx';
import { YEARS, getYear } from '../../utils/appUtils.js';
import { IMG_500 } from '../../constants/appConstants.js';
import { useQuickActionGesture } from '../../hooks/useQuickActionGesture.js';
import { useAutoLoadMoreOnScroll } from '../../hooks/useAutoLoadMoreOnScroll.js';

const CatalogCard = React.memo(function CatalogCard({
  item, index, libEntry, isPulsing, t, STATUS_BADGE_CONFIG,
  onCardClick, openQuickActions,
  onContextMenu, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel,
}) {
  const badge = libEntry && STATUS_BADGE_CONFIG[libEntry.status];
  const year = getYear(item);
  const isGame = item.mediaType === 'game';
  const genre = (item.genre_ids?.length > 0 || item.genres?.length > 0)
    ? (item.genres?.[0]?.name || '')
    : '';
  return (
    <div
      onClick={() => onCardClick(item)}
      onContextMenu={(event) => onContextMenu(event, item)}
      onTouchStart={(event) => onTouchStart(event, item)}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      className={`media-card group cursor-pointer card-stagger ${isPulsing ? 'add-pulse' : ''}`}
      style={{ '--stagger-i': index }}
    >
      <div className="media-poster">
        <LazyImg
          src={isGame ? (item.posterUrl || '/poster-placeholder.svg') : (item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg')}
          srcSet={!isGame && item.poster_path ? [185, 342, 500].map((width) => (
            `https://image.tmdb.org/t/p/w${width}${item.poster_path} ${width}w`
          )).join(', ') : undefined}
          sizes="(min-width: 1180px) 212px, (min-width: 1024px) calc(20vw - 24px), (min-width: 768px) calc(25vw - 26px), calc(50vw - 26px)"
          width={500}
          height={750}
          loading={index < 4 ? 'eager' : 'lazy'}
          className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          alt={item.title || item.name}
        />
        {badge && (
          <div className="media-pill absolute top-2 right-2 text-white uppercase flex items-center gap-1 shadow-lg" style={{ background: badge.bg }}>
            <span>{badge.icon}</span><span>{item.mediaType === 'game' && libEntry.status === 'completed' ? t.gameCompleted : badge.label}</span>
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
          {isGame && item.rawgRating > 0 && <p className="text-xs font-bold mb-0.5">{'\u2605'} {item.rawgRating.toFixed(1)}/5</p>}
          {!isGame && item.vote_average > 0 && <p className="text-xs font-bold mb-0.5">{"\u2605"} {item.vote_average.toFixed(1)}</p>}
          {genre && <p className="text-[10px] font-medium opacity-80">{genre}</p>}
          {year && <p className="text-[10px] font-normal opacity-60">{year}</p>}
        </div>
      </div>
      <h3 className="media-title line-clamp-2">{item.title || item.name}</h3>
      <p className="media-meta">{year}</p>
    </div>
  );
});

export default function CatalogView({
  // from useCatalog
  mediaType, setMediaType,
  query, setQuery,
  selectedGenre, setSelectedGenre,
  selectedYear, setSelectedYear,
  selectedPlatform, setSelectedPlatform,
  selectedReleaseFilter, setSelectedReleaseFilter,
  catalogSort, setCatalogSort,
  catalogLibraryFilter, setCatalogLibraryFilter,
  genres,
  platforms,
  catalogItems,
  setPage,
  hasMore,
  catalogError,
  isCatalogLoading,
  CATALOG_SORT_OPTIONS,
  RELEASE_FILTER_OPTIONS,
  // from App
  getLibraryEntry,
  openQuickActions,
  onCardClick,
  t,
  STATUS_BADGE_CONFIG,
  addPulseId,
  autoLoadMoreOnScroll,
}) {
  const CATALOG_PAGE_SIZE = 20;
  const [requestedPageCount, setRequestedPageCount] = React.useState(1);
  const autoFillSignatureRef = React.useRef('');

  const genreOptions = [
    { value: '', label: t.filterGenreLabel || t.allGenres },
    ...genres.map((genre) => ({ value: String(genre.id), label: genre.name })),
  ];

  const yearOptions = [
    { value: '', label: t.filterYearLabel || t.allYears },
    ...YEARS.map((year) => ({ value: String(year), label: String(year) })),
  ];
  const platformOptions = [
    { value: '', label: t.allPlatforms },
    ...platforms.map((platform) => ({ value: String(platform.id), label: platform.name })),
  ];

  const catalogSortOptions = CATALOG_SORT_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  const releaseFilterOptions = RELEASE_FILTER_OPTIONS.map((option) => ({
    value: option.value,
    label: option.value === 'all' ? (t.filterReleaseLabel || t.releaseAll) : option.label,
  }));
  const catalogLibraryFilterOptions = [
    { value: 'all', label: t.catalogLibraryFilterLabel || t.inLibrary },
    { value: 'hideAdded', label: t.catalogLibraryFilterHideAdded || t.inLibrary },
  ];

  const showInitialSkeleton = isCatalogLoading && catalogItems.length === 0;
  const filteredCatalogItems = catalogLibraryFilter === 'hideAdded'
    ? catalogItems.filter((item) => !getLibraryEntry(item.mediaType, item.id))
    : catalogItems;
  const targetVisibleCount = requestedPageCount * CATALOG_PAGE_SIZE;
  const visibleCatalogItems = filteredCatalogItems.slice(0, targetVisibleCount);
  const hasBufferedItems = filteredCatalogItems.length > visibleCatalogItems.length;
  const canLoadMore = hasBufferedItems || hasMore;
  const {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    consumeLongPress,
  } = useQuickActionGesture(openQuickActions);

  const handleCardClick = React.useCallback((item) => {
    if (consumeLongPress()) return;
    onCardClick(item);
  }, [consumeLongPress, onCardClick]);

  React.useEffect(() => {
    autoFillSignatureRef.current = '';
    setRequestedPageCount(1);
  }, [mediaType, query, selectedGenre, selectedYear, selectedPlatform, selectedReleaseFilter, catalogSort]);

  React.useEffect(() => {
    if (catalogLibraryFilter !== 'hideAdded') return;
    if (isCatalogLoading || catalogError || !hasMore) return;
    if (visibleCatalogItems.length >= targetVisibleCount) return;

    const signature = `${filteredCatalogItems.length}:${visibleCatalogItems.length}:${targetVisibleCount}`;
    if (autoFillSignatureRef.current === signature) return;
    autoFillSignatureRef.current = signature;

    setPage((prev) => prev + 1);
  }, [
    catalogLibraryFilter,
    isCatalogLoading,
    catalogError,
    hasMore,
    filteredCatalogItems.length,
    visibleCatalogItems.length,
    targetVisibleCount,
    setPage,
  ]);

  const handleLoadMore = () => {
    const nextRequestedPageCount = requestedPageCount + 1;
    const nextTargetVisibleCount = nextRequestedPageCount * CATALOG_PAGE_SIZE;

    setRequestedPageCount(nextRequestedPageCount);

    if (catalogLibraryFilter === 'hideAdded') return;

    if (filteredCatalogItems.length < nextTargetVisibleCount && hasMore && !isCatalogLoading) {
      setPage((prev) => prev + 1);
    }
  };

  const loadMoreSentinelRef = useAutoLoadMoreOnScroll({
    enabled: Boolean(autoLoadMoreOnScroll),
    canLoadMore,
    isLoading: isCatalogLoading,
    itemCount: visibleCatalogItems.length,
    onLoadMore: handleLoadMore,
  });

  const resetCatalogFilters = () => {
    setQuery('');
    setSelectedGenre('');
    setSelectedYear('');
    setSelectedPlatform('');
    setSelectedReleaseFilter('all');
    setCatalogSort(mediaType === 'game' ? '-added' : 'popularity.desc');
    setRequestedPageCount(1);
    setCatalogLibraryFilter('all');
    setPage(1);
  };

  return (
    <div className="view-stack">
      <div className="flex items-center justify-between gap-4">
        <h2 className="app-page-title">{t.search.toUpperCase()}</h2>
        <div className="app-switch-wrap">
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMediaType('movie')}
            className={`app-switch-btn ${mediaType === 'movie' ? 'active' : ''}`}
          >
            {t.movies}
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMediaType('tv')}
            className={`app-switch-btn ${mediaType === 'tv' ? 'active' : ''}`}
          >
            {t.tvShows}
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMediaType('game')}
            className={`app-switch-btn ${mediaType === 'game' ? 'active' : ''}`}
          >
            {t.games}
          </button>
        </div>
      </div>

      <div className="catalog-controls">
        <div className="relative">
          <input
            type="text"
            placeholder={mediaType === 'movie' ? t.searchMovies : mediaType === 'tv' ? t.searchTv : t.searchGames}
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            className="app-input w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-12 text-sm font-bold placeholder-white/30 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setPage(1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-sm font-black transition-all"
              aria-label={t.clearSearch}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${mediaType === 'game' ? 'xl:grid-cols-6' : 'xl:grid-cols-5'} gap-3`}>
          <div>
            <CustomSelect
              value={catalogLibraryFilter}
              options={catalogLibraryFilterOptions}
              onChange={(nextValue) => { setCatalogLibraryFilter(nextValue); setPage(1); }}
              ariaLabel={t.catalogLibraryFilterLabel || t.inLibrary}
            />
          </div>
          <div>
            <CustomSelect
              value={selectedGenre}
              options={genreOptions}
              onChange={(nextValue) => { setSelectedGenre(nextValue); setPage(1); }}
              ariaLabel={t.filterGenreLabel || t.allGenres}
            />
          </div>
          <div>
            <CustomSelect
              value={selectedYear}
              options={yearOptions}
              onChange={(nextValue) => { setSelectedYear(nextValue); setPage(1); }}
              ariaLabel={t.filterYearLabel || t.allYears}
            />
          </div>
          {mediaType === 'game' && (
            <div>
              <CustomSelect
                value={selectedPlatform}
                options={platformOptions}
                onChange={(nextValue) => { setSelectedPlatform(nextValue); setPage(1); }}
                ariaLabel={t.gamePlatform}
              />
            </div>
          )}
          <div>
            <CustomSelect
              value={selectedReleaseFilter}
              options={releaseFilterOptions}
              onChange={(nextValue) => { setSelectedReleaseFilter(nextValue); setPage(1); }}
              ariaLabel={t.filterReleaseLabel || t.releaseAll}
            />
          </div>
          <div>
            <CustomSelect
              value={catalogSort}
              options={catalogSortOptions}
              onChange={(nextValue) => { setCatalogSort(nextValue); setPage(1); }}
              ariaLabel={t.filterSortLabel || t.rating}
            />
          </div>
        </div>
      </div>

      {catalogError && (
        <p className="text-center text-sm text-red-400 font-bold py-2">{catalogError}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {showInitialSkeleton && Array.from({ length: 10 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="media-card">
            <div className="media-poster catalog-skeleton-poster">
              <div className="catalog-skeleton-shimmer" />
            </div>
            <div className="catalog-skeleton-line" style={{ width: '88%' }} />
            <div className="catalog-skeleton-line" style={{ width: '46%' }} />
          </div>
        ))}

        {!showInitialSkeleton && visibleCatalogItems.map((item, index) => (
          <CatalogCard
            key={`${item.mediaType}-${item.id}`}
            item={item}
            index={index}
            libEntry={getLibraryEntry(item.mediaType, item.id)}
            isPulsing={addPulseId === `${item.mediaType}-${item.id}`}
            t={t}
            STATUS_BADGE_CONFIG={STATUS_BADGE_CONFIG}
            onCardClick={handleCardClick}
            openQuickActions={openQuickActions}
            onContextMenu={onContextMenu}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          />
        ))}
      </div>

      {!catalogError && !isCatalogLoading && visibleCatalogItems.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">{'\u{1F50D}'}</div>
          <p className="empty-state-title">{t.catalogEmptyTitle || t.empty}</p>
          <p className="empty-state-hint">{t.catalogEmptyHint || t.empty}</p>
          <button
            type="button"
            onClick={resetCatalogFilters}
            className="empty-state-action"
          >
            {t.resetCatalogFilters || t.clearSearch}
          </button>
        </div>
      )}

      {visibleCatalogItems.length > 0 && canLoadMore && (
        <>
          <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
          <button
            onClick={handleLoadMore}
            disabled={isCatalogLoading || !canLoadMore}
            className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {isCatalogLoading ? (t.loading || t.loadMore) : t.loadMore}
          </button>
        </>
      )}
      {mediaType === 'game' && <a href="https://rawg.io" target="_blank" rel="noreferrer" className="inline-flex text-xs font-bold text-blue-300 underline underline-offset-4">{t.rawgAttribution}</a>}
    </div>
  );
}
