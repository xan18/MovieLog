import React from 'react';
import { CustomSelect, LazyImg } from '../ui.jsx';
import { YEARS, getYear } from '../../utils/appUtils.js';
import { IMG_500 } from '../../constants/appConstants.js';
import { useQuickActionGesture } from '../../hooks/useQuickActionGesture.js';

export default function CatalogView({
  // from useCatalog
  mediaType, setMediaType,
  query, setQuery,
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
  CATALOG_SORT_OPTIONS,
  RELEASE_FILTER_OPTIONS,
  // from App
  getLibraryEntry,
  openQuickActions,
  onCardClick,
  t,
  STATUS_BADGE_CONFIG,
  addPulseId,
}) {
  const genreOptions = [
    { value: '', label: t.allGenres },
    ...genres.map((genre) => ({ value: String(genre.id), label: genre.name })),
  ];

  const yearOptions = [
    { value: '', label: t.allYears },
    ...YEARS.map((year) => ({ value: String(year), label: String(year) })),
  ];

  const catalogSortOptions = CATALOG_SORT_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  const releaseFilterOptions = RELEASE_FILTER_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  const showInitialSkeleton = isCatalogLoading && catalogItems.length === 0;
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

  const resetCatalogFilters = () => {
    setQuery('');
    setSelectedGenre('');
    setSelectedYear('');
    setSelectedReleaseFilter('all');
    setCatalogSort('popularity.desc');
    setPage(1);
  };

  return (
    <div className="view-stack">
      <div className="flex items-center justify-between gap-4">
        <h2 className="app-page-title">{t.search.toUpperCase()}</h2>
        <div className="app-switch-wrap">
          <button onClick={() => setMediaType('movie')} className={`app-switch-btn ${mediaType === 'movie' ? 'active' : ''}`}>{t.movies}</button>
          <button onClick={() => setMediaType('tv')} className={`app-switch-btn ${mediaType === 'tv' ? 'active' : ''}`}>{t.tvShows}</button>
        </div>
      </div>

      <div className="catalog-controls">
        <div className="relative">
          <input
            type="text"
            placeholder={mediaType === 'movie' ? t.searchMovies : t.searchTv}
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <CustomSelect
            value={selectedGenre}
            options={genreOptions}
            onChange={(nextValue) => { setSelectedGenre(nextValue); setPage(1); }}
            ariaLabel={t.allGenres}
          />
          <CustomSelect
            value={selectedYear}
            options={yearOptions}
            onChange={(nextValue) => { setSelectedYear(nextValue); setPage(1); }}
            ariaLabel={t.allYears}
          />
          <CustomSelect
            value={catalogSort}
            options={catalogSortOptions}
            onChange={(nextValue) => { setCatalogSort(nextValue); setPage(1); }}
            ariaLabel={t.rating}
          />
          <CustomSelect
            value={selectedReleaseFilter}
            options={releaseFilterOptions}
            onChange={(nextValue) => { setSelectedReleaseFilter(nextValue); setPage(1); }}
            ariaLabel={t.releaseAll}
          />
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

        {!showInitialSkeleton && catalogItems.map((item, i) => {
          const libEntry = getLibraryEntry(item.mediaType, item.id);
          const badge = libEntry && STATUS_BADGE_CONFIG[libEntry.status];
          const cardKey = `${item.mediaType}-${item.id}`;
          const isPulsing = addPulseId === cardKey;
          const year = getYear(item);
          const genre = (item.genre_ids?.length > 0 || item.genres?.length > 0)
            ? (item.genres?.[0]?.name || '')
            : '';
          return (
            <div
              key={cardKey}
              onClick={() => handleCardClick(item)}
              onContextMenu={(event) => onContextMenu(event, item)}
              onTouchStart={(event) => onTouchStart(event, item)}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchCancel}
              className={`media-card group cursor-pointer card-stagger ${isPulsing ? 'add-pulse' : ''}`}
              style={{ '--stagger-i': i }}
            >
              <div className="media-poster">
                <LazyImg src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]" alt={item.title || item.name} />
                {badge && (
                  <div className="media-pill absolute top-2 right-2 text-white uppercase flex items-center gap-1 shadow-lg" style={{ background: badge.bg }}>
                    <span>{badge.icon}</span><span>{badge.label}</span>
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
                  {item.vote_average > 0 && <p className="text-xs font-bold mb-0.5">{"\u2605"} {item.vote_average.toFixed(1)}</p>}
                  {genre && <p className="text-[10px] font-medium opacity-80">{genre}</p>}
                  {year && <p className="text-[10px] font-normal opacity-60">{year}</p>}
                </div>
              </div>
              <h3 className="media-title line-clamp-2">{item.title || item.name}</h3>
              <p className="media-meta">{year}</p>
            </div>
          );
        })}
      </div>

      {!catalogError && !isCatalogLoading && catalogItems.length === 0 && (
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

      {catalogItems.length > 0 && hasMore && (
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={isCatalogLoading || !hasMore || page >= totalPages}
          className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {isCatalogLoading ? (t.loading || t.loadMore) : t.loadMore}
        </button>
      )}
    </div>
  );
}
