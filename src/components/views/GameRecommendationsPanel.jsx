import React from 'react';
import { LazyImg } from '../ui.jsx';
import { normalizeRawgGame, rawgFetchJson } from '../../services/rawg.js';

export default function GameRecommendationsPanel({ library, getLibraryEntry, onCardClick, openQuickActions, STATUS_BADGE_CONFIG, t }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    const games = library.filter((item) => item.mediaType === 'game');
    const favoriteGames = games.filter((item) => item.rating >= 7 || ['playing', 'completed'].includes(item.status));
    const genreCounts = new Map();
    const platformCounts = new Map();
    favoriteGames.forEach((game) => (game.genres || []).forEach((genre) => {
      if (genre?.slug) genreCounts.set(genre.slug, (genreCounts.get(genre.slug) || 0) + 1);
    }));
    favoriteGames.forEach((game) => (game.parentPlatforms || []).forEach((platform) => {
      if (platform?.id) platformCounts.set(platform.id, (platformCounts.get(platform.id) || 0) + 1);
    }));
    const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([slug]) => slug).join(',');
    const parentPlatforms = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id).join(',');
    const ownedIds = new Set(games.map((game) => Number(game.id)));
    setLoading(true);
    setError('');
    rawgFetchJson('games', {
      page_size: 30,
      ordering: '-rating',
      exclude_additions: true,
      ...(genres ? { genres } : {}),
      ...(parentPlatforms ? { parent_platforms: parentPlatforms } : {}),
    }, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setItems((payload?.results || []).map(normalizeRawgGame).filter((game) => game && !ownedIds.has(game.id)).slice(0, 20));
      })
      .catch((fetchError) => {
        if (fetchError?.name !== 'AbortError') setError(fetchError?.message || t.gameRecommendationsEmpty);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [library, revision, t.gameRecommendationsEmpty]);

  return (
    <div className="space-y-5">
      <div className="glass app-panel p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div><p className="text-sm font-black">{t.gameRecommendations}</p><p className="text-xs opacity-65 mt-1">{t.gameRecommendationsHint}</p></div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest disabled:opacity-60">{t.collectionsForYouRefresh}</button>
      </div>
      {error && <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}
      {loading && items.length === 0 && <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="media-card"><div className="media-poster catalog-skeleton-poster"><div className="catalog-skeleton-shimmer" /></div></div>)}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((game, index) => {
          const entry = getLibraryEntry('game', game.id);
          const badge = entry && STATUS_BADGE_CONFIG[entry.status];
          return (
            <div key={game.id} className="media-card group card-stagger" style={{ '--stagger-i': index }}>
              <div className="media-poster cursor-pointer" onClick={() => onCardClick(game)}>
                <LazyImg src={game.posterUrl || '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]" alt={game.name} />
                {badge && <div className="media-pill absolute top-2 right-2 text-white uppercase flex items-center gap-1 shadow-lg" style={{ background: badge.bg }}><span>{badge.icon}</span><span>{entry.status === 'completed' ? t.gameCompleted : badge.label}</span></div>}
                <button type="button" onClick={(event) => { event.stopPropagation(); openQuickActions(game, event.clientX, event.clientY); }} className="quick-action-trigger" aria-label={t.quickActions}><svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></button>
                <div className="card-info-overlay">{game.metacritic > 0 && <p className="text-xs font-bold">MC {game.metacritic}</p>}<p className="text-[10px] opacity-70">{game.release_date?.slice(0, 4)}</p></div>
              </div>
              <h3 className="media-title line-clamp-2">{game.name}</h3>
              <p className="media-meta">{game.release_date?.slice(0, 4)}</p>
            </div>
          );
        })}
      </div>
      {!loading && !error && items.length === 0 && <div className="empty-state"><div className="empty-state-icon">🎮</div><p className="empty-state-title">{t.gameRecommendationsEmpty}</p></div>}
      <a href="https://rawg.io" target="_blank" rel="noreferrer" className="inline-flex text-xs font-bold text-blue-300 underline underline-offset-4">{t.rawgAttribution}</a>
    </div>
  );
}
