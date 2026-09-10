import { type CSSProperties, type ReactNode } from "react";
import { useInView } from "../../hooks/useInView";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../utils/cn";

interface RevealProps {
  children?: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
  style?: CSSProperties;
}

export function Reveal({ children, className, delay = 0, y = 18, once = true, style }: RevealProps) {
  const [ref, inView] = useInView<HTMLDivElement>({ once });
  const reduced = useReducedMotion();
  const visible = reduced || inView;
  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "reveal-visible", className)}
      style={
        {
          ...style,
          "--reveal-y": `${y}px`,
          "--reveal-delay": `${delay}ms`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}