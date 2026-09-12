import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Radar,
  Shuffle,
  ShieldCheck,
  Activity,
  GitCompareArrows,
  BrainCircuit,
  Wrench,
  Eye,
  Database,
  Network,
  Lock,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { AnimatedNexusLogo } from "../components/motion/AnimatedNexusLogo";
import { ComplianceRing } from "../components/ComplianceRing";
import { api } from "../services/api";
import type { DashboardStats } from "../types";

const VENDORS = ["Cisco", "Fortinet", "Palo Alto", "Juniper", "AWS", "Microsoft"];

const PAINS = [
  { title: "Different vendors", text: "Cisco, Fortinet, Juniper — each speaks its own configuration dialect." },
  { title: "Different configurations", text: "The same security intent expressed in incompatible syntax." },
  { title: "Different security controls", text: "Every framework wants different evidence from the same boxes." },
  { title: "Manual audits", text: "Spreadsheets and SSH sessions instead of continuous measurement." },
  { title: "Configuration drift", text: "Baselines that quietly rot while auditors are elsewhere." },
];

const PIPELINE = [
  { icon: Radar, step: "01", title: "Discover", text: "Ingest raw device configurations from any vendor." },
  { icon: Shuffle, step: "02", title: "Normalize", text: "Map vendor syntax to a vendor-neutral Security Intent." },
  { icon: ShieldCheck, step: "03", title: "Audit", text: "Evaluate controls against target policy and frameworks." },
  { icon: GitCompareArrows, step: "04", title: "Detect drift", text: "Flag deviations from the approved security baseline." },
  { icon: BrainCircuit, step: "05", title: "AI risk analysis", text: "Score and prioritize findings with explainable evidence." },
  { icon: Wrench, step: "06", title: "Remediation", text: "Generate actionable, safety-simulated fixes." },
];

const EXPLAIN_CHAIN = [
  { icon: Database, label: "RAW DATA" },
  { icon: Shuffle, label: "NORMALIZATION" },
  { icon: ShieldCheck, label: "CONTROL EVALUATION" },
  { icon: Eye, label: "EVIDENCE" },
  { icon: BrainCircuit, label: "AI ANALYSIS" },
  { icon: Network, label: "RISK PRIORITIZATION" },
  { icon: Wrench, label: "RECOMMENDATION" },
];

export default function LandingPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  useEffect(() => {
    api.getDashboard().then(setStats).catch(() => setStats(null));
  }, []);
  const posture = stats?.posture ?? 92;

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-surface-800/60 bg-surface-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" aria-label="NEXUS-COMPLY home">
            <Logo size={38} />
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400" aria-label="Product">
            <a href="#problem" className="hover:text-slate-100 transition-colors">The problem</a>
            <a href="#how" className="hover:text-slate-100 transition-colors">How it works</a>
            <a href="#explain" className="hover:text-slate-100 transition-colors">Explainable AI</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/app" className="btn-ghost !px-3 !py-2 text-sm">Open workspace</Link>
            <Link to="/app/audits/new" className="btn-primary !px-3 !py-2 text-sm hidden sm:inline-flex">
              Start Security Audit
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-grid">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 lg:pt-24 pb-16 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-3">
              <AnimatedNexusLogo state={(stats?.review?.pending ?? 0) > 0 ? "REVIEW_REQUIRED" : "IDLE"} size={48} intro interactive />
              <span className="text-2xl font-extrabold tracking-tight text-slate-100">NEXUS-COMPLY</span>
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" aria-hidden="true" />
              Adaptive · evidence-driven · multi-vendor
            </div>
            <h1 className="mt-5 text-4xl lg:text-5xl font-extrabold leading-[1.1] text-slate-100">
              AI-Driven Multi-Vendor
              <br />
              <span className="text-gradient">Network Security Compliance Auditor</span>
            </h1>
            <p className="mt-5 text-base text-slate-400 max-w-xl leading-relaxed">
              Continuously audit, normalize, assess and prioritize security compliance across heterogeneous network infrastructure — with every AI conclusion backed by line-level evidence.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/app/audits/new" className="btn-primary !px-5 !py-2.5">
                Start Security Audit <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link to="/app" className="btn-outline !px-5 !py-2.5">View Demo</Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-accent" aria-hidden="true" /> Secrets redacted before analysis</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-status-ok" aria-hidden="true" /> Human-approved mappings</span>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative">
            <div className="glass !rounded-2xl !p-6">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Network posture</div>
                <span className="chip border border-status-ok/40 bg-status-ok-soft text-emerald-300">● LIVE</span>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-6">
                <ComplianceRing value={posture} size={150} stroke={12} sublabel="overall" />
                <div className="flex-1 min-w-[200px] space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-400">Compliance score</span><span className="text-slate-200 font-mono">{stats?.compliance.score ?? 92}%</span></div>
                    <div className="h-1.5 rounded-full bg-surface-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats?.compliance.score ?? 92}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-400">Control coverage</span><span className="text-slate-200 font-mono">{stats ? stats.adaptive.knownAnalyzed + stats.adaptive.unknownDetected : 247} assets</span></div>
                    <div className="h-1.5 rounded-full bg-surface-800"><div className="h-full rounded-full bg-accent" style={{ width: "88%" }} /></div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {["cisco", "fortinet", "juniper"].map((v) => (
                      <span key={v} className="chip border border-surface-600 text-slate-300 uppercase text-[10px]">{v}</span>
                    ))}
                    <span className="chip border border-accent/40 text-accent uppercase text-[10px]">+ adaptive</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-3 rounded-lg border border-accent/30 bg-surface-900/90 backdrop-blur px-4 py-2.5 shadow-lift float-soft">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">AI insight</div>
              <div className="text-xs text-slate-200 mt-0.5 max-w-[220px]">3 devices show config drift from the approved baseline.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted strip */}
      <section className="border-t border-surface-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-600">Trusted across your security stack</p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-10 gap-y-4">
            {VENDORS.map((v) => (
              <span key={v} className="text-lg font-semibold tracking-tight text-slate-500 hover:text-slate-300 transition-colors">{v}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">The problem</p>
          <h2 className="mt-3 text-3xl font-bold text-slate-100 max-w-3xl leading-tight">
            Security teams don't have a visibility problem. They have a <span className="text-gradient">consistency</span> problem.
          </h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PAINS.map((p, i) => (
              <div key={p.title} className="card card-hover !p-5 row-in" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="w-2 h-2 rounded-full bg-status-danger mt-1" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-200 mt-3">{p.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{p.text}</p>
              </div>
            ))}
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-5 flex items-center gap-3 row-in" style={{ animationDelay: `${PAINS.length * 70}ms` }}>
              <Activity className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
              <p className="text-xs text-slate-300 leading-relaxed">The same baseline, applied consistently — whatever box you sit in front of.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 border-t border-surface-800/60 bg-surface-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">How NEXUS-COMPLY works</p>
          <h2 className="mt-3 text-3xl font-bold text-slate-100">From raw configuration to prioritized action</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PIPELINE.map((s, i) => (
              <div key={s.step} className="card card-hover !p-5 row-in" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-center justify-between">
                  <s.icon className="w-5 h-5 text-accent" aria-hidden="true" />
                  <span className="font-mono text-xs text-slate-600">{s.step}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-100 mt-4">{s.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Explainability */}
      <section id="explain" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Explainable AI</p>
          <h2 className="mt-3 text-3xl font-bold text-slate-100 max-w-2xl leading-tight">
            An audit trail judges can follow — not a black box.
          </h2>
          <p className="mt-3 text-sm text-slate-400 max-w-2xl leading-relaxed">
            Every recommendation is the output of a transparent pipeline. AI never answers without evidence.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-2 lg:gap-3">
            {EXPLAIN_CHAIN.map((n, i) => (
              <div key={n.label} className="flex items-center gap-2 lg:gap-3 row-in" style={{ animationDelay: `${i * 80}ms` }}>
                {i > 0 ? <ArrowRight className="w-4 h-4 text-slate-600 hidden lg:block" aria-hidden="true" /> : null}
                <div className="rounded-lg border border-surface-700 bg-surface-900 px-3.5 py-2.5 flex items-center gap-2 transition-colors hover:border-accent/40 hover:bg-surface-850">
                  <n.icon className="w-4 h-4 text-accent" aria-hidden="true" />
                  <span className="text-xs font-medium text-slate-300">{n.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t border-surface-800/60 bg-grid">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold text-slate-100">Ready to close the consistency gap?</h2>
          <p className="mt-3 text-sm text-slate-400">Run your first audit in under a minute — no credentials, no setup.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/app/audits/new" className="btn-primary !px-6 !py-2.5">Start Security Audit</Link>
            <Link to="/app" className="btn-outline !px-6 !py-2.5">Open the workspace</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-surface-800/60 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Logo size={28} className="transition-opacity hover:opacity-90" />
          <p className="text-xs text-slate-600">NEXUS-COMPLY · Smart India Hackathon prototype · evidence-driven adaptive compliance · Developed by Sajith</p>
        </div>
      </footer>
    </div>
  );
}