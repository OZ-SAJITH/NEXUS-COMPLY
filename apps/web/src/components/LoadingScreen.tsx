import { AnimatedNexusLogo } from "./motion/AnimatedNexusLogo";

interface LoadingScreenProps {
  label?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({ label = "Initializing security console…", fullScreen = true }: LoadingScreenProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-surface-950 ${fullScreen ? "fixed inset-0 z-[100]" : "min-h-[50vh]"}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 38%, rgba(56,189,248,0.10), transparent 70%), radial-gradient(ellipse 40% 34% at 50% 62%, rgba(14,165,233,0.06), transparent 70%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center animate-fade-in-up">
        <div className="relative">
          <span className="absolute inset-0 rounded-full ai-ring-pulse" aria-hidden="true" />
          <AnimatedNexusLogo state="LOADING" size={76} intro />
        </div>
        <div className="mt-8 h-1 w-56 rounded-full bg-surface-800 overflow-hidden shadow-panel">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-accent-dim to-accent animate-shimmer" />
        </div>
        <p className="mt-5 text-sm font-medium tracking-[0.18em] uppercase text-slate-400 animate-pulse">{label}</p>
      </div>
    </div>
  );
}