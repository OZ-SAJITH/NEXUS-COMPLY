import { useEffect, useRef } from "react";
import { cn } from "../../utils/cn";
import { useReducedMotion } from "../../hooks/useReducedMotion";

interface BackgroundFxProps {
  className?: string;
}

export function BackgroundFx({ className }: BackgroundFxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const COUNT = 46;
    const LINK = 140;
    let pts: Array<{ x: number; y: number; vx: number; vy: number; r: number }> = [];
    let t = 0;

    const seed = () => {
      pts = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.4 + 0.5,
      }));
    };

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed();
    };

    const step = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10 || p.x > w + 10) p.vx *= -1;
        if (p.y < -10 || p.y > h + 10) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i += 1) {
        for (let j = i + 1; j < pts.length; j += 1) {
          const a = pts[i];
          const b = pts[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const alpha = (1 - Math.sqrt(d2) / LINK) * 0.08;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = `rgba(125, 211, 252, ${(0.10 + 0.08 * Math.sin(t * 0.02 + p.x * 0.01)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(step);
    };

    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(step);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className={cn("bg-aurora", className)} aria-hidden="true">
      <div
        className="blob w-[520px] h-[520px] left-[-8%] top-[-12%]"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.15), transparent 65%)" }}
      />
      <div
        className="blob w-[460px] h-[460px] right-[-6%] top-[28%]"
        style={{ background: "radial-gradient(circle, rgba(34,211,238,0.09), transparent 65%)", animationDelay: "-9s" }}
      />
      <div
        className="blob w-[560px] h-[560px] left-[26%] bottom-[-22%]"
        style={{ background: "radial-gradient(circle, rgba(14,165,233,0.11), transparent 65%)", animationDelay: "-17s" }}
      />
      <div className="absolute inset-0 grid-pan" />
      {!reduced ? <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" /> : null}
    </div>
  );
}