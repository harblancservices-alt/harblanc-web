export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(ms);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  const future = ms < 0;
  let label: string;
  if (abs < hr) label = `${Math.max(1, Math.round(abs / min))}m`;
  else if (abs < day) label = `${Math.round(abs / hr)}h`;
  else if (abs < 30 * day) label = `${Math.round(abs / day)}d`;
  else label = formatDate(iso);
  if (label.endsWith("d") || label.endsWith("h") || label.endsWith("m")) {
    return future ? `in ${label}` : `${label} ago`;
  }
  return label;
}

export function daysAgoLabel(iso: string | null): string {
  if (!iso) return "Never contacted";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
