import type { GovernanceAuditEvent } from "@nexus/shared-types";
import { Bot, User, Cpu } from "lucide-react";
import { cn, timeAgo } from "../../utils/cn";

const EVENT_DOT: Record<string, string> = {
  APPROVED: "bg-emerald-400",
  REJECTED: "bg-red-400",
  CHANGE_EXECUTED: "bg-cyan-400",
  SUCCESS: "bg-emerald-400",
  ROLLBACK_RECOMMENDED: "bg-orange-400",
  ROLLBACK_EXECUTED: "bg-red-400",
  EXCEPTION_DETECTED: "bg-red-400",
  DRIFT_DETECTED: "bg-amber-400",
  CHANGE_FREEZE_ACTIVATED: "bg-sky-400",
  EMERGENCY_OVERRIDE: "bg-orange-400",
  VERIFICATION_PASSED: "bg-emerald-400",
  HUMAN_VERIFIED: "bg-emerald-400",
};
const DEFAULT_DOT = "bg-accent/60";

export function GovernanceTimeline({ events, limit }: { events: GovernanceAuditEvent[]; limit?: number }) {
  const shown = limit ? events.slice(0, limit) : events;
  if (shown.length === 0) {
    return <p className="text-xs text-slate-500">No events recorded yet.</p>;
  }
  const ActorIcon = (t: GovernanceAuditEvent["actorType"]) =>
    t === "ai" ? <Bot className="w-3 h-3" aria-hidden="true" /> : t === "human" ? <User className="w-3 h-3" aria-hidden="true" /> : <Cpu className="w-3 h-3" aria-hidden="true" />;

  return (
    <ol className="relative space-y-0">
      {shown.map((e, i) => (
        <li key={e.id} className="relative pl-6 pb-4 last:pb-0">
          {i < shown.length - 1 ? <span className="absolute left-[5px] top-4 bottom-0 w-px bg-surface-700" aria-hidden="true" /> : null}
          <span className={cn("absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-surface-900", EVENT_DOT[e.eventType] ?? DEFAULT_DOT)} aria-hidden="true" />
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">{ActorIcon(e.actorType)}</span>
            <span className="text-slate-400">{e.actor}</span>
            <span>·</span>
            <span>{timeAgo(e.at)}</span>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed mt-0.5">{e.action}</p>
          {e.detail && Object.keys(e.detail).length > 0 ? (
            <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
              {Object.entries(e.detail)
                .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                .join(" · ")}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}