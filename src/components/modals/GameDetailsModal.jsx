import React, { useEffect, useMemo, useState } from 'react';
import { LazyImg } from '../ui.jsx';
import { RATINGS } from '../../utils/appUtils.js';
import { normalizeRawgGame, rawgFetchJson } from '../../services/rawg.js';

export default function GameDetailsModal({
  game, onClose, onOpenGame, t, GAME_STATUSES, getLibraryEntry,
  setGameStatus, setGameRatingModal, setDeleteModal, triggerAddPulse,
}) {
  const [details, setDetails] = useState(game);
  const [seriesGames, setSeriesGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('');
  const [platformError, setPlatformError] = useState(false);
  const libraryEntry = getLibraryEntry('game', game.id);

  useEffect(() => {
    const controller = new AbortController();
    setDetails(game);
    setSeriesGames([]);
    setLoading(true);
    Promise.allSettled([
      rawgFetchJson(`games/${game.id}`, {}, { signal: controller.signal }),
      rawgFetchJson(`games/${game.id}/game-series`, { page_size: 40 }, { signal: controller.signal }),
    ]).then(([detailResult, seriesResult]) => {
      if (controller.signal.aborted) return;
      if (detailResult.status === 'fulfilled') {
        const normalized = normalizeRawgGame(detailResult.value);
        if (normalized) setDetails(normalized);
      }
      if (seriesResult.status === 'fulfilled') {
        setSeriesGames((seriesResult.value?.results || []).map(normalizeRawgGame).filter(Boolean));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [game]);

  useEffect(() => {
    setPlatform(libraryEntry?.platform || '');
    setPlatformError(false);
  }, [game.id, libraryEntry?.platform]);

  const platformOptions = useMemo(() => {
    const source = details?.parentPlatforms?.length ? details.parentPlatforms : details?.platforms;
    return Array.from(new Set((source || []).map((item) => item?.name).filter(Boolean)));
  }, [details]);

  const franchiseGames = useMemo(() => {
    const byId = new Map([[Number(details.id), details]]);
    seriesGames.forEach((item) => byId.set(Number(item.id), item));
    return [...byId.values()].sort((a, b) => String(a.release_date || '9999').localeCompare(String(b.release_date || '9999')));
  }, [details, seriesGames]);

  const applyStatus = (status) => {
    if (status !== 'planned' && !platform) {
      setPlatformError(true);
      return;
    }
    setGameStatus(details, status, platform);
    triggerAddPulse(`game-${details.id}`);
    setPlatformError(false);
    if (status === 'completed') {
      setGameRatingModal({ gameId: details.id, currentRating: libraryEntry?.rating || 0, item: details });
    }
  };

  const releaseYear = details?.release_date ? new Date(details.release_date).getFullYear() : '';
  const description = details?.description_raw || '';
  const hasBackdrop = Boolean(details?.posterUrl);

  const renderHeroHead = (extraClass = '') => (
    <div className={`details-hero-head ${extraClass}`.trim()}>
      <LazyImg src={details?.posterUrl || '/poster-placeholder.svg'} className="details-hero-poster" alt={details?.name} />
      <div className="details-hero-copy">
        <h2 className="details-hero-title">{details?.name}</h2>
        <div className="details-hero-stats">
          {releaseYear && <span className="details-hero-stat">{releaseYear}</span>}
          {details?.rawgRating > 0 && <span className="details-hero-stat highlighted">★ {details.rawgRating.toFixed(1)}/5</span>}
          {details?.playtime > 0 && <span className="details-hero-stat">{details.playtime} {t.gameHours}</span>}
        </div>
        {(details?.genres || []).length > 0 && <div className="details-hero-genres">{details.genres.map((genre) => <span key={genre.id} className="details-hero-genre">{genre.name}</span>)}</div>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto modal-overlay details-overlay modal-enter" onClick={onClose}>
      <div className="min-h-screen px-4 py-10 md:py-14">
        <div className="details-surface relative max-w-5xl mx-auto rounded-[2.2rem] overflow-hidden" onClick={(event) => event.stopPropagation()}>
          <button className="details-close absolute top-6 right-6 z-20" onClick={onClose} title={t.close} aria-label={t.close}>
            <svg className="details-close-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" /></svg>
          </button>

          {hasBackdrop && <div className="details-hero relative h-72 md:h-96 overflow-hidden">
            <LazyImg src={details.posterUrl} className="w-full h-full object-cover" alt="" />
            <div className="details-hero-overlay absolute inset-0" />
            <div className="details-hero-content">{renderHeroHead('details-hero-head-in-hero')}</div>
          </div>}

          <div className="details-content p-6 md:p-10 space-y-6 md:space-y-7 relative z-10">
            {!hasBackdrop && renderHeroHead('details-hero-head-flat')}
            {loading && <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-widest opacity-80">{t.loading}</div>}
            <div className={`details-tabs-wrap ${hasBackdrop ? 'hero-tight' : ''}`}>
              <div className="details-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" className="details-tab active">{t.description}</button></div>
            </div>

            <div className="details-tab-panel space-y-6">
              {description && <section><p className="accent-text text-[10px] font-black uppercase tracking-widest mb-2 italic">{t.gameDetails}</p><p className="text-sm leading-relaxed opacity-80 whitespace-pre-line">{description}</p></section>}

              {franchiseGames.length > 1 && <section className="details-section franchise-section">
                <div className="franchise-header"><p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 italic">{t.gameSeriesTitles}</p></div>
                <div className="franchise-timeline themed-x-scroll"><div className="franchise-track">
                  {franchiseGames.map((item, index) => {
                    const isCurrent = item.id === details.id;
                    const year = item.release_date ? new Date(item.release_date).getFullYear() : null;
                    return <button key={item.id} type="button" disabled={isCurrent} onClick={() => onOpenGame(item)} className={`franchise-card ${isCurrent ? 'current' : ''}`} aria-current={isCurrent ? 'true' : 'false'}>
                      <span className="franchise-year-chip">{year || 'TBA'}</span><span className="franchise-order-chip">#{index + 1}</span>
                      <div className="franchise-poster-wrap"><LazyImg src={item.posterUrl || '/poster-placeholder.svg'} className="franchise-poster" alt={item.name} /><div className="franchise-poster-overlay"><p className="franchise-title line-clamp-2">{item.name}</p></div></div>
                      {isCurrent && <span className="franchise-current-tag">{t.gameSeriesCurrent}</span>}
                    </button>;
                  })}
                </div></div>
              </section>}

              <div className="details-actions p-7 md:p-8 text-center">
                <div className="mb-6">
                  {libraryEntry?.rating > 0 ? <div>
                    <p className="accent-text text-[10px] font-black uppercase tracking-widest mb-3 italic">{t.yourRating}</p>
                    <div className="flex justify-center gap-1 mb-4">{RATINGS.map((rating, index) => <span key={rating} className={`text-2xl star-animated ${Number(libraryEntry.rating) >= rating ? 'text-yellow-400' : 'text-slate-800'}`} style={{ '--star-i': index }}>★</span>)}</div>
                    <p className="text-sm font-medium text-yellow-400">{libraryEntry.rating}/10</p>
                  </div> : <p className="text-sm opacity-60 mb-4">{t.gameNotRatedYet}</p>}
                  <button type="button" onClick={() => setGameRatingModal({ gameId: details.id, currentRating: libraryEntry?.rating || 0, item: details })} className="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg bg-yellow-600 hover:bg-yellow-500">{libraryEntry?.rating > 0 ? t.changeRating : t.rateGame}</button>
                </div>

                <div className="mb-4 text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">{t.gameSelectPlatform}</p>
                  <select value={platform} onChange={(event) => { setPlatform(event.target.value); setPlatformError(false); }} className="app-input w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold">
                    <option value="">{t.gameSelectPlatform}</option>{platformOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  {platformError && <p className="text-xs font-bold text-red-400 mt-2">{t.gamePlatformRequired}</p>}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{GAME_STATUSES.map((status) => <button key={status.id} type="button" onClick={() => applyStatus(status.id)} className={`details-status-btn py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${libraryEntry?.status === status.id ? 'is-active' : ''}`}>{status.label}</button>)}</div>
                {libraryEntry && <button type="button" onClick={() => setDeleteModal({ mediaType: 'game', id: details.id, title: details.name })} className="w-full mt-4 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">{t.deleteFromLib}</button>}
              </div>
            </div>

            <a href="https://rawg.io" target="_blank" rel="noreferrer" className="inline-flex text-xs font-bold text-blue-300 hover:text-blue-200 underline underline-offset-4">{t.rawgAttribution}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
