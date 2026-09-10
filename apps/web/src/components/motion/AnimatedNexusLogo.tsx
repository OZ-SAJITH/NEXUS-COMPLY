import { useEffect, useState, type CSSProperties } from "react";
import { LogoMark, LOGO_RATIO } from "../Logo";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../utils/cn";

export type NexusLogoState = "IDLE" | "LOADING" | "AI_ANALYZING" | "REVIEW_REQUIRED" | "SUCCESS" | "WARNING" | "CRITICAL" | "ERROR";

const STATE_CLASS: Record<NexusLogoState, string> = {
  IDLE: "nexus-logo--idle",
  LOADING: "nexus-logo--loading",
  AI_ANALYZING: "nexus-logo--ai",
  REVIEW_REQUIRED: "nexus-logo--warning",
  SUCCESS: "nexus-logo--success",
  WARNING: "nexus-logo--warning",
  CRITICAL: "nexus-logo--critical",
  ERROR: "nexus-logo--error",
};

interface AnimatedNexusLogoProps {
  state?: NexusLogoState;
  /** Play the one-shot intro sequence on mount (symbol fade-in, light sweep, text reveal). */
  intro?: boolean;
  /** Show the wordmark + optional tagline next to the mark. */
  showWord?: boolean;
  tagline?: string;
  /** Vertical size of the mark in px (width is derived from the asset ratio). */
  size?: number;
  /** Adds  hover interactivity (glow up + sweep). Disable for decorative spots. */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

const PARTICLE_SEED: Array<{ inset: string; px: string; py: string; delay: string }> = [
  { inset: "6% 14% auto auto", px: "-12px", py: "10px", delay: "0s" },
  { inset: "12% auto auto 16%", px: "14px", py: "8px", delay: "0.4s" },
  { inset: "auto 10% 8% auto", px: "-10px", py: "-12px", delay: "0.8s" },
];

/**
 * Reusable signature NEXUS-COMPLY brand component. The logo is a PNG asset, so all
 * animation is applied *around* the asset (CSS glow / rings / sweeps) rather than
 * destructively modifying the artwork — the mark always stays recognizable.
 */
export function AnimatedNexusLogo({
  state = "IDLE",
  intro = false,
  showWord = false,
  tagline,
  size = 36,
  interactive = false,
  className,
  style,
}: AnimatedNexusLogoProps) {
  const reduced = useReducedMotion();
  const [introOn, setIntroOn] = useState(intro && !reduced);

  useEffect(() => {
    if (!intro || reduced) return;
    const t = setTimeout(() => setIntroOn(false), 1200);
    return () => clearTimeout(t);
  }, [intro, reduced]);

  const markW = Math.round(size * LOGO_RATIO);

  return (
    <span
      className={cn(
        "nexus-logo",
        STATE_CLASS[state],
        introOn && "nexus-logo--intro",
        interactive && "nexus-logo--interactive",
        className
      )}
      style={style}
    >
      <span className="nexus-logo__halo" aria-hidden="true" />
      <LogoMark size={size} className="nexus-logo__mark" />
      <span className="nexus-logo__scan" aria-hidden="true" />
      <span className="nexus-logo__particles" aria-hidden="true">
        {PARTICLE_SEED.map((p, i) => (
          <i key={i} style={{ inset: p.inset, animationDelay: p.delay, ["--px" as never]: p.px, ["--py" as never]: p.py }} />
        ))}
      </span>
      <span className="nexus-logo__sweep" aria-hidden="true" />
      <span className="nexus-logo__check" aria-hidden="true">
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" fill="none">
          <path className="check-anim" d="M4 12.5 L9.5 18 L20 6.5" stroke="#34d399" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {showWord ? (
        <span className="nexus-logo__word" style={{ maxWidth: Math.round(markW * 3.6) }}>
          <span
            className="nexus-logo__word-title"
            style={{ fontSize: Math.max(10, Math.round(size * 0.3)) }}
          >
            NEXUS-COMPLY
          </span>
          {tagline ? <span className="nexus-logo__word-tagline truncate">{tagline}</span> : null}
        </span>
      ) : null}
      <span className="sr-only">NEXUS-COMPLY</span>
    </span>
  );
}