export const RATINGS = [1,2,3,4,5,6,7,8,9,10];
const CURRENT_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: 60 }, (_, i) => CURRENT_YEAR - i);

export const uniqSort = (arr) => Array.from(new Set(arr)).sort((a, b) => a - b);

export const formatMoney = (amount) => {
  if (!amount) return null;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const catmullRomPath = (pts) => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
};

export const getYear = (item) => {
  const d = item.release_date || item.first_air_date;
  return d ? new Date(d).getFullYear() : '-';
};

export const buildWatchedEpisodes = (seasons) =>
  seasons.reduce((acc, s) => {
    if (s.season_number === 0) return acc;
    acc[s.season_number] = Array.from({ length: s.episode_count }, (_, i) => i + 1);
    return acc;
  }, {});
