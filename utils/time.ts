export const formatTime = (seconds: number, showSeconds = false): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (showSeconds) {
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
