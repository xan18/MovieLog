export const getMovieStatuses = (t) => [
  { id: 'planned', label: t.planned },
  { id: 'completed', label: t.completed },
];

export const getTvStatuses = (t) => [
  { id: 'watching', label: t.watching },
  { id: 'planned', label: t.planned },
  { id: 'completed', label: t.completed },
  { id: 'dropped', label: t.dropped },
];

export const getGameStatuses = (t) => [
  { id: 'planned', label: t.planned },
  { id: 'playing', label: t.playing },
  { id: 'completed', label: t.gameCompleted },
  { id: 'dropped', label: t.dropped },
];

export const getStatusBadgeConfig = (t) => ({
  watching: { label: t.badgeWatching, bg: 'rgba(59,130,246,0.85)', icon: '▶' },
  playing: { label: t.badgePlaying || t.playing, bg: 'rgba(59,130,246,0.85)', icon: '🎮' },
  planned: { label: t.badgePlanned, bg: 'rgba(168,85,247,0.85)', icon: '🕐' },
  completed: { label: t.badgeCompleted, bg: 'rgba(34,197,94,0.85)', icon: '✓' },
  dropped: { label: t.badgeDropped, bg: 'rgba(239,68,68,0.85)', icon: '✕' },
  waiting: { label: t.badgeWaiting || t.waiting || t.badgeWatching, bg: 'rgba(14,165,233,0.85)', icon: '…' },
});

export const getTvShowStatusMap = (t) => ({
  'Returning Series': { label: t.returning, class: 'status-returning' },
  Ended: { label: t.ended, class: 'status-ended' },
  Canceled: { label: t.canceled, class: 'status-canceled' },
  'In Production': { label: t.inProduction, class: 'status-planned' },
  Planned: { label: t.inProduction, class: 'status-planned' },
  Pilot: { label: t.pilot, class: 'status-pilot' },
});

export const getCrewRoleMap = (t) => ({
  Screenplay: t.screenwriter,
  Writer: t.screenwriter,
  'Original Music Composer': t.composer,
  'Director of Photography': t.cinematographer,
  Producer: t.producer,
});
