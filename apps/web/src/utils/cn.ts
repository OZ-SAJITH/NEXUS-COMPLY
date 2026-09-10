export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function severityColor(sev: string): string {
  switch (sev) {
    case "CRITICAL":
      return "text-red-400 border-red-500/40 bg-red-500/10";
    case "HIGH":
      return "text-orange-400 border-orange-500/40 bg-orange-500/10";
    case "MEDIUM":
      return "text-amber-400 border-amber-500/40 bg-amber-500/10";
    case "LOW":
      return "text-yellow-300 border-yellow-500/30 bg-yellow-500/10";
    default:
      return "text-slate-400 border-slate-500/40 bg-slate-500/10";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "PASS":
      return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    case "FAIL":
      return "text-red-400 border-red-500/40 bg-red-500/10";
    case "WARNING":
      return "text-amber-400 border-amber-500/40 bg-amber-500/10";
    default:
      return "text-slate-400 border-slate-500/40 bg-slate-500/10";
  }
}

export function riskBandLabel(score: number): string {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "INFO";
}

export function riskColor(score: number): string {
  const band = riskBandLabel(score);
  return severityColor(band);
}

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}