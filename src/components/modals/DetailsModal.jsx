import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LazyImg } from '../ui.jsx';
import { RATINGS, formatMoney } from '../../utils/appUtils.js';
import { isReleasedDate, isReleasedItem } from '../../utils/releaseUtils.js';
import { IMG_500, IMG_200, IMG_ORIGINAL } from '../../constants/appConstants.js';

export default function DetailsModal({
  selectedItem,
  isClosing,
  onClose,
  t,
  DATE_LOCALE,
  TV_SHOW_STATUS_MAP,
  TV_STATUSES,
  CREW_ROLE_MAP,
  getLibraryEntry,
  addToLibrary,
  setTvStatus,
  setDeleteModal,
  setTrailerId,
  setRatingModal,
  setMovieRatingModal,
  seasonEpisodes,
  loadingSeason,
  loadSeasonEpisodes,
  handleEpisodeClick,
  handleSeasonToggle,
  getPersonDetails,
  getFullDetails,
  triggerAddPulse,
}) {
  const [bouncingEp, setBouncingEp] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    if (selectedItem) setActiveSection('overview');
  }, [selectedItem?.id, selectedItem?.mediaType]);

  const handleEpClick = useCallback((tvId, seasonNum, epNum) => {
    handleEpisodeClick(tvId, seasonNum, epNum);
    setBouncingEp(`${seasonNum}-${epNum}`);
    setTimeout(() => setBouncingEp(null), 380);
  }, [handleEpisodeClick]);

  const tabs = useMemo(() => {
    const trailerLabel = (t.watchTrailer || 'Trailer').replace('▶', '').replace('►', '').trim() || 'Trailer';
    return [
      { id: 'overview', label: t.description || 'Overview' },
      ...(selectedItem?.mediaType === 'tv' ? [{ id: 'seasons', label: t.seasonsTab || 'Seasons' }] : []),
      { id: 'actors', label: t.actors || 'Actors' },
      { id: 'crew', label: t.crew || 'Crew' },
      { id: 'trailer', label: trailerLabel },
    ];
  }, [selectedItem?.mediaType, t]);

  if (!selectedItem) return null;

  const hasBackdrop = Boolean(selectedItem.backdrop_path);
  const displayTitle = selectedItem.title || selectedItem.name;
  const originalTitle = (
    selectedItem.mediaType === 'movie'
      ? (selectedItem.original_title || selectedItem.original_name)
      : (selectedItem.original_name || selectedItem.original_title)
  ) || '';
  const showOriginalTitle = (
    originalTitle.trim().length > 0
    && originalTitle.trim().toLowerCase() !== String(displayTitle || '').trim().toLowerCase()
  );
  const releaseYear = selectedItem.mediaType === 'movie'
    ? (selectedItem.release_date ? new Date(selectedItem.release_date).getFullYear() : null)
    : (selectedItem.first_air_date ? new Date(selectedItem.first_air_date).getFullYear() : null);
  const heroMeta = [
    releaseYear ? { id: 'year', text: String(releaseYear) } : null,
    selectedItem.mediaType === 'movie' && selectedItem.runtime
      ? { id: 'runtime', text: `${selectedItem.runtime} ${t.min}` }
      : null,
    selectedItem.mediaType === 'tv' && selectedItem.number_of_seasons
      ? { id: 'seasons', text: `${selectedItem.number_of_seasons} ${t.seasonsCount}` }
      : null,
    selectedItem.vote_average > 0
      ? { id: 'rating', text: `\u2605 ${selectedItem.vote_average.toFixed(1)}`, highlighted: true }
      : null,
  ].filter(Boolean);
  const cast = (selectedItem.credits?.cast || []).slice(0, 40);
  const creators = selectedItem.mediaType === 'movie'
    ? (selectedItem.credits?.crew || []).filter(person => person.job === 'Director')
    : (selectedItem.created_by || []);
  const libraryEntry = getLibraryEntry(selectedItem.mediaType, selectedItem.id);
  const activeLibraryStatus = libraryEntry?.status || null;
  const isItemReleased = isReleasedItem(selectedItem);

  const crewGroups = (() => {
    const people = selectedItem.credits?.crew || [];
    const filtered = selectedItem.mediaType === 'movie' ? people.filter(person => person.job !== 'Director') : people;
    const byJob = new Map();
    filtered.forEach((person) => {
      if (!person?.job) return;
      if (!byJob.has(person.job)) byJob.set(person.job, []);
      const group = byJob.get(person.job);
      if (!group.find(existing => existing.id === person.id)) group.push(person);
    });
    return Array.from(byJob.entries())
      .map(([job, peopleInGroup]) => ({ job, people: peopleInGroup }))
      .sort((a, b) => b.people.length - a.people.length)
      .slice(0, 10);
  })();

  const renderOverview = () => (
    <div className="space-y-6">
      {selectedItem.overview && (
        <div>
          <p className="accent-text text-[10px] font-black uppercase tracking-widest mb-2 italic">{t.description}</p>
          <p className="text-sm leading-relaxed opacity-80 font-normal">{selectedItem.overview}</p>
        </div>
      )}

      {selectedItem.mediaType === 'movie' && (selectedItem.budget > 0 || selectedItem.revenue > 0) && (
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          {selectedItem.budget > 0 && <div className="text-sm"><span className="opacity-60">{t.budget}:</span> <span className="font-semibold">{formatMoney(selectedItem.budget)}</span></div>}
          {selectedItem.revenue > 0 && <div className="text-sm"><span className="opacity-60">{t.revenue}:</span> <span className="font-semibold">{formatMoney(selectedItem.revenue)}</span></div>}
        </div>
      )}

      {selectedItem.mediaType === 'movie' && selectedItem.collectionParts?.parts?.length > 0 && (
        <section className="details-section franchise-section">
          <div className="franchise-header">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 italic">{t.franchiseTitles || 'Franchise titles'}</p>
            {selectedItem.collectionParts?.name && <p className="text-xs opacity-60 mt-1">{selectedItem.collectionParts.name}</p>}
          </div>

          <div className="franchise-timeline themed-x-scroll">
            <div className="franchise-track">
              {selectedItem.collectionParts.parts.map((part, idx) => {
              const isCurrent = part.id === selectedItem.id;
              const releaseYear = part.release_date ? new Date(part.release_date).getFullYear() : null;
              const title = part.title || part.name;

              return (
                <button
                  key={`collection-part-${part.id}`}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => getFullDetails({ ...part, mediaType: 'movie' })}
                  className={`franchise-card ${isCurrent ? 'current' : ''}`}
                  aria-current={isCurrent ? 'true' : 'false'}>
                  <span className="franchise-year-chip">{releaseYear || 'TBA'}</span>
                  <span className="franchise-order-chip">#{idx + 1}</span>
                  <div className="franchise-poster-wrap">
                    <LazyImg src={part.poster_path ? `${IMG_200}${part.poster_path}` : '/poster-placeholder.svg'} className="franchise-poster" alt={title} />
                    <div className="franchise-poster-overlay">
                      <p className="franchise-title line-clamp-2">{title}</p>
                    </div>
                  </div>
                  {isCurrent && <span className="franchise-current-tag">{t.franchiseCurrent || 'Current'}</span>}
                </button>
              );
            })}
            </div>
          </div>
        </section>
      )}

      {selectedItem.recommendations?.length > 0 && (
        <section className="details-section">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-4 italic">{t.recommendations}</p>
          <div className="scroll-x themed-x-scroll">
            {selectedItem.recommendations.map(rec => (
              <div key={`${selectedItem.mediaType}-rec-${rec.id}`} onClick={() => getFullDetails({ ...rec, mediaType: selectedItem.mediaType })} className="rec-item">
                <LazyImg src={rec.poster_path ? `${IMG_200}${rec.poster_path}` : '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover rounded-2xl shadow-xl mb-2" alt={rec.title || rec.name} />
                <p className="text-[9px] font-black uppercase truncate text-center">{rec.title || rec.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="details-actions p-7 md:p-8 text-center">
        {selectedItem.mediaType === 'tv' && (
          <div className="mb-6">
            <p className="accent-text text-[10px] font-black uppercase tracking-widest mb-3 italic">{t.overallRating}</p>
            <div className="flex justify-center gap-1">
              {RATINGS.map((s, i) => <span key={s} className={`text-2xl star-animated ${Number(selectedItem.rating) >= s ? 'text-yellow-400' : 'text-slate-800'}`} style={{ '--star-i': i }}>{'\u2605'}</span>)}
            </div>
            {selectedItem.rating > 0 && <p className="text-sm font-medium mt-2 text-yellow-400">{selectedItem.rating}/10</p>}
          </div>
        )}

        {selectedItem.mediaType === 'movie' && (
          <div className="mb-6">
            {selectedItem.rating > 0 ? (
              <div>
                <p className="accent-text text-[10px] font-black uppercase tracking-widest mb-3 italic">{t.yourRating}</p>
                <div className="flex justify-center gap-1 mb-4">
                  {RATINGS.map((s, i) => <span key={s} className={`text-2xl star-animated ${Number(selectedItem.rating) >= s ? 'text-yellow-400' : 'text-slate-800'}`} style={{ '--star-i': i }}>{'\u2605'}</span>)}
                </div>
                <p className="text-sm font-medium text-yellow-400">{selectedItem.rating}/10</p>
              </div>
            ) : (
              <p className="text-sm opacity-60 mb-4">{t.notRatedYet}</p>
            )}
            <button disabled={!isItemReleased} onClick={() => {
              if (!isItemReleased) return;
              const libEntry = getLibraryEntry('movie', selectedItem.id);
              setMovieRatingModal({ movieId: selectedItem.id, currentRating: libEntry?.rating || 0 });
            }} className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg ${isItemReleased ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-white/10 text-white/40 cursor-not-allowed'}`}>
              {selectedItem.rating > 0 ? t.changeRating : t.rateMovie}
            </button>
          </div>
        )}

        {selectedItem.mediaType === 'movie' ? (
          <div className="flex gap-4">
            <button onClick={() => { addToLibrary(selectedItem, 'planned', 0, false); triggerAddPulse?.(`${selectedItem.mediaType}-${selectedItem.id}`); }} className={`details-status-btn flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 ${activeLibraryStatus === 'planned' ? 'is-active' : ''}`}>{t.toPlans}</button>
            <button disabled={!isItemReleased} onClick={() => {
              if (!isItemReleased) return;
              const libEntry = getLibraryEntry('movie', selectedItem.id);
              addToLibrary(selectedItem, 'completed', 0, false);
              setMovieRatingModal({ movieId: selectedItem.id, currentRating: libEntry?.rating || selectedItem.rating || 0 });
            }} className={`details-status-btn flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 ${activeLibraryStatus === 'completed' ? 'is-active' : ''} ${!isItemReleased ? 'is-disabled' : ''}`}>{t.alreadyWatched}</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {TV_STATUSES.map(s => (
              <button key={s.id} disabled={s.id === 'completed' && !isItemReleased} onClick={() => {
                if (s.id === 'completed' && !isItemReleased) return;
                const exists = getLibraryEntry('tv', selectedItem.id);
                if (!exists) addToLibrary(selectedItem, s.id, 0, false);
                else setTvStatus(selectedItem.id, s.id, selectedItem);
              }} className={`details-status-btn py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${activeLibraryStatus === s.id ? 'is-active' : ''} ${s.id === 'completed' && !isItemReleased ? 'is-disabled' : ''}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {!isItemReleased && <p className="text-[10px] opacity-55 mt-3 uppercase tracking-wide">{t.unreleasedLocked}</p>}

        {getLibraryEntry(selectedItem.mediaType, selectedItem.id) && (
          <button onClick={() => setDeleteModal({ mediaType: selectedItem.mediaType, id: selectedItem.id, title: selectedItem.title || selectedItem.name })} className="w-full mt-4 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">{t.deleteFromLib}</button>
        )}
      </div>
    </div>
  );

  const renderActors = () => (
    <section className="space-y-4">
      {!cast.length && <p className="text-sm opacity-60">No cast data.</p>}
      {cast.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {cast.map(actor => (
            <button key={actor.id || actor.credit_id} onClick={() => getPersonDetails(actor.id)} className="text-left rounded-2xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition-all">
              <div className="aspect-[3/4] bg-white/10">
                {actor.profile_path ? <LazyImg src={`${IMG_200}${actor.profile_path}`} className="w-full h-full object-cover" alt={actor.name} /> : <div className="w-full h-full flex items-center justify-center text-sm opacity-30">No photo</div>}
              </div>
              <div className="p-3">
                <p className="text-sm font-black leading-tight line-clamp-2">{actor.name}</p>
                {actor.character && <p className="text-xs opacity-50 mt-1 line-clamp-2">{actor.character}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const renderCrew = () => (
    <section className="space-y-5">
      {creators.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest opacity-65 mb-3">{selectedItem.mediaType === 'movie' ? (creators.length > 1 ? t.directors : t.director) : (creators.length > 1 ? t.creators : t.creator)}</p>
          <div className="flex flex-wrap gap-2">
            {creators.map(person => <button key={person.id || person.credit_id} onClick={() => getPersonDetails(person.id)} className="px-3 py-1.5 rounded-full border border-white/15 bg-white/8 hover:bg-white/12 text-xs font-semibold transition-all">{person.name}</button>)}
          </div>
        </div>
      )}

      {crewGroups.length > 0 && crewGroups.map(group => (
        <div key={group.job}>
          <p className="text-[11px] font-black uppercase tracking-widest opacity-55 mb-3">{CREW_ROLE_MAP[group.job] || group.job}</p>
          <div className="flex flex-wrap gap-2">
            {group.people.map(person => <button key={`${group.job}-${person.id}`} onClick={() => getPersonDetails(person.id)} className="px-3 py-1.5 rounded-full border border-white/15 bg-white/8 hover:bg-white/12 text-xs font-semibold transition-all">{person.name}</button>)}
          </div>
        </div>
      ))}

      {creators.length === 0 && crewGroups.length === 0 && <p className="text-sm opacity-60">No crew data.</p>}
    </section>
  );

  const renderTrailer = () => (
    <section className="space-y-4">
      {selectedItem.trailer ? (
        <>
          <div className="details-trailer-frame">
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${selectedItem.trailer}?rel=0`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title="Trailer"></iframe>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href={`https://www.youtube.com/watch?v=${selectedItem.trailer}`} target="_blank" rel="noreferrer" className="flex-1 py-3 px-4 rounded-2xl border border-white/15 bg-white/8 hover:bg-white/12 text-center text-sm font-black uppercase tracking-widest transition-all">Open on YouTube</a>
            <button type="button" onClick={() => setTrailerId(selectedItem.trailer)} className="flex-1 py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-sm font-black uppercase tracking-widest transition-all">{t.watchTrailer}</button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center"><p className="text-sm opacity-70">Trailer is not available for this title.</p></div>
      )}
    </section>
  );

  const renderSeasons = () => {
    if (selectedItem.mediaType !== 'tv') return null;

    const filteredSeasons = (selectedItem.seasons || []).filter(s => s.season_number > 0);
    if (filteredSeasons.length === 0) {
      return <p className="text-sm opacity-60">No season data.</p>;
    }

    const libEntry = getLibraryEntry('tv', selectedItem.id);

    return (
      <section className="season-list-wrap space-y-2.5">
        <p className="accent-text text-[10px] font-black uppercase tracking-widest mb-1 italic">{t.seasonsEpisodes}</p>
        {filteredSeasons.map((season) => {
          const watched = libEntry?.watchedEpisodes?.[season.season_number] || [];
          const totalEpisodes = Number(season.episode_count) || 0;
          const watchedCount = totalEpisodes > 0 ? Math.min(watched.length, totalEpisodes) : watched.length;
          const progressPct = totalEpisodes > 0 ? Math.min(100, Math.round((watchedCount / totalEpisodes) * 100)) : 0;
          const allWatched = totalEpisodes > 0 && watchedCount >= totalEpisodes;
          const inProgress = watchedCount > 0 && !allWatched;
          const seasonRating = libEntry?.seasonRatings?.[season.season_number] || 0;
          const canRateSeason = isReleasedDate(season.air_date);
          const seasonYear = season.air_date ? new Date(season.air_date).getFullYear() : null;
          const seasonLabel = `${t.season} ${season.season_number}`;
          const seasonPoster = season.poster_path
            ? `${IMG_200}${season.poster_path}`
            : selectedItem.poster_path
              ? `${IMG_200}${selectedItem.poster_path}`
              : '/poster-placeholder.svg';
          const seasonState = allWatched ? 'completed' : inProgress ? 'in-progress' : 'not-started';
          const seasonStateLabel = allWatched
            ? (t.seasonStateCompleted || 'Completed')
            : inProgress
              ? (t.seasonStateInProgress || 'In progress')
              : (t.seasonStateNotStarted || 'Not started');
          const episodesLabel = typeof t.episodes === 'string' ? t.episodes.toLowerCase() : 'episodes';

          return (
            <details key={season.id || `${selectedItem.id}-${season.season_number}`} className={`season-card season-state-${seasonState}`}>
              <summary onClick={() => loadSeasonEpisodes(selectedItem.id, season.season_number)} className="season-summary">
                <div className="season-summary-main">
                  <div className="season-poster-wrap">
                    <LazyImg src={seasonPoster} className="season-poster-thumb" alt={seasonLabel} />
                  </div>

                  <div className="season-main">
                    <div className="season-title-row">
                      <span className="season-title">{seasonLabel}</span>
                      <span className="season-count">{watchedCount}/{totalEpisodes}</span>
                    </div>

                    <div className="season-meta-row">
                      <span>{seasonYear || '—'}</span>
                      <span>{totalEpisodes} {episodesLabel}</span>
                      <span className="season-progress-pct">{progressPct}%</span>
                    </div>

                    {totalEpisodes > 0 && (
                      <div className="season-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} aria-label={`${seasonLabel}: ${progressPct}%`}>
                        <div className="season-progress-fill" style={{ width: `${progressPct}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="season-actions">
                    <span className="season-state-chip">{seasonStateLabel}</span>
                    <button
                      disabled={!canRateSeason}
                      className={`season-rate-btn ${canRateSeason ? 'bg-white/10 hover:bg-white/15 border-white/20' : 'bg-white/5 border-white/10 opacity-40 cursor-not-allowed'}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canRateSeason) return;
                        setRatingModal({ tvId: selectedItem.id, seasonNumber: season.season_number, currentRating: seasonRating });
                      }}>
                      {seasonRating > 0 ? (<><span className="text-yellow-400">{'\u2605'}</span><span>{seasonRating}/10</span></>) : t.rateSeason}
                    </button>
                  </div>
                </div>
              </summary>

              <div className="season-episodes-body">
                {loadingSeason === season.season_number && <p className="text-xs opacity-40 text-center py-6">{t.loading}</p>}
                {seasonEpisodes[season.season_number] && (
                  <div className="space-y-0">
                    {seasonEpisodes[season.season_number].map(ep => {
                      const isWatched = watched.includes(ep.episode_number);
                      const airDate = ep.air_date ? new Date(ep.air_date).toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
                      const today = new Date(); today.setHours(0, 0, 0, 0);
                      const isAired = ep.air_date ? new Date(ep.air_date) <= today : false;
                      return (
                        <button key={ep.id} disabled={!isAired} onClick={() => { if (isAired) handleEpClick(selectedItem.id, season.season_number, ep.episode_number); }} className={`w-full flex items-center gap-3 py-3.5 border-b border-white/5 last:border-b-0 rounded-lg px-2 transition-all text-left ${!isAired ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5 group/ep cursor-pointer'}`}>
                          <span className="text-sm opacity-30 w-6 text-center flex-shrink-0">{ep.episode_number}</span>
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${bouncingEp === `${season.season_number}-${ep.episode_number}` ? 'ep-bounce' : ''} ${isWatched ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : !isAired ? 'bg-white/10' : 'bg-white/20 group-hover/ep:bg-white/40'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate transition-all ${isWatched ? 'opacity-50' : !isAired ? 'opacity-40' : 'opacity-90'}`}>{ep.name || `${t.episode} ${ep.episode_number}`}</p>
                            {airDate && <p className="text-[11px] opacity-30 font-normal mt-0.5">{airDate}</p>}
                            {!ep.air_date && <p className="text-[11px] opacity-20 font-normal mt-0.5">{t.dateNotAnnounced}</p>}
                          </div>
                          {isWatched && <span className={`text-green-500 text-xs font-bold flex-shrink-0 ${bouncingEp === `${season.season_number}-${ep.episode_number}` ? 'ep-bounce' : ''}`}>{'\u2713'}</span>}
                        </button>
                      );
                    })}
                    {(() => {
                      const today = new Date(); today.setHours(0, 0, 0, 0);
                      const airedEps = seasonEpisodes[season.season_number].filter(ep => ep.air_date && new Date(ep.air_date) <= today).map(ep => ep.episode_number);
                      const allAiredWatched = airedEps.length > 0 && airedEps.every(ep => watched.includes(ep));
                      if (airedEps.length === 0) return null;
                      return (
                        <button onClick={() => handleSeasonToggle(selectedItem.id, season.season_number, season.episode_count, airedEps)} className={`w-full mt-3 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all border ${allAiredWatched ? 'bg-green-600/15 border-green-500/25 text-green-400 hover:bg-green-600/25' : 'bg-white/5 border-white/10 opacity-60 hover:opacity-100 hover:bg-white/10'}`}>
                          {allAiredWatched ? t.allWatched : t.markAllWatched}
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </section>
    );
  };

  const renderHeroHead = (extraClass = '') => (
    <div className={`details-hero-head ${extraClass}`.trim()}>
      <LazyImg
        src={selectedItem.poster_path ? `${IMG_500}${selectedItem.poster_path}` : '/poster-placeholder.svg'}
        className="details-hero-poster"
        alt={displayTitle}
      />
      <div className="details-hero-copy">
        <h2 className="details-hero-title">{displayTitle}</h2>
        {showOriginalTitle && (
          <p className="details-hero-original">{originalTitle}</p>
        )}
        {heroMeta.length > 0 && (
          <div className="details-hero-stats">
            {heroMeta.map((meta, idx) => (
              <React.Fragment key={meta.id}>
                {idx > 0 && <span className="details-hero-separator">•</span>}
                <span className={`details-hero-stat ${meta.highlighted ? 'highlighted' : ''}`}>{meta.text}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {(selectedItem.genres || []).length > 0 && (
          <div className="details-hero-genres">
            {(selectedItem.genres || []).map(g => <span key={g.id} className="details-hero-genre">{g.name}</span>)}
          </div>
        )}
        {selectedItem.mediaType === 'tv' && selectedItem.status && (
          <div className="mt-3">
            {TV_SHOW_STATUS_MAP[selectedItem.status]
              ? <span className={`status-badge ${TV_SHOW_STATUS_MAP[selectedItem.status].class}`}>{TV_SHOW_STATUS_MAP[selectedItem.status].label}</span>
              : <span className="status-badge" style={{ background: 'rgba(100,100,100,0.2)', color: '#888' }}>{selectedItem.status}</span>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`fixed inset-0 z-[100] overflow-y-auto modal-overlay details-overlay ${isClosing ? 'modal-exit' : 'modal-enter'}`} onClick={onClose}>
      <div className="min-h-screen px-4 py-10 md:py-14">
        <div className="details-surface relative max-w-5xl mx-auto rounded-[2.2rem] overflow-hidden" onClick={e => e.stopPropagation()}>
          <button className="details-close absolute top-6 right-6 z-20" onClick={onClose} title={t.close} aria-label={t.close}>
            <svg className="details-close-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" />
            </svg>
          </button>

          {hasBackdrop && (
            <div className="details-hero relative h-72 md:h-96 overflow-hidden">
              <LazyImg src={`${IMG_ORIGINAL}${selectedItem.backdrop_path}`} className="w-full h-full object-cover" />
              <div className="details-hero-overlay absolute inset-0"></div>
              <div className="details-hero-content">
                {renderHeroHead('details-hero-head-in-hero')}
              </div>
            </div>
          )}

          <div className="details-content p-6 md:p-10 space-y-6 md:space-y-7 relative z-10">
            {!hasBackdrop && renderHeroHead('details-hero-head-flat')}

            <div className={`details-tabs-wrap ${hasBackdrop ? 'hero-tight' : ''}`}>
              <div className="details-tabs" role="tablist" aria-label="Details sections">
                {tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeSection === tab.id} className={`details-tab ${activeSection === tab.id ? 'active' : ''}`} onClick={() => setActiveSection(tab.id)}>{tab.label}</button>)}
              </div>
            </div>

            <div className="details-tab-panel">
              {activeSection === 'overview' && renderOverview()}
              {activeSection === 'seasons' && renderSeasons()}
              {activeSection === 'actors' && renderActors()}
              {activeSection === 'crew' && renderCrew()}
              {activeSection === 'trailer' && renderTrailer()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

