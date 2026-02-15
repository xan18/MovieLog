import React from 'react';
import { CustomSelect, LazyImg } from '../ui.jsx';
import { getYear } from '../../utils/appUtils.js';
import { IMG_500 } from '../../constants/appConstants.js';

export default function LibraryView({
  shown, library,
  libraryType, setLibraryType,
  shelf, setShelf,
  sortBy, setSortBy,
  MOVIE_STATUSES, TV_STATUSES,
  t,
  onCardClick,
  openQuickActions,
  onCardContextMenu,
  onCardTouchStart,
  onCardTouchEnd,
  setActiveTab,
}) {
  const canSortByMyRating = shelf !== 'planned';
  const sortOptions = [
    { value: 'imdbRating', label: t.byImdbRating },
    ...(canSortByMyRating ? [{ value: 'myRating', label: t.byMyRating }] : []),
    { value: 'dateAdded', label: t.byDateAdded },
    { value: 'releaseYear', label: t.byReleaseYear },
  ];

  return (
    <div className="view-stack">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="app-page-title">{t.shelf.toUpperCase()}</h2>
        <div className="flex items-center gap-3">
          <div className="app-switch-wrap">
            <button onClick={() => setLibraryType('movie')} className={`app-switch-btn ${libraryType === 'movie' ? 'active' : ''}`}>{t.movies}</button>
            <button onClick={() => setLibraryType('tv')} className={`app-switch-btn ${libraryType === 'tv' ? 'active' : ''}`}>{t.tvShows}</button>
          </div>
          <CustomSelect
            value={sortBy}
            options={sortOptions}
            onChange={setSortBy}
            ariaLabel={t.byDateAdded}
            className="w-full md:w-auto"
          />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar">
        {(libraryType === 'movie' ? MOVIE_STATUSES : TV_STATUSES).map(s => {
          const count = library.filter(x => x.mediaType === libraryType && x.status === s.id).length;
          return (
            <button key={s.id} onClick={() => setShelf(s.id)}
              className={`shelf-pill ${shelf === s.id ? 'active' : ''}`}>
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {shown.map((item, i) => {
          const epProgress = (() => {
            if (item.mediaType !== 'tv') return null;
            const w = item.watchedEpisodes || {};
            const watchedCount = Object.values(w).reduce((sum, eps) => sum + eps.length, 0);
            const totalCount = (item.number_of_episodes || item.seasons?.reduce((s, se) => se.season_number > 0 ? s + se.episode_count : s, 0) || 0);
            if (totalCount === 0) return null;
            const remaining = totalCount - watchedCount;
            const pct = Math.round((watchedCount / totalCount) * 100);
            const badge = remaining <= 0
              ? { text: '\u2713', color: 'bg-green-600' }
              : { text: `\u25B6 ${remaining}`, color: 'bg-white/80 text-black' };
            return { badge, pct, done: remaining <= 0 };
          })();
          return (
            <div
              key={`${item.mediaType}-${item.id}`}
              className="media-card group card-stagger"
              style={{ '--stagger-i': i }}
              onContextMenu={(e) => onCardContextMenu(e, item)}
              onTouchStart={(e) => onCardTouchStart(e, item)}
              onTouchEnd={onCardTouchEnd}
              onTouchMove={onCardTouchEnd}
              onTouchCancel={onCardTouchEnd}
            >
              <div onClick={() => onCardClick(item)} className="media-poster cursor-pointer">
                <LazyImg src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]" alt={item.title || item.name} />
                {item.rating > 0 && <div className="media-pill absolute top-2 right-2 bg-yellow-500 text-black">{'\u2605'} {item.rating}</div>}
                {epProgress?.badge && <div className={`media-pill absolute top-2 left-2 ${epProgress.badge.color} shadow-lg`}>{epProgress.badge.text}</div>}
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
                      background: epProgress.done ? 'rgb(34, 197, 94)' : 'rgb(59, 130, 246)',
                    }}
                  />
                </div>
              )}
              <h3 className="media-title line-clamp-2">{item.title || item.name}</h3>
              <p className="media-meta font-normal">{getYear(item)}</p>
            </div>
          );
        })}
      </div>

      {shown.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">{'\u{1F3AC}'}</div>
          <p className="empty-state-title">{t.emptyShelfHint || t.empty}</p>
          <p className="empty-state-hint">{t.catalogEmptyHint || t.empty}</p>
          <button
            onClick={() => setActiveTab?.('catalog')}
            className="empty-state-action"
          >
            {t.goToCatalog || t.search}
          </button>
        </div>
      )}
    </div>
  );
}
