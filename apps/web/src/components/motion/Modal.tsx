import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
}

export function Modal({ title, onClose, children, size = "lg" }: ModalProps) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setClosing((v) => {
      if (v) return v;
      window.setTimeout(onClose, 180);
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div
        className={cn("absolute inset-0 bg-black/60 backdrop-blur-[2px] modal-back", closing && "out")}
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative w-full outline-none rounded-2xl border border-surface-600/70 bg-surface-900/85 backdrop-blur-xl shadow-lift p-6 modal-panel max-h-[85vh] overflow-auto",
          size === "md" ? "max-w-md" : "max-w-lg",
          closing && "out"
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button
            className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-100 hover:bg-surface-800 flex items-center justify-center transition-colors"
            onClick={close}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}