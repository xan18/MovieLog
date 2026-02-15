import React from 'react';
import { isReleasedItem } from '../../utils/releaseUtils.js';

export default function QuickActionsMenu({
  quickActions,
  setQuickActions,
  t,
  TV_STATUSES,
  getLibraryEntry,
  applyQuickMovieAction,
  applyQuickTvAction,
  removeFromLibrary,
}) {
  if (!quickActions) return null;

  return (
    <div className="fixed inset-0 z-[210] popup-enter" onClick={() => setQuickActions(null)}>
      <div
        className="fixed glass app-panel-padded p-3 w-60 shadow-2xl"
        style={{ left: quickActions.x, top: quickActions.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 px-2">{t.quickActions}</p>
        {quickActions.item.mediaType === 'movie' ? (
          <div className="space-y-2">
            <button
              onClick={() => applyQuickMovieAction(quickActions.item, 'planned')}
              className="w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wide"
            >
              {t.toPlans}
            </button>
            <button
              disabled={!isReleasedItem(quickActions.item)}
              onClick={() => applyQuickMovieAction(quickActions.item, 'completed')}
              className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wide ${isReleasedItem(quickActions.item) ? 'bg-white/5 hover:bg-white/10 border-white/10' : 'bg-white/5 border-white/5 text-white/40 cursor-not-allowed'}`}
            >
              {t.alreadyWatched}
            </button>
            {getLibraryEntry('movie', quickActions.item.id) && (
              <button
                onClick={() => applyQuickMovieAction(quickActions.item, 'remove')}
                className="w-full text-left px-3 py-2 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-xs font-bold uppercase tracking-wide"
              >
                {t.delete}
              </button>
            )}
            {!isReleasedItem(quickActions.item) && (
              <p className="text-[10px] px-1 opacity-60">{t.unreleasedLocked}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {TV_STATUSES.map(s => (
              <button
                key={s.id}
                disabled={s.id === 'completed' && !isReleasedItem(quickActions.item)}
                onClick={() => applyQuickTvAction(quickActions.item, s.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wide ${s.id === 'completed' && !isReleasedItem(quickActions.item) ? 'bg-white/5 border-white/5 text-white/40 cursor-not-allowed' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}
              >
                {s.label}
              </button>
            ))}
            {getLibraryEntry('tv', quickActions.item.id) && (
              <button
                onClick={() => { removeFromLibrary('tv', quickActions.item.id); setQuickActions(null); }}
                className="w-full text-left px-3 py-2 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-xs font-bold uppercase tracking-wide"
              >
                {t.delete}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
