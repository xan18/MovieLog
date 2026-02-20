import { useCallback } from 'react';
import { isReleasedItem } from '../utils/releaseUtils.js';
import { buildWatchedEpisodes, uniqSort } from '../utils/appUtils.js';

const countWatchedEpisodes = (watchedEpisodes = {}) =>
  Object.values(watchedEpisodes).reduce((sum, episodes) => sum + (Array.isArray(episodes) ? episodes.length : 0), 0);

const getTotalEpisodes = (entry, contextItem = null) => {
  const candidates = [contextItem, entry].filter(Boolean);

  for (const candidate of candidates) {
    const totalFromNumber = Number(candidate?.number_of_episodes);
    if (Number.isFinite(totalFromNumber) && totalFromNumber > 0) return totalFromNumber;
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate?.seasons)) continue;
    const totalFromSeasons = candidate.seasons.reduce((sum, season) => {
      if (!season || Number(season.season_number) <= 0) return sum;
      return sum + (Number(season.episode_count) || 0);
    }, 0);
    if (totalFromSeasons > 0) return totalFromSeasons;
  }

  return 0;
};

const resolveTvProgressStatus = (currentStatus, watchedEpisodes, totalEpisodes) => {
  const watchedCount = countWatchedEpisodes(watchedEpisodes);
  const canAutoComplete = currentStatus === 'watching' || currentStatus === 'planned';

  if (canAutoComplete && totalEpisodes > 0 && watchedCount >= totalEpisodes) {
    return 'completed';
  }
  if (currentStatus === 'planned' && watchedCount > 0) {
    return 'watching';
  }
  if (currentStatus === 'completed') {
    if (totalEpisodes > 0 && watchedCount < totalEpisodes) return 'watching';
    if (totalEpisodes === 0 && watchedCount === 0) return 'watching';
  }

  return currentStatus;
};

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
    const newEntry = {
      ...item, status, rating: 0, dateAdded: Date.now(),
      ...(item.mediaType === 'tv' && { watchedEpisodes: {}, seasonRatings: {}, episodeRuntimes: {} })
    };
    setLibrary(prev => [...prev, newEntry]);
    return newEntry;
  }, [library, setLibrary]);

  const addToLibrary = useCallback((item, status, ratingVal = 0, closeDetails = true) => {
    if (item.mediaType === 'movie' && status === 'completed' && !isReleasedItem(item)) return;
    const existing = getLibraryEntry(item.mediaType, item.id);
    if (existing) {
      setLibrary(prev =>
        prev.map(x => {
          if (x.mediaType === item.mediaType && x.id === item.id) {
            if (x.mediaType === 'tv') {
              if (status === 'planned') {
                return { ...x, status, watchedEpisodes: {}, seasonRatings: {}, episodeRuntimes: {}, rating: 0 };
              }
              return { ...x, status };
            }
            return { ...x, status, rating: ratingVal || x.rating };
          }
          return x;
        })
      );
    } else {
      const newEntry = {
        ...item, status,
        rating: item.mediaType === 'movie' ? (ratingVal || 0) : 0,
        dateAdded: Date.now(),
        ...(item.mediaType === 'tv' && {
          watchedEpisodes: status === 'completed' && item.seasons
            ? buildWatchedEpisodes(item.seasons)
            : {},
          seasonRatings: {},
          episodeRuntimes: {}
        })
      };
      setLibrary(prev => [...prev, newEntry]);
    }
    if (closeDetails) setSelectedItem(null);
  }, [getLibraryEntry, setLibrary, setSelectedItem]);

  const setTvStatus = useCallback((tvId, newStatus, fullItem = null) => {
    setLibrary(prev =>
      prev.map(x => {
        if (x.mediaType === 'tv' && x.id === tvId) {
          if (newStatus === 'completed' && !isReleasedItem(fullItem || x)) return x;
          const updated = { ...x, status: newStatus };
          if (newStatus === 'completed' && fullItem?.seasons) {
            updated.watchedEpisodes = buildWatchedEpisodes(fullItem.seasons);
          }
          if (newStatus === 'planned') {
            updated.watchedEpisodes = {};
            updated.seasonRatings = {};
            updated.episodeRuntimes = {};
            updated.rating = 0;
          }
          return updated;
        }
        return x;
      })
    );
  }, [setLibrary]);

  const toggleEpisodeWatched = useCallback((tvId, seasonNum, epNum, itemForContext = null) => {
    setLibrary(prev =>
      prev.map(x => {
        if (x.mediaType === 'tv' && x.id === tvId) {
          const w = { ...x.watchedEpisodes };
          const ctx = getTvContextItem(tvId, itemForContext);
          const totalEpisodes = getTotalEpisodes(x, ctx);
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
              const newStatus = resolveTvProgressStatus(x.status, w, totalEpisodes);
              return { ...x, watchedEpisodes: w, seasonRatings, rating: avgRating, status: newStatus };
            }
          } else {
            w[seasonNum] = uniqSort([...w[seasonNum], epNum]);
          }
          const newStatus = resolveTvProgressStatus(x.status, w, totalEpisodes);
          return { ...x, watchedEpisodes: w, status: newStatus };
        }
        return x;
      })
    );
  }, [getTvContextItem, setLibrary]);

  const toggleSeasonWatched = useCallback((tvId, seasonNum, episodeCount, airedEpisodes = null) => {
    setLibrary(prev =>
      prev.map(x => {
        if (x.mediaType === 'tv' && x.id === tvId) {
          const w = { ...x.watchedEpisodes };
          const ctx = getTvContextItem(tvId);
          const totalEpisodes = getTotalEpisodes(x, ctx);
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
            const newStatus = resolveTvProgressStatus(x.status, w, totalEpisodes);
            return { ...x, watchedEpisodes: w, seasonRatings, rating: avgRating, status: newStatus };
          } else {
            w[seasonNum] = uniqSort([...current, ...targetEps]);
          }
          const newStatus = resolveTvProgressStatus(x.status, w, totalEpisodes);
          return { ...x, watchedEpisodes: w, status: newStatus };
        }
        return x;
      })
    );
  }, [getTvContextItem, setLibrary]);

  const setSeasonRating = useCallback((tvId, seasonNum, ratingVal) => {
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
          const totalEpisodes = getTotalEpisodes(x, ctx);
          const newStatus = resolveTvProgressStatus(baseStatus, watchedEpisodes, totalEpisodes);
          return { ...x, seasonRatings, rating: avgRating, watchedEpisodes, status: newStatus };
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
        const totalEpisodes = getTotalEpisodes(si, si);
        const newEntry = {
          ...si,
          status: resolveTvProgressStatus('watching', watchedEpisodes, totalEpisodes),
          rating: 0,
          dateAdded: Date.now(),
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
        const totalEpisodes = getTotalEpisodes(si, si);
        const newEntry = {
          ...si,
          status: resolveTvProgressStatus('watching', watchedEpisodes, totalEpisodes),
          rating: 0,
          dateAdded: Date.now(),
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
