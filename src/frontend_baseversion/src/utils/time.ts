import dayjs from 'dayjs';

export const formatTimestampMs = (ms: number | null | undefined): string => {
  if (!ms) return '-';
  return dayjs(ms).format('YYYY-MM-DD HH:mm:ss.SSS');
};
