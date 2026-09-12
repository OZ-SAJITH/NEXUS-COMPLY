import { useEffect, useState } from "react";
import { AnimatedNexusLogo } from "./motion/AnimatedNexusLogo";

interface LoadingScreenProps {
  /** Full-screen boot screen (default); set false for inline/embedded usage (e.g. scenario drafts). */
  fullScreen?: boolean;
  /** Status text under the progress bar. Default matches the security-console boot label. */
  label?: string;
}

const BOOT_PHASES = [
  "Initializing security console",
  "Validating governance context",
  "Loading framework mappings",
  "Warming cryptographic attestation",
  "Synchronizing audit ledger",
  "Raising security console",
];

export function LoadingScreen({
  fullScreen = true,
  label = "Initializing security console",
}: LoadingScreenProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, BOOT_PHASES.length - 1)), 260);
    return () => clearInterval(t);
  }, []);

  const display = fullScreen ? BOOT_PHASES[phase] : label;

  return (
    <div
      className={`flex flex-col items-center justify-center bg-surface-950 ${
        fullScreen ? "fixed inset-0 z-[100]" : "min-h-[50vh]"
      }`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="loading-bg pointer-events-none fixed inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 34%, rgba(56,189,248,0.08), transparent 70%), radial-gradient(ellipse 40% 32% at 50% 66%, rgba(14,165,233,0.05), transparent 72%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative">
          <span className="absolute inset-0 rounded-full ai-ring-pulse" aria-hidden="true" />
          <AnimatedNexusLogo state="LOADING" size={76} intro />
        </div>

        {/* Brand side-slide: NEXUS / COMPLY slide in from the right, tighten + fade */}
        <div className="loading-brand mt-6 text-center" aria-hidden="true">
          <span className="loading-brand__word block font-extrabold text-slate-100">NEXUS</span>
          <span className="loading-brand__word block mt-1 font-semibold text-slate-400">COMPLY</span>
        </div>

        {/* Synced initialization progress (resolves on boot — never infinite) */}
        <div className="mt-7 h-1 w-56 rounded-full bg-surface-800 shadow-panel" role="presentation">
          <div className="loading-bar-fill h-full rounded-full bg-gradient-to-r from-accent-dim to-accent" />
        </div>

        <p className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
          {display}
          <span className="loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      </div>
    </div>
  );
}
