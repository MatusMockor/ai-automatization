export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return 'just now';

  const diff = now - ts;
  if (diff < 0) return 'just now';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
