import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Lock, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";
import { AnimatedNexusLogo, type NexusLogoState } from "../components/motion/AnimatedNexusLogo";
import GatewayFlow from "../components/ui/gateway-flow";
import { api } from "../services/api";
import { setSession } from "../session";

export default function LoginPage() {
  const [email, setEmail] = useState("reviewer@nexus-comply.sih");
  const [password, setPassword] = useState("demo-reviewer");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [logoState, setLogoState] = useState<NexusLogoState>("IDLE");
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || authed) return;
    setBusy(true);
    setError("");
    setLogoState("LOADING");
    try {
      const { token, user } = await api.login(email.trim(), password);
      setSession({ token, id: user.id, email: user.email, displayName: user.displayName, role: user.role });
      setAuthed(true);
      setLogoState("SUCCESS");
      window.setTimeout(() => navigate(from, { replace: true }), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Try again.");
      setBusy(false);
      setLogoState("ERROR");
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-surface-950 overflow-hidden">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 45% 40% at 50% 12%, rgba(56,189,248,0.14), transparent 70%), radial-gradient(ellipse 38% 32% at 50% 100%, rgba(14,165,233,0.08), transparent 70%)",
        }}
      />
      {/* Animated flow background */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <GatewayFlow className="h-full w-full" mode="dark" opacity={0.75} density={0.8} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <Link
          to="/"
          aria-label="NEXUS-COMPLY home"
          className="transition-opacity hover:opacity-95"
          onClick={(e) => {
            if (authed) e.preventDefault();
          }}
        >
          <AnimatedNexusLogo
            state={logoState}
            size={86}
            showWord
            tagline="EVIDENCE-DRIVEN ADAPTIVE COMPLIANCE"
            intro
            interactive
          />
        </Link>

        <div className={authed ? "mt-8 w-full rounded-2xl glass p-8 toast-in opacity-60" : "mt-8 w-full rounded-2xl glass p-8 toast-in"}>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] uppercase text-accent mb-3">
            <ShieldCheck className="w-3 h-3" aria-hidden="true" /> Human-in-the-loop console
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{authed ? "Authenticated" : "Welcome back"}</h1>
          <p className="text-sm text-slate-500 mt-1.5">{authed ? "Verifying identity — entering the command center…" : "Sign in to the compliance console."}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required disabled={busy || authed} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required disabled={busy || authed} />
            </div>
            {error ? (
              <div className="rounded-lg border border-status-danger/40 bg-status-danger-soft px-3 py-2 text-xs text-red-300 status-flash" role="alert">
                {error}
              </div>
            ) : null}
            <button type="submit" className="btn-primary w-full !py-2.5 !justify-center group" disabled={busy || authed}>
              {busy ? "Authenticating…" : authed ? "Entering…" : "Sign In"}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </form>

          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
              <span>Server-side sessions with role-based enforcement.</span>
            </div>
            <div className="rounded-lg border border-surface-700 bg-surface-850 p-3 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 mb-1.5 font-semibold text-slate-300">
                <KeyRound className="w-3 h-3 text-accent" aria-hidden="true" /> Demo accounts
              </div>
              <div className="flex flex-col gap-1">
                <span><span className="text-slate-200">reviewer@nexus-comply.sih</span> / demo-reviewer — Security Review Lead</span>
                <span><span className="text-slate-200">analyst@nexus-comply.sih</span> / demo-analyst — Security Analyst (view-only)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2.5 max-w-md text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            AI-generated findings always land in a <span className="text-slate-300">Human Review Queue</span>. Reviewers approve, reject, or correct each finding before it counts as verified compliance. Analysts retain view-only access.
          </span>
        </div>

        <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowRight className="w-3.5 h-3.5 rotate-180" aria-hidden="true" /> Back to product overview
        </Link>
      </div>
    </div>
  );
}