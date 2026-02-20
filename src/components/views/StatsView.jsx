import React from 'react';
import { SegmentedControl, LazyImg } from '../ui.jsx';
import { RATINGS } from '../../utils/appUtils.js';
import { IMG_200 } from '../../constants/appConstants.js';
import { useQuickActionGesture } from '../../hooks/useQuickActionGesture.js';

function RatingChart({ ratingDist, gradId }) {
  const rawMax = Math.max(...RATINGS.map((r) => ratingDist[r] || 0), 1);
  const scaleMax = Math.max(rawMax + 1, 4);
  const viewW = 420;
  const viewH = 164;
  const padX = 24;
  const padTop = 26;
  const padBottom = 34;
  const chartH = viewH - padTop - padBottom;
  const w = viewW - padX * 2;
  const baseY = padTop + chartH;
  const barW = 16;

  const points = RATINGS.map((r, i) => {
    const count = ratingDist[r] || 0;
    return { x: padX + (i / 9) * w, y: padTop + chartH - (count / scaleMax) * chartH, count, r };
  });

  const linePath = points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${gradId}Bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(96, 165, 250)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="rgb(96, 165, 250)" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={`${gradId}Line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(125, 211, 252)" stopOpacity="0.28" />
          <stop offset="50%" stopColor="rgb(96, 165, 250)" stopOpacity="0.78" />
          <stop offset="100%" stopColor="rgb(125, 211, 252)" stopOpacity="0.28" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={padX}
          x2={viewW - padX}
          y1={padTop + chartH * (1 - f)}
          y2={padTop + chartH * (1 - f)}
          stroke="currentColor"
          strokeOpacity="0.09"
          strokeWidth="0.5"
        />
      ))}

      <line x1={padX} x2={viewW - padX} y1={baseY} y2={baseY} stroke="currentColor" strokeOpacity="0.14" strokeWidth="1" />

      {points.map((pt) => {
        const h = Math.max(2, baseY - pt.y);
        return (
          <rect
            key={`bar-${pt.r}`}
            x={pt.x - barW / 2}
            y={baseY - h}
            width={barW}
            height={h}
            rx="6"
            fill={`url(#${gradId}Bar)`}
          />
        );
      })}

      <path d={linePath} fill="none" stroke={`url(#${gradId}Line)`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((pt) => (
        <g key={pt.r}>
          <circle cx={pt.x} cy={pt.y} r={pt.count > 0 ? 3.2 : 2} fill={pt.count > 0 ? 'rgb(147, 197, 253)' : 'rgba(148, 163, 184, 0.34)'} />
          {pt.count > 0 && <circle cx={pt.x} cy={pt.y} r="6" fill="rgb(96, 165, 250)" fillOpacity="0.14" />}
          {pt.count > 0 && (
            <text x={pt.x} y={Math.max(12, pt.y - 12)} textAnchor="middle" fill="currentColor" fillOpacity="0.72" fontSize="10" fontWeight="800">
              {pt.count}
            </text>
          )}
          <text x={pt.x} y={baseY + 23} textAnchor="middle" fill="currentColor" fillOpacity="0.5" fontSize="11" fontWeight="900">
            {pt.r}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function StatsView({
  movieStats, tvStats, peopleData,
  t,
  statsView, setStatsView,
  peopleView, setPeopleView,
  getPersonDetails, getFullDetails, openQuickActions,
}) {
  const {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    consumeLongPress,
  } = useQuickActionGesture(openQuickActions);

  const handleDetailsOpen = (item) => {
    if (consumeLongPress()) return;
    getFullDetails(item);
  };

  const totalItems = movieStats.total + tvStats.total;
  const totalWatched = movieStats.completed + tvStats.completed;
  const totalPlanned = movieStats.planned + tvStats.planned;
  const totalRuntime = movieStats.totalRuntime + tvStats.totalRuntime;
  const totalHours = Math.floor(totalRuntime / 60);

  const movieSummary = [
    { key: 'movie-total', label: t.total, value: movieStats.total },
    { key: 'movie-completed', label: t.watched, value: movieStats.completed },
    { key: 'movie-planned', label: t.inPlans, value: movieStats.planned },
    { key: 'movie-avg', label: t.avgRating, value: movieStats.avgRating || '—' },
  ];

  const tvSummary = [
    { key: 'tv-watching', label: t.watchingNow, value: tvStats.watching },
    { key: 'tv-completed', label: t.watched, value: tvStats.completed },
    { key: 'tv-planned', label: t.inPlans, value: tvStats.planned },
    { key: 'tv-dropped', label: t.droppedStat, value: tvStats.dropped },
    { key: 'tv-paused', label: t.pausedStat, value: tvStats.onHold },
  ];

  return (
    <div className="view-stack">
      <SegmentedControl
        items={[{ id: 'statistics', label: `\u{1F4CA} Аналитика` }, { id: 'people', label: `\u{1F465} ${t.people}` }]}
        activeId={statsView}
        onChange={setStatsView}
      />

      {statsView === 'statistics' && (
        <div className="analytics-layout space-y-5">
          <section className="analytics-hero">
            <p className="analytics-overline">{t.totalStats}</p>
            <div className="analytics-total-row">
              <p className="analytics-total">{totalItems}</p>
              <p className="analytics-total-caption">{t.titlesInLib}</p>
            </div>

            <div className="analytics-kpi-grid">
              <article className="analytics-kpi">
                <p className="analytics-kpi-value">{totalWatched}</p>
                <p className="analytics-kpi-label">{t.watched}</p>
              </article>
              <article className="analytics-kpi">
                <p className="analytics-kpi-value">{totalPlanned}</p>
                <p className="analytics-kpi-label">{t.inPlans}</p>
              </article>
              <article className="analytics-kpi">
                <p className="analytics-kpi-value">{totalHours} {t.h}</p>
                <p className="analytics-kpi-label">{t.time}</p>
              </article>
            </div>
          </section>

          <section className="analytics-section">
            <header className="analytics-section-head">
              <h2 className="analytics-section-title">{t.movies}</h2>
            </header>

            <div className="analytics-metric-grid analytics-metric-grid-movies">
              {movieSummary.map((metric) => (
                <article key={metric.key} className="analytics-metric-card">
                  <p className="analytics-metric-label">{metric.label}</p>
                  <p className="analytics-metric-value">{metric.value}</p>
                </article>
              ))}
            </div>

            <div className="analytics-meta-grid">
              <article className="analytics-meta-card">
                <p className="analytics-meta-label">{t.watchTime}</p>
                <p className="analytics-meta-value">
                  {movieStats.totalRuntime > 0 ? `${Math.floor(movieStats.totalRuntime / 60)} ${t.h} ${movieStats.totalRuntime % 60} ${t.min}` : '—'}
                </p>
              </article>

              <article className="analytics-meta-card">
                <p className="analytics-meta-label">{t.rated}</p>
                <p className="analytics-meta-value">{movieStats.rated}</p>
                <p className="analytics-meta-subtle">{t.of} {movieStats.completed}</p>
              </article>

              {movieStats.favDecade && (
                <article className="analytics-meta-card">
                  <p className="analytics-meta-label">{t.favDecade}</p>
                  <p className="analytics-meta-value">{movieStats.favDecade}</p>
                </article>
              )}
            </div>

            {movieStats.rated > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.ratingDist}</p>
                <div className="analytics-chart-wrap">
                  <RatingChart ratingDist={movieStats.ratingDist} gradId="movie" />
                </div>
              </div>
            )}

            {movieStats.topRated.length > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.bestMovies}</p>
                <div className="analytics-list">
                  {movieStats.topRated.map((movie, i) => (
                    <button
                      key={movie.id}
                      onClick={() => handleDetailsOpen(movie)}
                      onContextMenu={(event) => onContextMenu(event, movie)}
                      onTouchStart={(event) => onTouchStart(event, movie)}
                      onTouchMove={onTouchMove}
                      onTouchEnd={onTouchEnd}
                      onTouchCancel={onTouchCancel}
                      className="analytics-list-row"
                    >
                      <span className="analytics-list-rank">{i + 1}</span>
                      {movie.poster_path
                        ? <LazyImg src={`${IMG_200}${movie.poster_path}`} className="analytics-list-poster" />
                        : <span className="analytics-list-poster analytics-list-poster-empty" />}

                      <span className="analytics-list-main">
                        <span className="analytics-list-title">{movie.title}</span>
                        <span className="analytics-list-subtitle">{movie.release_date ? new Date(movie.release_date).getFullYear() : ''}</span>
                      </span>

                      <span className="analytics-list-score">{movie.rating}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(movieStats.byYear).length > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.byYears}</p>
                <div className="analytics-chip-wrap">
                  {Object.entries(movieStats.byYear)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([year, count]) => (
                      <span key={year} className="analytics-chip">{year}: {count}</span>
                    ))}
                </div>
              </div>
            )}

            {Object.keys(movieStats.byGenre).length > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.byGenres}</p>
                <div className="analytics-chip-wrap">
                  {Object.entries(movieStats.byGenre)
                    .sort(([, a], [, b]) => b - a)
                    .map(([genre, count]) => (
                      <span key={genre} className="analytics-chip">{genre}: {count}</span>
                    ))}
                </div>
              </div>
            )}
          </section>

          <section className="analytics-section">
            <header className="analytics-section-head">
              <h2 className="analytics-section-title">{t.tvShows}</h2>
            </header>

            <div className="analytics-metric-grid analytics-metric-grid-tv">
              {tvSummary.map((metric) => (
                <article key={metric.key} className="analytics-metric-card">
                  <p className="analytics-metric-label">{metric.label}</p>
                  <p className="analytics-metric-value">{metric.value}</p>
                </article>
              ))}
            </div>

            <div className="analytics-meta-grid analytics-meta-grid-tv">
              <article className="analytics-meta-card">
                <p className="analytics-meta-label">{t.episodes}</p>
                <p className="analytics-meta-value">{tvStats.totalEpisodes}</p>
              </article>
              <article className="analytics-meta-card">
                <p className="analytics-meta-label">{t.seasons}</p>
                <p className="analytics-meta-value">{tvStats.totalSeasons}</p>
              </article>
              <article className="analytics-meta-card">
                <p className="analytics-meta-label">{t.avgRating}</p>
                <p className="analytics-meta-value">{tvStats.avgRating || '—'}</p>
              </article>
              <article className="analytics-meta-card">
                <p className="analytics-meta-label">{t.time}</p>
                <p className="analytics-meta-value">
                  {tvStats.totalRuntime > 0 ? `${Math.floor(tvStats.totalRuntime / 60)} ${t.h} ${tvStats.totalRuntime % 60} ${t.min}` : '—'}
                </p>
              </article>
            </div>

            {tvStats.rated > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.ratingDist}</p>
                <div className="analytics-chart-wrap">
                  <RatingChart ratingDist={tvStats.ratingDist} gradId="tv" />
                </div>
              </div>
            )}

            {tvStats.topRated.length > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.bestShows}</p>
                <div className="analytics-list">
                  {tvStats.topRated.map((show, i) => (
                    <button
                      key={show.id}
                      onClick={() => handleDetailsOpen(show)}
                      onContextMenu={(event) => onContextMenu(event, show)}
                      onTouchStart={(event) => onTouchStart(event, show)}
                      onTouchMove={onTouchMove}
                      onTouchEnd={onTouchEnd}
                      onTouchCancel={onTouchCancel}
                      className="analytics-list-row"
                    >
                      <span className="analytics-list-rank">{i + 1}</span>
                      {show.poster_path
                        ? <LazyImg src={`${IMG_200}${show.poster_path}`} className="analytics-list-poster" />
                        : <span className="analytics-list-poster analytics-list-poster-empty" />}

                      <span className="analytics-list-main">
                        <span className="analytics-list-title">{show.name || show.title}</span>
                        <span className="analytics-list-subtitle">{show.first_air_date ? new Date(show.first_air_date).getFullYear() : ''}</span>
                      </span>

                      <span className="analytics-list-score">{show.rating}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(tvStats.byYear).length > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.byYears}</p>
                <div className="analytics-chip-wrap">
                  {Object.entries(tvStats.byYear)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([year, count]) => (
                      <span key={year} className="analytics-chip">{year}: {count}</span>
                    ))}
                </div>
              </div>
            )}

            {Object.keys(tvStats.byGenre).length > 0 && (
              <div className="analytics-block">
                <p className="analytics-block-title">{t.byGenres}</p>
                <div className="analytics-chip-wrap">
                  {Object.entries(tvStats.byGenre)
                    .sort(([, a], [, b]) => b - a)
                    .map(([genre, count]) => (
                      <span key={genre} className="analytics-chip">{genre}: {count}</span>
                    ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {statsView === 'people' && (
        <div className="view-stack">
          <SegmentedControl
            items={[
              { id: 'directors', label: `\u{1F3AC} ${t.directorsTab}` },
              { id: 'actors', label: `\u{1F3AD} ${t.actorsTab}` }
            ]}
            activeId={peopleView} onChange={setPeopleView}
          />

          {peopleData.length === 0 ? (
            <div className="empty-state compact">
              <div className="empty-state-icon" aria-hidden="true">{'\u{1F465}'}</div>
              <p className="empty-state-title">
                {peopleView === 'directors' ? t.directorsTab : t.actorsTab}
              </p>
              <p className="empty-state-hint">{t.peopleHint}</p>
            </div>
          ) : (
            <>
              <p className="accent-text text-[10px] font-black uppercase tracking-widest">
                {t.topOf} {peopleView === 'directors' ? t.directorsOf : t.actorsOf} ({peopleData.length})
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {peopleData.map((person, i) => (
                  <div key={person.id} onClick={() => getPersonDetails(person.id)} className="group cursor-pointer card-stagger" style={{ '--stagger-i': i }}>

                    <div className="relative mb-3 rounded-2xl overflow-hidden shadow-xl aspect-[3/4] bg-white/5 transition-transform group-hover:scale-105">
                      {person.profile_path ? (
                        <LazyImg src={`https://image.tmdb.org/t/p/w500${person.profile_path}`} className="w-full h-full object-cover" alt={person.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">?</div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-12">
                        <p className="accent-text text-[9px] font-black uppercase mb-0.5">{t.inLibrary}</p>
                        <p className="text-2xl font-black leading-tight">{person.items.length}</p>
                      </div>
                      {person.avgRating > 0 && (
                        <div className="absolute top-2 right-2 bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 rounded-lg shadow-lg">{person.avgRating}</div>
                      )}
                    </div>
                    <h3 className="font-bold text-xs mb-0.5 line-clamp-1">{person.name}</h3>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

StatsView.displayName = 'StatsView';

