import { useCallback } from 'react';
import { isReleasedItem } from '../utils/releaseUtils.js';
import { uniqSort } from '../utils/appUtils.js';
import {
  buildTvWatchedEpisodesForCompletion,
  resolveTvProgressStatus,
} from '../utils/tvStatusUtils.js';

const applyModificationTimestamp = (entry, changedAt) => ({
  ...entry,
  dateAdded: entry?.dateAdded || changedAt,
  dateModified: changedAt,
});

export function useLibrary({ library, setLibrary, setSelectedItem, selectedItemRef }) {

  const getTvContextItem = useCallback((tvId, explicitContext = null) => {
    if (explicitContext?.mediaType === 'tv' && explicitContext.id === tvId) return explicitContext;
    const selected = selectedItemRef.current;
    if (selected?.mediaType === 'tv' && selected.id === tvId) return selected;
    return null;
  }, [selectedItemRef]);

  const getLibraryEntry = useCallback((mType, itemId) =>
    library.find(x => x.mediaType === mType && x.id === itemId),
  [library]);

  const ensureInLibrary = useCallback((item, status) => {
    const existing = library.find(x => x.mediaType === item.mediaType && x.id === item.id);
    if (existing) return existing;
    const changedAt = Date.now();
    const newEntry = {
      ...item, status, rating: 0, dateAdded: changedAt, dateModified: changedAt,
      ...(item.mediaType === 'tv' && { watchedEpisodes: {}, seasonRatings: {}, episodeRuntimes: {} })
    };
    setLibrary(prev => [...prev, newEntry]);
    return newEntry;
  }, [library, setLibrary]);

  const addToLibrary = useCallback((item, status, ratingVal = 0, closeDetails = true) => {
    if (item.mediaType === 'movie' && status === 'completed' && !isReleasedItem(item)) return;
    const existing = getLibraryEntry(item.mediaType, item.id);
    if (existing) {
      const changedAt = Date.now();
      setLibrary(prev =>
        prev.map(x => {
          if (x.mediaType === item.mediaType && x.id === item.id) {
            if (x.mediaType === 'tv') {
              if (status === 'planned') {
                return applyModificationTimestamp({
                  ...x,
                  status,
                  watchedEpisodes: {},
                  seasonRatings: {},
                  episodeRuntimes: {},
                  rating: 0,
                }, changedAt);
              }
              if (status === 'completed') {
                const completionWatchedEpisodes = buildTvWatchedEpisodesForCompletion(item, x);
                const nextWatchedEpisodes = Object.keys(completionWatchedEpisodes).length > 0
                  ? completionWatchedEpisodes
                  : (x.watchedEpisodes || {});
                const nextStatus = resolveTvProgressStatus('completed', nextWatchedEpisodes, item, x);
                return applyModificationTimestamp({
                  ...x,
                  status: nextStatus,
                  watchedEpisodes: nextWatchedEpisodes,
                }, changedAt);
              }
              return applyModificationTimestamp({ ...x, status }, changedAt);
            }
            if (status === 'planned') {
              return applyModificationTimestamp({ ...x, status, rating: 0 }, changedAt);
            }
            return applyModificationTimestamp({ ...x, status, rating: ratingVal || x.rating }, changedAt);
          }
          return x;
        })
      );
    } else {
      const changedAt = Date.now();
      const completionWatchedEpisodes = item.mediaType === 'tv' && status === 'completed'
        ? buildTvWatchedEpisodesForCompletion(item)
        : {};
      const resolvedTvStatus = item.mediaType === 'tv'
        ? resolveTvProgressStatus(status, completionWatchedEpisodes, item)
        : status;
      const newEntry = {
        ...item,
        status: item.mediaType === 'tv' ? resolvedTvStatus : status,
        rating: item.mediaType === 'movie' ? (ratingVal || 0) : 0,
        dateAdded: changedAt,
        dateModified: changedAt,
        ...(item.mediaType === 'tv' && {
          watchedEpisodes: completionWatchedEpisodes,
          seasonRatings: {},
          episodeRuntimes: {}
        })
      };
      setLibrary(prev => [...prev, newEntry]);
    }
    if (closeDetails) setSelectedItem(null);
  }, [getLibraryEntry, setLibrary, setSelectedItem]);

  const setTvStatus = useCallback((tvId, newStatus, fullItem = null) => {
    const changedAt = Date.now();
    setLibrary(prev =>
      prev.map(x => {
        if (x.mediaType === 'tv' && x.id === tvId) {
          if (newStatus === 'completed' && !isReleasedItem(fullItem || x)) return x;
          const updated = { ...x, status: newStatus };

          if (newStatus === 'completed') {
            const completionWatchedEpisodes = buildTvWatchedEpisodesForCompletion(fullItem, x);
            if (Object.keys(completionWatchedEpisodes).length > 0) {
              updated.watchedEpisodes = completionWatchedEpisodes;
            }
          }
          if (newStatus === 'planned') {
            updated.watchedEpisodes = {};
            updated.seasonRatings = {};
            updated.episodeRuntimes = {};
            updated.rating = 0;
          }
          updated.status = resolveTvProgressStatus(updated.status, updated.watchedEpisodes || {}, fullItem, updated);
          return applyModificationTimestamp(updated, changedAt);
        }
        return x;
      })
    );
  }, [setLibrary]);

  const toggleEpisodeWatched = useCallback((tvId, seasonNum, epNum, itemForContext = null) => {
    const changedAt = Date.now();
    setLibrary(prev =>
      prev.map(x => {
        if (x.mediaType === 'tv' && x.id === tvId) {
          const w = { ...x.watchedEpisodes };
          const ctx = getTvContextItem(tvId, itemForContext);
          if (!w[seasonNum]) w[seasonNum] = [];
          const seasonEpCount = ctx?.seasons?.find(s => s.season_number === seasonNum)?.episode_count;
          const wasFullyWatched = w[seasonNum].length > 0 && seasonEpCount === w[seasonNum].length;

          if (w[seasonNum].includes(epNum)) {
            w[seasonNum] = w[seasonNum].filter(e => e !== epNum);
            if (wasFullyWatched) {
              const seasonRatings = { ...(x.seasonRatings || {}) };
              delete seasonRatings[seasonNum];
              const ratedSeasons = Object.values(seasonRatings);
              const avgRating = ratedSeasons.length > 0
                ? Math.round(ratedSeasons.reduce((sum, r) => sum + r, 0) / ratedSeasons.length)
                : 0;
              const newStatus = resolveTvProgressStatus(x.status, w, ctx, x);
              return applyModificationTimestamp({
                ...x,
                watchedEpisodes: w,
                seasonRatings,
                rating: avgRating,
                status: newStatus,
              }, changedAt);
            }
          } else {
            w[seasonNum] = uniqSort([...w[seasonNum], epNum]);
          }
          const newStatus = resolveTvProgressStatus(x.status, w, ctx, x);
          return applyModificationTimestamp({ ...x, watchedEpisodes: w, status: newStatus }, changedAt);
        }
        return x;
      })
    );
  }, [getTvContextItem, setLibrary]);

  const toggleSeasonWatched = useCallback((tvId, seasonNum, episodeCount, airedEpisodes = null) => {
    const changedAt = Date.now();
    setLibrary(prev =>
      prev.map(x => {
        if (x.mediaType === 'tv' && x.id === tvId) {
          const w = { ...x.watchedEpisodes };
          const ctx = getTvContextItem(tvId);
          const targetEps = airedEpisodes || Array.from({ length: episodeCount }, (_, i) => i + 1);
          const current = w[seasonNum] || [];
          const allTargetWatched = targetEps.length > 0 && targetEps.every(ep => current.includes(ep));

          if (allTargetWatched) {
            w[seasonNum] = [];
            const seasonRatings = { ...(x.seasonRatings || {}) };
            delete seasonRatings[seasonNum];
            const ratedSeasons = Object.values(seasonRatings);
            const avgRating = ratedSeasons.length > 0
              ? Math.round(ratedSeasons.reduce((sum, r) => sum + r, 0) / ratedSeasons.length)
              : 0;
            const newStatus = resolveTvProgressStatus(x.status, w, ctx, x);
            return applyModificationTimestamp({
              ...x,
              watchedEpisodes: w,
              seasonRatings,
              rating: avgRating,
              status: newStatus,
            }, changedAt);
          } else {
            w[seasonNum] = uniqSort([...current, ...targetEps]);
          }
          const newStatus = resolveTvProgressStatus(x.status, w, ctx, x);
          return applyModificationTimestamp({ ...x, watchedEpisodes: w, status: newStatus }, changedAt);
        }
        return x;
      })
    );
  }, [getTvContextItem, setLibrary]);

  const setSeasonRating = useCallback((tvId, seasonNum, ratingVal) => {
    const changedAt = Date.now();
    setLibrary(prev =>
      prev.map(x => {
        if (x.mediaType === 'tv' && x.id === tvId) {
          const seasonRatings = { ...(x.seasonRatings || {}) };
          const watchedEpisodes = { ...(x.watchedEpisodes || {}) };
          if (ratingVal === 0) {
            delete seasonRatings[seasonNum];
          } else {
            seasonRatings[seasonNum] = ratingVal;
            const season = selectedItemRef.current?.seasons?.find(s => s.season_number === seasonNum);
            if (season) {
              watchedEpisodes[seasonNum] = Array.from({ length: season.episode_count }, (_, i) => i + 1);
            }
          }
          const ratedSeasons = Object.values(seasonRatings);
          const avgRating = ratedSeasons.length > 0
            ? Math.round(ratedSeasons.reduce((sum, r) => sum + r, 0) / ratedSeasons.length)
            : 0;
          const baseStatus = (ratingVal > 0 && x.status === 'planned') ? 'watching' : x.status;
          const ctx = getTvContextItem(tvId);
          const newStatus = resolveTvProgressStatus(baseStatus, watchedEpisodes, ctx, x);
          return applyModificationTimestamp({
            ...x,
            seasonRatings,
            rating: avgRating,
            watchedEpisodes,
            status: newStatus,
          }, changedAt);
        }
        return x;
      })
    );
  }, [getTvContextItem, setLibrary, selectedItemRef]);

  const removeFromLibrary = useCallback((mType, itemId) => {
    setLibrary(prev => prev.filter(x => !(x.mediaType === mType && x.id === itemId)));
  }, [setLibrary]);

  const handleEpisodeClick = useCallback((tvId, seasonNum, epNum) => {
    const libEntry = library.find(x => x.mediaType === 'tv' && x.id === tvId);
    if (libEntry) {
      toggleEpisodeWatched(tvId, seasonNum, epNum);
    } else {
      setLibrary(prev => {
        const si = selectedItemRef.current;
        const watchedEpisodes = { [seasonNum]: [epNum] };
        const changedAt = Date.now();
        const newEntry = {
          ...si,
          status: resolveTvProgressStatus('watching', watchedEpisodes, si),
          rating: 0,
          dateAdded: changedAt,
          dateModified: changedAt,
          watchedEpisodes,
          seasonRatings: {},
          episodeRuntimes: {}
        };
        return [...prev, newEntry];
      });
    }
  }, [library, toggleEpisodeWatched, setLibrary, selectedItemRef]);

  const handleSeasonToggle = useCallback((tvId, seasonNum, episodeCount, airedEps) => {
    const libEntry = library.find(x => x.mediaType === 'tv' && x.id === tvId);
    if (libEntry) {
      toggleSeasonWatched(tvId, seasonNum, episodeCount, airedEps);
    } else {
      setLibrary(prev => {
        const si = selectedItemRef.current;
        const watchedEpisodes = { [seasonNum]: uniqSort([...airedEps]) };
        const changedAt = Date.now();
        const newEntry = {
          ...si,
          status: resolveTvProgressStatus('watching', watchedEpisodes, si),
          rating: 0,
          dateAdded: changedAt,
          dateModified: changedAt,
          watchedEpisodes,
          seasonRatings: {},
          episodeRuntimes: {}
        };
        return [...prev, newEntry];
      });
    }
  }, [library, toggleSeasonWatched, setLibrary, selectedItemRef]);

  return {
    getLibraryEntry,
    ensureInLibrary,
    addToLibrary,
    setTvStatus,
    toggleEpisodeWatched,
    toggleSeasonWatched,
    setSeasonRating,
    removeFromLibrary,
    handleEpisodeClick,
    handleSeasonToggle,
  };
}
