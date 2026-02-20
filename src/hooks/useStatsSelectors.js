import { useMemo } from 'react';

export function useStatsSelectors({ library, peopleView }) {
  const movieStats = useMemo(() => {
    const movies = library.filter((x) => x.mediaType === 'movie');
    const completed = movies.filter((x) => x.status === 'completed');
    const planned = movies.filter((x) => x.status === 'planned');
    const rated = completed.filter((x) => x.rating > 0);
    const totalRuntime = completed.reduce((sum, m) => sum + (m.runtime || 0), 0);
    const avgRating = rated.length > 0
      ? (rated.reduce((sum, m) => sum + m.rating, 0) / rated.length).toFixed(1)
      : 0;

    const byYear = {};
    const byGenre = {};
    const ratingDist = {};
    const byDecade = {};

    completed.forEach((movie) => {
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : 'Unknown';
      byYear[year] = (byYear[year] || 0) + 1;

      (Array.isArray(movie.genres) ? movie.genres : []).forEach((genre) => {
        if (!genre?.name) return;
        byGenre[genre.name] = (byGenre[genre.name] || 0) + 1;
      });

      if (movie.release_date) {
        const decade = Math.floor(new Date(movie.release_date).getFullYear() / 10) * 10;
        byDecade[decade] = (byDecade[decade] || 0) + 1;
      }
    });

    rated.forEach((movie) => {
      ratingDist[movie.rating] = (ratingDist[movie.rating] || 0) + 1;
    });

    const topRated = [...rated].sort((a, b) => b.rating - a.rating).slice(0, 5);
    const favDecade = Object.entries(byDecade).sort(([, a], [, b]) => b - a)[0];

    return {
      total: movies.length,
      completed: completed.length,
      planned: planned.length,
      rated: rated.length,
      totalRuntime,
      avgRating,
      byYear,
      byGenre,
      ratingDist,
      topRated,
      favDecade: favDecade ? `${favDecade[0]}-е` : null,
    };
  }, [library]);

  const tvStats = useMemo(() => {
    const shows = library.filter((x) => x.mediaType === 'tv');
    const completed = shows.filter((x) => x.status === 'completed');
    const watching = shows.filter((x) => x.status === 'watching');
    const planned = shows.filter((x) => x.status === 'planned');
    const dropped = shows.filter((x) => x.status === 'dropped');
    const onHold = shows.filter((x) => x.status === 'on_hold');
    const ratedFromSeasons = shows
      .map((show) => {
        const seasonRatings = Object.values(show.seasonRatings || {}).filter((rating) => Number(rating) > 0);
        if (seasonRatings.length === 0) return null;
        const avgFromSeasons = Math.round(
          seasonRatings.reduce((sum, rating) => sum + Number(rating), 0) / seasonRatings.length
        );
        return { ...show, rating: avgFromSeasons };
      })
      .filter(Boolean);
    const avgRating = ratedFromSeasons.length > 0
      ? (ratedFromSeasons.reduce((sum, show) => sum + show.rating, 0) / ratedFromSeasons.length).toFixed(1)
      : 0;

    let totalEpisodes = 0;
    let totalSeasons = 0;
    let totalRuntime = 0;

    shows.forEach((show) => {
      const watchedEpisodes = show.watchedEpisodes || {};
      const episodeRuntimes = show.episodeRuntimes || {};
      const fallbackRuntime = (show.episode_run_time && show.episode_run_time.length > 0)
        ? show.episode_run_time[0]
        : 45;

      Object.entries(watchedEpisodes).forEach(([seasonNum, episodes]) => {
        const safeEpisodes = Array.isArray(episodes) ? episodes : [];
        totalEpisodes += safeEpisodes.length;
        if (safeEpisodes.length > 0) totalSeasons += 1;
        const seasonRuntimes = episodeRuntimes[seasonNum] || {};
        safeEpisodes.forEach((episodeNumber) => {
          totalRuntime += seasonRuntimes[episodeNumber] || fallbackRuntime;
        });
      });
    });

    const byYear = {};
    const byGenre = {};
    const ratingDist = {};

    completed.forEach((show) => {
      const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : 'Unknown';
      byYear[year] = (byYear[year] || 0) + 1;
    });

    shows.forEach((show) => {
      (Array.isArray(show.genres) ? show.genres : []).forEach((genre) => {
        if (!genre?.name) return;
        byGenre[genre.name] = (byGenre[genre.name] || 0) + 1;
      });
    });

    ratedFromSeasons.forEach((show) => {
      ratingDist[show.rating] = (ratingDist[show.rating] || 0) + 1;
    });

    const topRated = [...ratedFromSeasons].sort((a, b) => b.rating - a.rating).slice(0, 5);

    return {
      total: shows.length,
      completed: completed.length,
      watching: watching.length,
      planned: planned.length,
      dropped: dropped.length,
      onHold: onHold.length,
      rated: ratedFromSeasons.length,
      totalEpisodes,
      totalSeasons,
      totalRuntime,
      avgRating,
      byYear,
      byGenre,
      ratingDist,
      topRated,
    };
  }, [library]);

  const peopleData = useMemo(() => {
    const peopleMap = {};

    library.forEach((item) => {
      if (!item.credits) return;

      if (peopleView === 'directors') {
        if (item.mediaType === 'movie') {
          const director = item.credits.crew?.find((person) => person.job === 'Director');
          if (director) {
            if (!peopleMap[director.id]) {
              peopleMap[director.id] = { ...director, items: [], totalRating: 0, ratedCount: 0 };
            }
            peopleMap[director.id].items.push(item);
            if (item.rating > 0) {
              peopleMap[director.id].totalRating += item.rating;
              peopleMap[director.id].ratedCount += 1;
            }
          }
        }

        if (item.mediaType === 'tv' && item.created_by) {
          item.created_by.forEach((creator) => {
            if (!peopleMap[creator.id]) {
              peopleMap[creator.id] = { ...creator, items: [], totalRating: 0, ratedCount: 0 };
            }
            peopleMap[creator.id].items.push(item);
            if (item.rating > 0) {
              peopleMap[creator.id].totalRating += item.rating;
              peopleMap[creator.id].ratedCount += 1;
            }
          });
        }
      } else {
        const cast = Array.isArray(item.credits.cast) ? item.credits.cast : [];
        cast.slice(0, 5).forEach((actor) => {
          if (!peopleMap[actor.id]) {
            peopleMap[actor.id] = { ...actor, items: [], totalRating: 0, ratedCount: 0 };
          }
          peopleMap[actor.id].items.push(item);
          if (item.rating > 0) {
            peopleMap[actor.id].totalRating += item.rating;
            peopleMap[actor.id].ratedCount += 1;
          }
        });
      }
    });

    return Object.values(peopleMap)
      .map((person) => ({
        ...person,
        avgRating: person.ratedCount > 0 ? (person.totalRating / person.ratedCount).toFixed(1) : 0,
      }))
      .sort((a, b) => b.items.length - a.items.length || Number(b.avgRating) - Number(a.avgRating))
      .slice(0, 20);
  }, [library, peopleView]);

  return {
    movieStats,
    tvStats,
    peopleData,
  };
}
