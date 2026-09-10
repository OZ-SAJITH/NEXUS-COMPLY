import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../utils/cn";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  interactive?: boolean;
}

export function GlassCard({ children, className, style, interactive = true }: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;
    const onMove = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      node.style.setProperty("--rx", `${e.clientX - r.left}px`);
      node.style.setProperty("--ry", `${e.clientY - r.top}px`);
    };
    node.addEventListener("pointermove", onMove);
    return () => node.removeEventListener("pointermove", onMove);
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={cn("glass-card", !interactive && "glass-card-static", className)}
      style={style}
    >
      {children}
    </div>
  );
}