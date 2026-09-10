import type { AiMode } from "../hooks/useAiMode";
import { Badge } from "./ui";

export function AiModeBadge({ mode }: { mode: AiMode }) {
  return mode === "live" ? (
    <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> AI Mode: LIVE
    </Badge>
  ) : (
    <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-400">
      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> AI Mode: DEMO
    </Badge>
  );
}