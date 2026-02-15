export const isReleasedDate = (dateStr) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date <= today;
};

export const isReleasedItem = (item) => {
  if (!item) return false;
  const date = item.mediaType === 'movie' ? item.release_date : item.first_air_date;
  return isReleasedDate(date);
};
