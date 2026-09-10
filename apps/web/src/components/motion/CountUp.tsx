import { useEffect, useRef, useState } from "react";
import { useInView } from "../../hooks/useInView";
import { useReducedMotion } from "../../hooks/useReducedMotion";

interface CountUpProps {
  to: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function CountUp({ to, duration = 900, delay = 0, prefix = "", suffix = "", decimals = 0, className }: CountUpProps) {
  const [ref, inView] = useInView<HTMLSpanElement>({ once: true });
  const reduced = useReducedMotion();
  const [val, setVal] = useState(reduced ? to : 0);
  const display = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (reduced) {
      display.current = to;
      setVal(to);
      return;
    }
    if (!inView) return;
    cancelAnimationFrame(raf.current);
    const from = display.current;
    const waitUntil = performance.now() + delay;
    const dur = Math.max(260, Math.min(duration, Math.abs(to - from) * 26 || duration));
    const tick = (ts: number) => {
      const t0 = Math.max(ts, waitUntil);
      const p = Math.min(1, (t0 - waitUntil) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      display.current = v;
      setVal(v);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [inView, to, delay, duration, reduced]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}