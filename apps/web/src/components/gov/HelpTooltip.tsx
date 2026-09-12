import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  label: string;
  children: React.ReactNode;
}

/** Small inline "?" marker that reveals a concise cyber-concept explainer on hover/focus. */
export function HelpTooltip({ label, children }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-surface-600 text-slate-500 hover:text-accent hover:border-accent/50 transition-colors"
        aria-label={`About ${label}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <HelpCircle className="w-3 h-3" aria-hidden="true" />
      </button>
      {open ? (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 rounded-lg border border-surface-600 bg-surface-900 p-3 text-[11px] leading-relaxed text-slate-300 shadow-lift z-50">
          {children}
        </span>
      ) : null}
    </span>
  );
}