import { useCallback, useEffect } from 'react';
import { tmdbFetchJson, tmdbFetchManyJson } from '../services/tmdb.js';
import {
  getEpisodeMarker,
  getTvSeasonsSignature,
  getTvTotalEpisodes,
  resolveTvProgressStatus,
} from '../utils/tvStatusUtils.js';

const PERSON_FILMOGRAPHY_SORT_FALLBACK = '0000-00-00';

const getPersonCreditDate = (item) => item?.release_date || item?.first_air_date || PERSON_FILMOGRAPHY_SORT_FALLBACK;

const normalizePersonRoleGroup = (credit, TMDB_LANG) => {
  const isRu = String(TMDB_LANG || '').toLowerCase().startsWith('ru');
  const creditType = credit?.creditType;
  const job = String(credit?.job || '').trim();
  const department = String(credit?.department || '').trim();

  if (creditType === 'cast') {
    return {
      key: 'acting',
      label: isRu ? 'Актёр' : 'Acting',
      order: 0,
    };
  }

  if (job === 'Director') {
    return {
      key: 'director',
      label: isRu ? 'Режиссёр' : 'Director',
      order: 1,
    };
  }

  if (/producer/i.test(job)) {
    return {
      key: 'producer',
      label: isRu ? 'Продюсер' : 'Producer',
      order: 2,
    };
  }

  if (job === 'Creator') {
    return {
      key: 'creator',
      label: isRu ? 'Создатель' : 'Creator',
      order: 3,
    };
  }

  if (/(writer|screenplay|story|novel|teleplay|adaptation)/i.test(job) || department === 'Writing') {
    return {
      key: 'writer',
      label: isRu ? 'Сценарист' : 'Writer',
      order: 4,
    };
  }

  if (department === 'Directing') {
    return {
      key: 'directing',
      label: isRu ? 'Постановка' : 'Directing',
      order: 5,
    };
  }

  if (department === 'Production') {
    return {
      key: 'production',
      label: isRu ? 'Производство' : 'Production',
      order: 6,
    };
  }

  if (department === 'Writing') {
    return {
      key: 'writing',
      label: isRu ? 'Сценарий' : 'Writing',
      order: 7,
    };
  }

  if (department === 'Camera') {
    return {
      key: 'camera',
      label: isRu ? 'Операторская работа' : 'Camera',
      order: 8,
    };
  }

  if (department === 'Sound') {
    return {
      key: 'sound',
      label: isRu ? 'Звук' : 'Sound',
      order: 9,
    };
  }

  if (department === 'Editing') {
    return {
      key: 'editing',
      label: isRu ? 'Монтаж' : 'Editing',
      order: 10,
    };
  }

  if (department === 'Art') {
    return {
      key: 'art',
      label: isRu ? 'Арт-отдел' : 'Art',
      order: 11,
    };
  }

  if (department === 'Costume & Make-Up') {
    return {
      key: 'costume-makeup',
      label: isRu ? 'Костюмы и грим' : 'Costume & Make-Up',
      order: 12,
    };
  }

  if (department === 'Visual Effects') {
    return {
      key: 'visual-effects',
      label: isRu ? 'Визуальные эффекты' : 'Visual Effects',
      order: 13,
    };
  }

  if (department === 'Crew') {
    return {
      key: 'crew',
      label: isRu ? 'Съёмочная группа' : 'Crew',
      order: 14,
    };
  }

  const fallbackLabel = job || department || (isRu ? 'Другое' : 'Other');
  return {
    key: `other:${fallbackLabel.toLowerCase()}`,
    label: fallbackLabel,
    order: 100,
  };
};

const sortFilmographyItemsByDate = (a, b) => getPersonCreditDate(b).localeCompare(getPersonCreditDate(a));

const buildPersonFilmographyGroups = (allCredits, TMDB_LANG) => {
  const groupsMap = new Map();

  allCredits.forEach((credit) => {
    const roleMeta = normalizePersonRoleGroup(credit, TMDB_LANG);
    const groupKey = roleMeta.key;
    const itemKey = `${credit.mediaType}:${credit.id}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        key: groupKey,
        label: roleMeta.label,
        order: roleMeta.order,
        itemsMap: new Map(),
      });
    }

    const group = groupsMap.get(groupKey);
    const existing = group.itemsMap.get(itemKey);

    if (!existing || getPersonCreditDate(credit) > getPersonCreditDate(existing)) {
      group.itemsMap.set(itemKey, credit);
    }
  });

  return Array.from(groupsMap.values())
    .map((group) => ({
      key: group.key,
      label: group.label,
      items: Array.from(group.itemsMap.values()).sort(sortFilmographyItemsByDate),
      order: group.order,
    }))
    .sort((a, b) => (a.order - b.order) || (b.items.length - a.items.length) || a.label.localeCompare(b.label))
    .map(({ order, ...group }) => group);
};

export function useTmdbDetailsApi({
  library,
  setLibrary,
  setSelectedItem,
  setSelectedPerson,
  setSeasonEpisodes,
  seasonEpisodes,
  setLoadingSeason,
  TMDB_LANG,
  networkErrorMessage,
  onError,
}) {
  const notifyError = useCallback((context, error) => {
    const message = error?.message || networkErrorMessage;
    console.error(context, error);
    onError?.(message);
  }, [networkErrorMessage, onError]);

  useEffect(() => {
    if (!Array.isArray(library) || library.length === 0) return;

    const localeKey = TMDB_LANG === 'ru-RU' ? 'ru' : 'en';
    const getLocalizedField = (item) => (
      item.mediaType === 'tv'
        ? (localeKey === 'ru' ? 'name_ru' : 'name_en')
        : (localeKey === 'ru' ? 'title_ru' : 'title_en')
    );
    const getBaseField = (item) => (item.mediaType === 'tv' ? 'name' : 'title');

    const itemsToFetch = library.filter((item) => {
      const localizedField = getLocalizedField(item);
      return !String(item?.[localizedField] || '').trim();
    });

    if (itemsToFetch.length === 0) return;

    let cancelled = false;

    const hydrateLocalizedLibraryTitles = async () => {
      const updates = new Map();
      const chunkSize = 6;

      for (let index = 0; index < itemsToFetch.length; index += chunkSize) {
        if (cancelled) return;
        const chunk = itemsToFetch.slice(index, index + chunkSize);
        const results = await Promise.all(
          chunk.map(async (item) => {
            try {
              const detail = await tmdbFetchJson(`/${item.mediaType}/${item.id}`, { language: TMDB_LANG });
              const localizedTitle = item.mediaType === 'tv'
                ? (detail.name || detail.original_name || '')
                : (detail.title || detail.original_title || '');
              if (!localizedTitle) return null;
              return { key: `${item.mediaType}-${item.id}`, localizedTitle };
            } catch (error) {
              console.warn(`Failed to hydrate localized title for ${item.mediaType}:${item.id}`, error);
              return null;
            }
          })
        );

        results.forEach((result) => {
          if (!result) return;
          updates.set(result.key, result.localizedTitle);
        });
      }

      if (cancelled || updates.size === 0) return;

      setLibrary((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          const key = `${item.mediaType}-${item.id}`;
          const localizedTitle = updates.get(key);
          if (!localizedTitle) return item;

          const localizedField = getLocalizedField(item);
          const baseField = getBaseField(item);
          const currentLocalizedValue = String(item?.[localizedField] || '').trim();
          const currentBaseValue = String(item?.[baseField] || '').trim();

          if (currentLocalizedValue === localizedTitle && currentBaseValue === localizedTitle) return item;
          changed = true;
          return {
            ...item,
            [localizedField]: localizedTitle,
            [baseField]: localizedTitle,
          };
        });

        return changed ? next : prev;
      });
    };

    hydrateLocalizedLibraryTitles();

    return () => {
      cancelled = true;
    };
  }, [library, setLibrary, TMDB_LANG]);

  const getFullDetails = useCallback(async (item) => {
    try {
      const [detail, credits, videos, recs] = await tmdbFetchManyJson([
        { path: `/${item.mediaType}/${item.id}`, params: { language: TMDB_LANG } },
        { path: `/${item.mediaType}/${item.id}/credits`, params: { language: TMDB_LANG } },
        { path: `/${item.mediaType}/${item.id}/videos`, params: { language: TMDB_LANG } },
        { path: `/${item.mediaType}/${item.id}/recommendations`, params: { language: TMDB_LANG } },
      ]);

      const trailer = (videos?.results || []).find((video) => video.type === 'Trailer' && video.site === 'YouTube');
      const libEntry = library.find((entry) => entry.mediaType === item.mediaType && entry.id === item.id);

      let collectionParts = null;
      if (item.mediaType === 'movie' && detail.belongs_to_collection) {
        try {
          const colData = await tmdbFetchJson(
            `/collection/${detail.belongs_to_collection.id}`,
            { language: TMDB_LANG }
          );
          if (colData?.parts) {
            collectionParts = {
              name: colData.name,
              parts: colData.parts.sort(
                (a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999')
              ),
            };
          }
        } catch (error) {
          console.warn(`Failed to load collection parts for movie ${item.id}`, error);
        }
      }

      let relatedShows = null;
      if (item.mediaType === 'tv') {
        try {
          const keywordsData = await tmdbFetchJson(`/tv/${item.id}/keywords`);
          const rawKeywords = (keywordsData?.results || []).filter((keyword) => keyword?.id && keyword?.name);

          const genericKeywordPatterns = [
            /^(tv|television|series|show|drama|comedy|thriller|mystery)$/i,
            /^(miniseries|mini[- ]?series)$/i,
            /^(based on (a )?(novel|book|comic|manga))$/i,
            /^(female protagonist|male protagonist)$/i,
            /^(period drama|historical fiction)$/i,
          ];

          const filteredKeywords = rawKeywords
            .filter((keyword) => !genericKeywordPatterns.some((regex) => regex.test(keyword.name.trim())))
            .slice(0, 8);

          const keywordLists = await Promise.all(
            filteredKeywords.map(async (keyword) => {
              try {
                const data = await tmdbFetchJson(
                  `/keyword/${keyword.id}/tv`,
                  { language: TMDB_LANG, page: 1 }
                );
                return { keyword, data };
              } catch (error) {
                console.warn(`Failed to load keyword list ${keyword.id} for tv ${item.id}`, error);
                return null;
              }
            })
          );

          const scored = new Map();
          keywordLists.filter(Boolean).forEach(({ data }) => {
            const total = Number(data?.total_results || 0);
            if (total < 2 || total > 12) return;

            (data?.results || []).forEach((show) => {
              if (!show?.id || show.id === detail.id) return;
              const previous = scored.get(show.id) || { ...show, score: 0 };
              previous.score += 1;
              scored.set(show.id, previous);
            });
          });

          const relatedOnly = Array.from(scored.values())
            .filter((show) => show.score > 0)
            .sort(
              (a, b) => (b.score - a.score)
                || (a.first_air_date || '9999').localeCompare(b.first_air_date || '9999')
            )
            .slice(0, 20);

          if (relatedOnly.length > 0) {
            relatedShows = [
              {
                id: detail.id,
                name: detail.name,
                poster_path: detail.poster_path,
                first_air_date: detail.first_air_date,
                vote_average: detail.vote_average,
              },
              ...relatedOnly,
            ];
          }
        } catch (error) {
          console.warn(`Failed to load related shows for tv ${item.id}`, error);
        }
      }

      if (item.mediaType === 'tv' && libEntry) {
        const previousTotalEpisodes = getTvTotalEpisodes(libEntry);
        const freshTotalEpisodes = getTvTotalEpisodes(detail, libEntry);
        const resolvedLibStatus = resolveTvProgressStatus(
          libEntry.status,
          libEntry.watchedEpisodes || {},
          detail,
          libEntry
        );

        const freshSeasonSignature = getTvSeasonsSignature(detail.seasons);
        const prevSeasonSignature = getTvSeasonsSignature(libEntry.seasons);
        const freshNextEpisodeMarker = getEpisodeMarker(detail.next_episode_to_air);
        const prevNextEpisodeMarker = getEpisodeMarker(libEntry.next_episode_to_air);
        const freshLastEpisodeMarker = getEpisodeMarker(detail.last_episode_to_air);
        const prevLastEpisodeMarker = getEpisodeMarker(libEntry.last_episode_to_air);

        const metadataChanged = (
          previousTotalEpisodes !== freshTotalEpisodes
          || Number(libEntry.number_of_seasons || 0) !== Number(detail.number_of_seasons || 0)
          || Boolean(libEntry.in_production) !== Boolean(detail.in_production)
          || prevSeasonSignature !== freshSeasonSignature
          || prevNextEpisodeMarker !== freshNextEpisodeMarker
          || prevLastEpisodeMarker !== freshLastEpisodeMarker
        );

        if (metadataChanged || resolvedLibStatus !== libEntry.status) {
          setLibrary((prev) => prev.map((entry) => {
            if (entry.mediaType !== 'tv' || entry.id !== item.id) return entry;

            const nextStatus = resolveTvProgressStatus(
              entry.status,
              entry.watchedEpisodes || {},
              detail,
              entry
            );
            const nextSeasons = Array.isArray(detail.seasons) ? detail.seasons : entry.seasons;
            const nextEntry = {
              ...entry,
              in_production: detail.in_production,
              next_episode_to_air: detail.next_episode_to_air || null,
              last_episode_to_air: detail.last_episode_to_air || null,
              number_of_episodes: Number(detail.number_of_episodes) || entry.number_of_episodes || 0,
              number_of_seasons: Number(detail.number_of_seasons) || entry.number_of_seasons || 0,
              seasons: nextSeasons,
              status: nextStatus,
            };

            if (
              nextEntry.status === entry.status
              && nextEntry.in_production === entry.in_production
              && nextEntry.number_of_episodes === entry.number_of_episodes
              && nextEntry.number_of_seasons === entry.number_of_seasons
              && getTvSeasonsSignature(nextEntry.seasons) === getTvSeasonsSignature(entry.seasons)
              && getEpisodeMarker(nextEntry.next_episode_to_air) === getEpisodeMarker(entry.next_episode_to_air)
              && getEpisodeMarker(nextEntry.last_episode_to_air) === getEpisodeMarker(entry.last_episode_to_air)
            ) {
              return entry;
            }

            return nextEntry;
          }));
        }
      }

      setSelectedItem({
        ...detail,
        mediaType: item.mediaType,
        credits,
        trailer: trailer?.key || null,
        recommendations: (recs?.results || []).slice(0, 10),
        rating: libEntry?.rating || 0,
        watchedEpisodes: libEntry?.watchedEpisodes || {},
        seasonRatings: libEntry?.seasonRatings || {},
        collectionParts,
        relatedShows,
      });
      setSeasonEpisodes({});
    } catch (error) {
      notifyError(`Failed to load details for ${item.mediaType}:${item.id}`, error);
    }
  }, [TMDB_LANG, library, notifyError, setLibrary, setSeasonEpisodes, setSelectedItem]);

  const getPersonDetails = useCallback(async (personId) => {
    try {
      const [person, credits] = await tmdbFetchManyJson([
        { path: `/person/${personId}`, params: { language: TMDB_LANG } },
        { path: `/person/${personId}/combined_credits`, params: { language: TMDB_LANG } },
      ]);

      const castCredits = (credits?.cast || [])
        .filter((item) => item?.id && (item.media_type === 'movie' || item.media_type === 'tv'))
        .map((item) => ({
          ...item,
          mediaType: item.media_type,
          creditType: 'cast',
        }));

      const crewCredits = (credits?.crew || [])
        .filter((item) => item?.id && (item.media_type === 'movie' || item.media_type === 'tv'))
        .map((item) => ({
          ...item,
          mediaType: item.media_type,
          creditType: 'crew',
        }));

      const allCredits = [...castCredits, ...crewCredits];
      const filmographyGroups = buildPersonFilmographyGroups(allCredits, TMDB_LANG);

      const uniqueContent = Array.from(
        new Map(
          allCredits
            .map((content) => [`${content.mediaType}:${content.id}`, content])
        ).values()
      ).sort(sortFilmographyItemsByDate);

      const moviesInLibrary = uniqueContent
        .map((content) => {
          const libEntry = library.find(
            (entry) => entry.mediaType === content.mediaType && entry.id === content.id
          );
          if (!libEntry) return null;
          return { ...content, rating: libEntry.rating, inLibrary: true };
        })
        .filter(Boolean);

      const ratedInLib = moviesInLibrary.filter((movie) => movie.rating > 0);
      const avgRating = ratedInLib.length > 0
        ? (ratedInLib.reduce((sum, movie) => sum + movie.rating, 0) / ratedInLib.length).toFixed(1)
        : 0;

      setSelectedPerson({
        ...person,
        allMovies: uniqueContent,
        filmographyGroups,
        moviesInLibrary,
        avgRating: Number.isNaN(Number(avgRating)) ? 0 : avgRating,
      });
    } catch (error) {
      notifyError(`Failed to load person details for ${personId}`, error);
    }
  }, [TMDB_LANG, library, notifyError, setSelectedPerson]);

  const loadSeasonEpisodes = useCallback(async (tvId, seasonNumber) => {
    if (seasonEpisodes[seasonNumber]) return;
    setLoadingSeason(seasonNumber);

    try {
      const data = await tmdbFetchJson(
        `/tv/${tvId}/season/${seasonNumber}`,
        { language: TMDB_LANG }
      );

      const episodes = data.episodes || [];
      setSeasonEpisodes((prev) => ({ ...prev, [seasonNumber]: episodes }));

      const runtimeMap = {};
      episodes.forEach((episode) => {
        if (episode.runtime > 0) {
          runtimeMap[episode.episode_number] = episode.runtime;
        }
      });

      if (Object.keys(runtimeMap).length > 0) {
        setLibrary((prev) => prev.map((entry) => {
          if (entry.mediaType === 'tv' && entry.id === tvId) {
            const episodeRuntimes = { ...(entry.episodeRuntimes || {}), [seasonNumber]: runtimeMap };
            return { ...entry, episodeRuntimes };
          }
          return entry;
        }));
      }
    } catch (error) {
      notifyError(`Failed to load season ${seasonNumber} for tv ${tvId}`, error);
    } finally {
      setLoadingSeason(null);
    }
  }, [TMDB_LANG, notifyError, seasonEpisodes, setLibrary, setLoadingSeason, setSeasonEpisodes]);

  return {
    getFullDetails,
    getPersonDetails,
    loadSeasonEpisodes,
  };
}
