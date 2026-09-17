const UNITS = ["B", "KiB", "MiB", "GiB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[index]}`;
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function expiryText(expiresAt: number | null): string {
  if (expiresAt === null) return "never expires";
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "expired";
  const seconds = Math.round(remaining / 1000);
  if (seconds < 60) return `expires in ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `expires in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `expires in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `expires in ${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `expires in ${months}mo`;
  return `expires in ${Math.round(months / 12)}y`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split("\n").length;
}
