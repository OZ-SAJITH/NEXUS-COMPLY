import type { ReactNode } from "react";
import { RefreshCw, AlertTriangle, Inbox } from "lucide-react";
import { cn } from "../utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg shimmer", className)} />;
}

export function LoadingState({ label = "Syncing with audit engine…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
      <RefreshCw className="w-5 h-5 text-accent animate-spin-slow" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3 !p-6 max-w-2xl">
      <div className="flex items-center gap-2 text-red-400">
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-slate-400">{detail ?? "The audit engine could not be reached. Make sure the API server is running."}</p>
      {onRetry ? (
        <button className="btn-outline text-xs" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint, icon, action }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="w-10 h-10 rounded-lg border border-surface-700 bg-surface-800 flex items-center justify-center text-slate-500">
        {icon ?? <Inbox className="w-5 h-5" aria-hidden="true" />}
      </div>
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {hint ? <div className="text-xs text-slate-500 max-w-sm">{hint}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}