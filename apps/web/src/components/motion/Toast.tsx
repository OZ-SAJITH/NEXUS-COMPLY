import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "../../utils/cn";

export type ToastTone = "success" | "warning" | "error" | "info";

const ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const TONES: Record<ToastTone, { icon: string; bar: string }> = {
  success: { icon: "text-emerald-400", bar: "bg-emerald-400" },
  warning: { icon: "text-amber-400", bar: "bg-amber-400" },
  error: { icon: "text-red-400", bar: "bg-red-400" },
  info: { icon: "text-cyan-300", bar: "bg-cyan-300" },
};

interface ToastProps {
  tone?: ToastTone;
  onDismiss: () => void;
  children: ReactNode;
  duration?: number;
}

export function Toast({ tone = "success", onDismiss, children, duration = 3200 }: ToastProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(onDismiss, 160);
    }, duration);
    return () => window.clearTimeout(t);
  }, [duration, onDismiss]);

  const Icon = ICONS[tone];

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-[80] max-w-sm w-[calc(100vw-3rem)] sm:w-auto relative glass rounded-xl px-4 py-3 text-sm",
        leaving ? "toast-out" : "toast-in"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", TONES[tone].icon)} aria-hidden="true" />
        <div className="text-xs text-slate-200 leading-relaxed min-w-0">{children}</div>
        <button
          className="ml-auto -mt-0.5 -mr-1 p-0.5 text-slate-500 hover:text-slate-200 transition-colors shrink-0"
          onClick={() => {
            setLeaving(true);
            window.setTimeout(onDismiss, 160);
          }}
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
      <span className={cn("absolute bottom-0 left-0 h-0.5 rounded-full toast-bar", TONES[tone].bar)} aria-hidden="true" />
    </div>
  );
}