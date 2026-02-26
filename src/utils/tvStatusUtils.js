const ENDED_TV_STATUSES = new Set(['Ended', 'Canceled', 'Cancelled']);
const ONGOING_TV_STATUSES = new Set(['Returning Series', 'In Production', 'Planned', 'Pilot']);

const toCandidateList = (candidates) => {
  const list = [];
  candidates.forEach((candidate) => {
    if (!candidate) return;
    if (Array.isArray(candidate)) {
      candidate.forEach((nested) => {
        if (nested) list.push(nested);
      });
      return;
    }
    list.push(candidate);
  });
  return list;
};

const getSeasonsFromCandidates = (candidates) => {
  for (const candidate of candidates) {
    if (!Array.isArray(candidate?.seasons)) continue;
    return candidate.seasons;
  }
  return null;
};

const buildFullWatchedEpisodesFromSeasons = (seasons) => {
  if (!Array.isArray(seasons)) return {};
  return seasons.reduce((acc, season) => {
    const seasonNumber = Number(season?.season_number);
    const episodeCount = Number(season?.episode_count);
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) return acc;
    if (!Number.isInteger(episodeCount) || episodeCount <= 0) return acc;
    acc[seasonNumber] = Array.from({ length: episodeCount }, (_, idx) => idx + 1);
    return acc;
  }, {});
};

const buildWatchedEpisodesUpToMarker = (seasons, marker) => {
  const markerSeason = Number(marker?.season_number);
  const markerEpisode = Number(marker?.episode_number);
  if (!Number.isInteger(markerSeason) || markerSeason <= 0) return {};
  if (!Number.isInteger(markerEpisode) || markerEpisode <= 0) return {};

  return seasons.reduce((acc, season) => {
    const seasonNumber = Number(season?.season_number);
    const episodeCount = Number(season?.episode_count);
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) return acc;
    if (!Number.isInteger(episodeCount) || episodeCount <= 0) return acc;

    if (seasonNumber < markerSeason) {
      acc[seasonNumber] = Array.from({ length: episodeCount }, (_, idx) => idx + 1);
      return acc;
    }
    if (seasonNumber === markerSeason) {
      const cappedCount = Math.min(episodeCount, markerEpisode);
      if (cappedCount > 0) {
        acc[seasonNumber] = Array.from({ length: cappedCount }, (_, idx) => idx + 1);
      }
    }
    return acc;
  }, {});
};

const getLifecycleState = (candidates) => {
  const statusValue = candidates
    .map((candidate) => String(candidate?.status || '').trim())
    .find(Boolean) || '';

  const hasNextEpisode = candidates.some((candidate) => Boolean(candidate?.next_episode_to_air));
  const inProduction = candidates.some((candidate) => Boolean(candidate?.in_production));
  const isEndedSeries = ENDED_TV_STATUSES.has(statusValue);
  const isOngoingSeries = !isEndedSeries && (hasNextEpisode || inProduction || ONGOING_TV_STATUSES.has(statusValue));

  return {
    statusValue,
    isEndedSeries,
    isOngoingSeries,
  };
};

const getAiredEpisodeMarker = (candidates) => {
  for (const candidate of candidates) {
    const episode = candidate?.last_episode_to_air;
    if (!episode || typeof episode !== 'object') continue;
    const seasonNumber = Number(episode.season_number);
    const episodeNumber = Number(episode.episode_number);
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) continue;
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) continue;
    return {
      season_number: seasonNumber,
      episode_number: episodeNumber,
    };
  }
  return null;
};

const estimateAiredEpisodesFromMarkerAndSeasons = (marker, seasons) => {
  if (!marker || !Array.isArray(seasons)) return 0;

  let total = 0;
  for (const season of seasons) {
    const seasonNumber = Number(season?.season_number);
    const episodeCount = Number(season?.episode_count);
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) continue;
    if (!Number.isInteger(episodeCount) || episodeCount <= 0) continue;

    if (seasonNumber < marker.season_number) {
      total += episodeCount;
      continue;
    }

    if (seasonNumber === marker.season_number) {
      total += Math.min(episodeCount, marker.episode_number);
    }
  }

  return total;
};

export const countWatchedEpisodes = (watchedEpisodes = {}) =>
  Object.values(watchedEpisodes).reduce(
    (sum, episodes) => sum + (Array.isArray(episodes) ? episodes.length : 0),
    0
  );

export const getTvTotalEpisodes = (...rawCandidates) => {
  const candidates = toCandidateList(rawCandidates);

  for (const candidate of candidates) {
    const totalFromNumber = Number(candidate?.number_of_episodes);
    if (Number.isFinite(totalFromNumber) && totalFromNumber > 0) return totalFromNumber;
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate?.seasons)) continue;
    const totalFromSeasons = candidate.seasons.reduce((sum, season) => {
      const seasonNumber = Number(season?.season_number);
      if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) return sum;
      return sum + (Number(season?.episode_count) || 0);
    }, 0);
    if (totalFromSeasons > 0) return totalFromSeasons;
  }

  return 0;
};

export const getTvProgressSnapshot = (watchedEpisodes = {}, ...rawCandidates) => {
  const candidates = toCandidateList(rawCandidates);
  const watchedCount = countWatchedEpisodes(watchedEpisodes);
  const totalEpisodes = getTvTotalEpisodes(...candidates);
  const lifecycle = getLifecycleState(candidates);
  const seasons = getSeasonsFromCandidates(candidates);
  const airedMarker = getAiredEpisodeMarker(candidates);

  const airedEpisodesFromMarker = estimateAiredEpisodesFromMarkerAndSeasons(airedMarker, seasons);
  let airedEpisodes = airedEpisodesFromMarker;

  if (airedEpisodes <= 0) {
    if (lifecycle.isEndedSeries) airedEpisodes = totalEpisodes;
    else if (totalEpisodes > 0 && !lifecycle.isOngoingSeries) airedEpisodes = totalEpisodes;
    else if (totalEpisodes > 0) airedEpisodes = totalEpisodes;
  }

  const targetEpisodes = lifecycle.isEndedSeries
    ? totalEpisodes
    : (lifecycle.isOngoingSeries ? airedEpisodes : totalEpisodes);

  const safeTargetEpisodes = targetEpisodes > 0 ? targetEpisodes : 0;
  const remainingToTarget = safeTargetEpisodes > 0
    ? Math.max(0, safeTargetEpisodes - watchedCount)
    : 0;
  const isWaitingForNewEpisodes = (
    lifecycle.isOngoingSeries
    && airedEpisodes > 0
    && watchedCount >= airedEpisodes
  );
  const isCompletedByProgress = (
    lifecycle.isEndedSeries
    && totalEpisodes > 0
    && watchedCount >= totalEpisodes
  );

  return {
    watchedCount,
    totalEpisodes,
    airedEpisodes,
    targetEpisodes: safeTargetEpisodes,
    remainingToTarget,
    isEndedSeries: lifecycle.isEndedSeries,
    isOngoingSeries: lifecycle.isOngoingSeries,
    isWaitingForNewEpisodes,
    isCompletedByProgress,
  };
};

export const resolveTvProgressStatus = (currentStatus, watchedEpisodes = {}, ...rawCandidates) => {
  let nextStatus = currentStatus === 'on_hold' ? 'watching' : currentStatus;
  const snapshot = getTvProgressSnapshot(watchedEpisodes, ...rawCandidates);

  if (nextStatus === 'planned' && snapshot.watchedCount > 0) {
    nextStatus = 'watching';
  }

  if (nextStatus === 'completed') {
    if (!snapshot.isEndedSeries) return 'watching';
    if (snapshot.totalEpisodes <= 0) return 'watching';
    if (snapshot.watchedCount < snapshot.totalEpisodes) return 'watching';
    return 'completed';
  }

  if ((nextStatus === 'watching' || nextStatus === 'planned') && snapshot.isCompletedByProgress) {
    return 'completed';
  }

  return nextStatus;
};

export const buildTvWatchedEpisodesForCompletion = (...rawCandidates) => {
  const candidates = toCandidateList(rawCandidates);
  const seasons = getSeasonsFromCandidates(candidates);
  if (!Array.isArray(seasons) || seasons.length === 0) return {};

  const lifecycle = getLifecycleState(candidates);
  if (lifecycle.isEndedSeries) {
    return buildFullWatchedEpisodesFromSeasons(seasons);
  }

  const airedMarker = getAiredEpisodeMarker(candidates);
  if (airedMarker) {
    return buildWatchedEpisodesUpToMarker(seasons, airedMarker);
  }

  return {};
};

export const getTvSeasonsSignature = (seasons) => {
  if (!Array.isArray(seasons)) return '';
  return seasons
    .filter((season) => season && Number(season.season_number) > 0)
    .map((season) => `${season.season_number}:${Number(season.episode_count) || 0}`)
    .join('|');
};

export const getEpisodeMarker = (episode) => {
  if (!episode || typeof episode !== 'object') return '';
  return [
    episode.id || '',
    episode.season_number || '',
    episode.episode_number || '',
    episode.air_date || '',
  ].join(':');
};
