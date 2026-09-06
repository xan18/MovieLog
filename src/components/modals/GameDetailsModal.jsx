import React, { useEffect, useMemo, useState } from 'react';
import { LazyImg } from '../ui.jsx';
import { normalizeRawgGame, rawgFetchJson } from '../../services/rawg.js';

export default function GameDetailsModal({
  game,
  onClose,
  t,
  GAME_STATUSES,
  getLibraryEntry,
  setGameStatus,
  setGameRating,
  removeFromLibrary,
  triggerAddPulse,
}) {
  const [details, setDetails] = useState(game);
  const [loading, setLoading] = useState(true);
  const libraryEntry = getLibraryEntry('game', game.id);
  const [platform, setPlatform] = useState(libraryEntry?.platform || '');
  const [platformError, setPlatformError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setDetails(game);
    setLoading(true);
    rawgFetchJson(`games/${game.id}`, {}, { signal: controller.signal })
      .then((payload) => {
        const normalized = normalizeRawgGame(payload);
        if (!controller.signal.aborted && normalized) setDetails(normalized);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.error('Failed to load game details', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [game]);

  useEffect(() => {
    setPlatform(libraryEntry?.platform || '');
  }, [libraryEntry?.platform]);

  const platformOptions = useMemo(() => {
    const source = details?.parentPlatforms?.length ? details.parentPlatforms : details?.platforms;
    return Array.from(new Set((source || []).map((item) => item?.name).filter(Boolean)));
  }, [details]);

  const applyStatus = (status) => {
    if (!platform) {
      setPlatformError(true);
      return;
    }
    setGameStatus(details, status, platform);
    triggerAddPulse(`game-${details.id}`);
    setPlatformError(false);
  };

  const releaseYear = details?.release_date ? new Date(details.release_date).getFullYear() : '';
  const description = details?.description_raw || '';

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto modal-overlay details-overlay modal-enter" onClick={onClose}>
      <div className="min-h-screen px-4 py-10 md:py-14">
        <div className="details-surface relative max-w-5xl mx-auto rounded-[2.2rem] overflow-hidden" onClick={(event) => event.stopPropagation()}>
          <button className="details-close absolute top-6 right-6 z-20" onClick={onClose} title={t.close} aria-label={t.close}>
            <svg className="details-close-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" /></svg>
          </button>

          {details?.posterUrl && (
            <div className="details-hero relative h-72 md:h-96 overflow-hidden">
              <LazyImg src={details.posterUrl} className="w-full h-full object-cover" alt="" />
              <div className="details-hero-overlay absolute inset-0" />
            </div>
          )}

          <div className="details-content p-6 md:p-10 space-y-7 relative z-10">
            <div className="details-hero-head details-hero-head-flat">
              <LazyImg src={details?.posterUrl || '/poster-placeholder.svg'} className="details-hero-poster" alt={details?.name} />
              <div className="details-hero-copy">
                <h2 className="details-hero-title">{details?.name}</h2>
                <div className="details-hero-stats">
                  {releaseYear && <span className="details-hero-stat">{releaseYear}</span>}
                  {details?.metacritic > 0 && <span className="details-hero-stat highlighted">MC {details.metacritic}</span>}
                  {details?.rawgRating > 0 && <span className="details-hero-stat highlighted">★ {details.rawgRating.toFixed(1)}/5</span>}
                  {details?.playtime > 0 && <span className="details-hero-stat">{details.playtime} {t.gameHours}</span>}
                </div>
                <div className="details-hero-genres">
                  {(details?.genres || []).map((genre) => <span key={genre.id} className="details-hero-genre">{genre.name}</span>)}
                </div>
              </div>
            </div>

            {loading && <p className="text-xs font-bold uppercase tracking-widest opacity-60">{t.loading}</p>}

            <section className="glass app-panel p-5 md:p-6 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{t.gameSelectPlatform}</p>
              <select
                value={platform}
                onChange={(event) => { setPlatform(event.target.value); setPlatformError(false); }}
                className="app-input w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold"
              >
                <option value="">{t.gameSelectPlatform}</option>
                {platformOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              {platformError && <p className="text-xs font-bold text-red-400">{t.gamePlatformRequired}</p>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {GAME_STATUSES.map((status) => (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => applyStatus(status.id)}
                    className={`px-3 py-3 rounded-xl border text-xs font-black uppercase tracking-wide transition-colors ${libraryEntry?.status === status.id ? 'bg-blue-500/30 border-blue-400/60' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
              {libraryEntry && (
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <span className="text-xs font-bold opacity-60">{t.yourRating}</span>
                  <select
                    value={libraryEntry.rating || 0}
                    onChange={(event) => setGameRating(game.id, Number(event.target.value))}
                    className="app-input bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-black"
                  >
                    <option value="0">—</option>
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => <option key={rating} value={rating}>{rating}/10</option>)}
                  </select>
                  <button type="button" onClick={() => { removeFromLibrary('game', game.id); onClose(); }} className="ml-auto px-4 py-2 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-xs font-bold uppercase tracking-wide">{t.delete}</button>
                </div>
              )}
            </section>

            {description && (
              <section>
                <p className="accent-text text-[10px] font-black uppercase tracking-widest mb-2 italic">{t.gameDetails}</p>
                <p className="text-sm leading-relaxed opacity-80 whitespace-pre-line">{description}</p>
              </section>
            )}

            <a href="https://rawg.io" target="_blank" rel="noreferrer" className="inline-flex text-xs font-bold text-blue-300 hover:text-blue-200 underline underline-offset-4">{t.rawgAttribution}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
