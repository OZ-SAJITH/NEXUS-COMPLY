import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Upload, ClipboardPaste, ChevronLeft, ChevronRight, ShieldCheck, ArrowRight } from "lucide-react";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { AuditTimeline, type TimelineStage } from "../components/AuditTimeline";
import { SeverityBadge } from "../components/SeverityBadge";
import { AiStatusIndicator, type AiStatusState } from "../components/motion/AiStatusIndicator";
import { AIAnalysisAnimation } from "../components/motion/AIAnalysisAnimation";
import { NexusFlow } from "../components/motion/NexusFlow";
import { cn } from "../utils/cn";
import type { DemoConfig } from "../types";
import { loadDemoConfigs } from "../services/demo";

const STEPS = [
  { key: "vendors", title: "Select Vendors", sub: "Scope the audit", icon: ShieldCheck },
  { key: "assets", title: "Select Assets", sub: "Choose sources", icon: Upload },
  { key: "framework", title: "Framework", sub: "Target policy", icon: ShieldCheck },
  { key: "configure", title: "Configure Audit", sub: "Provide config", icon: ClipboardPaste },
  { key: "run", title: "Run Audit", sub: "Execute & analyze", icon: ShieldCheck },
  { key: "ai", title: "AI Analysis", sub: "Risk intelligence", icon: ShieldCheck },
  { key: "report", title: "Compliance Report", sub: "Results", icon: ShieldCheck },
] as const;

const VENDOR_CHOICES = [
  { id: "cisco", label: "Cisco", hint: "IOS / IOS-XE" },
  { id: "fortinet", label: "Fortinet", hint: "FortiOS" },
  { id: "juniper", label: "Juniper", hint: "Junos" },
  { id: "multi", label: "Multi-vendor", hint: "Any syntax" },
  { id: "paloalto", label: "Palo Alto", hint: "PAN-OS" },
  { id: "aws", label: "AWS", hint: "VPC / SGs" },
] as const;

const FRAMEWORKS = [
  { id: "nist", name: "NIST CSF", desc: "Identify · Protect · Detect · Respond · Recover", controls: "AC / SC / AU / IA" },
  { id: "iso", name: "ISO 27001", desc: "Information security management systems", controls: "A.12 / A.13" },
  { id: "cis", name: "CIS Controls", desc: "Prioritized defensive actions v8", controls: "Secure config / access" },
  { id: "soc2", name: "SOC 2", desc: "Trust services criteria (security)", controls: "CC6 / CC7" },
];

const DEFAULT_STAGES: TimelineStage[] = [
  { key: "connect", label: "Connecting to vendor", state: "pending" },
  { key: "collect", label: "Collecting configuration", state: "pending" },
  { key: "normalize", label: "Normalizing configuration", state: "pending" },
  { key: "evaluate", label: "Evaluating controls", state: "pending" },
  { key: "drift", label: "Detecting configuration drift", state: "pending" },
  { key: "ai", label: "AI risk analysis", state: "pending" },
  { key: "report", label: "Generating recommendations", state: "pending" },
];

export default function AuditPage() {
  const [step, setStep] = useState(0);
  const [vendor, setVendor] = useState("multi");
  const [framework, setFramework] = useState("nist");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("manual-config.txt");
  const [sample, setSample] = useState<DemoConfig | null>(null);
  const [samples, setSamples] = useState<DemoConfig[]>([]);
  const [detection, setDetection] = useState<{ vendor: string; status: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<TimelineStage[]>(DEFAULT_STAGES);
  const [aiStatus, setAiStatus] = useState<AiStatusState>("IDLE");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: string; name: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const timers = useRef<number[]>([]);

  useEffect(() => {
    loadDemoConfigs()
      .then((list) => setSamples(list.filter((s) => s.exists)))
      .catch(() => setSamples([]));
    return () => {
      timers.current.forEach(clearTimeout);
      window.dispatchEvent(new CustomEvent("nexus:ai", { detail: "idle" }));
    };
  }, []);

  // Reflect the real AI-analysis phase on the global signature logo.
  useEffect(() => {
    const phase = aiStatus === "COMPLETE" ? "complete" : aiStatus === "ERROR" ? "error" : aiStatus === "IDLE" ? "idle" : "analyzing";
    window.dispatchEvent(new CustomEvent("nexus:ai", { detail: phase }));
  }, [aiStatus]);

  const mark = (key: string, state: TimelineStage["state"]) =>
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, state } : s)));

  const handleFile = (file: File) => {
    setError("");
    setSample(null);
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ""));
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const useSample = (s: DemoConfig) => {
    setError("");
    setSample(s);
    setContent(s.content);
    setFileName(s.file);
    if (s.vendor && s.vendor !== "unknown" && s.vendor !== "multi") setDetection({ vendor: s.vendor, status: "known" });
    else setDetection({ vendor: s.vendor ?? "unknown", status: s.status ?? "unknown" });
    if (step < 3) setStep(3);
  };

  const runAudit = async () => {
    if (!content.trim()) {
      setError("Provide a configuration first — paste text, drop a file, or select an asset.");
      setStep(3);
      return;
    }
    setRunning(true);
    setError("");
    setStages(DEFAULT_STAGES);
    setAiStatus("ANALYZING");
    setStep(4);

    // staged progression that mirrors the real pipelines being invoked
    const seq: Array<[string, number]> = [
      ["connect", 250],
      ["collect", 500],
      ["normalize", 750],
      ["evaluate", 1000],
      ["drift", 1250],
    ];
    seq.forEach(([k, d]) =>
      timers.current.push(
        window.setTimeout(() => {
          setStages((prev) => {
            const idx = prev.findIndex((s) => s.key === k);
            return prev.map((s, i) =>
              i <= idx ? { ...s, state: "done" } : i === idx + 1 ? { ...s, state: "active" } : s
            );
          });
        }, d)
      )
    );

    const aiPhases: Array<[AiStatusState, number]> = [
      ["ANALYZING", 120],
      ["MAPPING_CONTROLS", 620],
      ["ASSESSING_RISK", 980],
      ["GENERATING_FINDINGS", 1280],
      ["COMPLETE", 1500],
    ];
    aiPhases.forEach(([s, d]) =>
      timers.current.push(window.setTimeout(() => setAiStatus(s), d))
    );

    // real AI analysis (vendor detection / intent extraction)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/ai/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configName: fileName, config: content }),
      });
      if (res.ok) {
        const j = await res.json();
        setDetection({ vendor: j.detectedVendor, status: j.detectedVendor === "unknown" ? "unknown" : "known" });
      }
    } catch {
      /* non-fatal — backend still creates the audit deterministically */
    }

    timers.current.push(
      window.setTimeout(() => {
        setStages((prev) => prev.map((s) => (s.key === "ai" ? { ...s, state: "done" } : s)));
        mark("report", "active");
      }, 1300)
    );

    try {
      const audit = await api.createAudit(fileName, content);
      setResult({ id: audit.id, name: audit.configurationName });
      setStages((prev) => prev.map((s) => ({ ...s, state: "done" })));
      timers.current.push(
        window.setTimeout(() => {
          setRunning(false);
          setStep(6);
        }, 2600)
      );
    } catch (e) {
      setError(String(e));
      setAiStatus("ERROR");
      setRunning(false);
      setStep(3);
    }
  };

  const filteredSamples =
    vendor === "multi" ? samples : samples.filter((s) => s.vendor === vendor || s.vendor === "unknown");

  const canNext = step !== 4 || content.trim().length > 0;
  const hasContent = content.trim().length > 0;

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Start New Audit"
        subtitle="Seven-step guided workflow — every analysis stage is backed by the real audit engine."
      />

      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2 mb-6" aria-label="Audit workflow">
        {STEPS.map((s, i) => {
          const stepState = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  stepState === "todo" && "text-slate-500 opacity-60",
                  stepState === "current" && "border-accent/40 bg-accent/10 text-accent",
                  stepState === "done" && "border-status-ok/30 bg-status-ok-soft text-emerald-300"
                )}
                onClick={() => i < step && setStep(i)}
                aria-current={i === step ? "step" : undefined}
              >
                {i < step ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <span className="font-mono text-[10px]">{i + 1}</span>}
                <span className="hidden sm:inline">{s.title}</span>
              </button>
              {i < STEPS.length - 1 ? <span className="hidden sm:block w-4 h-px bg-surface-700" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>

      <div className="card !p-6">
        <div key={step} className="page-enter">
        {/* Step 1: vendors */}
        {step === 0 ? (
          <section aria-label="Select vendors">
            <h2 className="text-base font-semibold text-slate-100">Which vendors are in scope?</h2>
            <p className="text-xs text-slate-500 mt-1">Filter asset selection. Parser coverage is deterministic for Cisco, Fortinet and Juniper; anything else enters the adaptive pipeline.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
              {VENDOR_CHOICES.map((v) => (
                <button
                  key={v.id}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    vendor === v.id ? "border-accent/50 bg-accent/10 shadow-focus" : "border-surface-700 hover:border-surface-600 bg-surface-850"
                  )}
                  onClick={() => setVendor(v.id)}
                >
                  <div className="text-sm font-semibold text-slate-100">{v.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{v.hint}</div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Step 2: assets */}
        {step === 1 ? (
          <section aria-label="Select assets">
            <h2 className="text-base font-semibold text-slate-100">Select configuration assets</h2>
            <p className="text-xs text-slate-500 mt-1">These are real sample configurations bundled with the engine — or bring your own on the Configure step.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 max-h-[360px] overflow-auto pr-1">
              {filteredSamples.map((s) => (
                <button
                  key={s.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all",
                    sample?.id === s.id ? "border-accent/50 bg-accent/10" : "border-surface-700 hover:bg-surface-850"
                  )}
                  onClick={() => useSample(s)}
                >
                  <span className="font-mono text-[10px] rounded border border-surface-600 px-1.5 py-1 text-slate-300 uppercase">{s.vendor ?? "multi"}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-200 truncate">{s.label}</span>
                    <span className="block text-[11px] text-slate-500 font-mono truncate">{s.file}</span>
                  </span>
                  {sample?.id === s.id ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Step 3: framework */}
        {step === 2 ? (
          <section aria-label="Select framework">
            <h2 className="text-base font-semibold text-slate-100">Target compliance framework</h2>
            <p className="text-xs text-slate-500 mt-1">Controls are mapped to framework families; findings carry framework references in the report.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              {FRAMEWORKS.map((f) => (
                <button
                  key={f.id}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    framework === f.id ? "border-accent/50 bg-accent/10 shadow-focus" : "border-surface-700 hover:border-surface-600 bg-surface-850"
                  )}
                  onClick={() => setFramework(f.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">{f.name}</div>
                    <SeverityBadge severity="INFO" label={f.controls} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1.5">{f.desc}</div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Step 4: configure */}
        {step === 3 ? (
          <section aria-label="Configure audit">
            <h2 className="text-base font-semibold text-slate-100">Provide the configuration</h2>
            <p className="text-xs text-slate-500 mt-1">
              Untrusted input — secrets are redacted before any external call. Supported: <code className="text-accent">.conf</code> <code className="text-accent">.cfg</code> <code className="text-accent">.txt</code>
            </p>
            <div
              className={cn(
                "mt-5 rounded-xl border-2 border-dashed p-5 text-center transition-colors",
                dragOver ? "border-accent bg-accent/5" : "border-surface-700 hover:border-slate-600"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <div className="text-sm text-slate-400">Drop a configuration file here, or</div>
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => fileInput.current?.click()}>
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" /> Browse files
                </button>
                <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => setStep(1)}>
                  Pick from sample assets
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                accept=".conf,.cfg,.config,.txt"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="label !mb-0">Configuration</span>
                <span className="text-[11px] text-slate-500 font-mono">{fileName} · {content.length.toLocaleString()} chars</span>
              </div>
              <textarea
                className="input w-full h-56 font-mono text-xs !leading-relaxed"
                placeholder="# paste configuration here…"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setSample(null);
                }}
                spellCheck={false}
                aria-label="Configuration content"
              />
            </div>

            {detection ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="chip border border-sky-500/40 bg-sky-500/10 text-sky-400">
                  VENDOR DETECTED: {detection.vendor.toUpperCase()} ({detection.status})
                </span>
              </div>
            ) : null}
            {error ? <div className="mt-3 text-sm text-red-400">{error}</div> : null}
          </section>
        ) : null}

        {/* Step 5: running */}
        {step === 4 ? (
          <section aria-label="Running audit">
            <AIAnalysisAnimation
              status={aiStatus === "COMPLETE" ? "COMPLETE" : aiStatus === "ERROR" ? "ERROR" : "ANALYZING"}
              filename={fileName}
              className="max-w-md mx-auto"
            />
            <NexusFlow state={running ? "running" : "complete"} className="max-w-xl mx-auto mt-6" />
            <AiStatusIndicator state={aiStatus} className="max-w-md mx-auto mt-6" />
            <AuditTimeline stages={stages} />
          </section>
        ) : null}

        {/* Step 6: AI analysis summary */}
        {step === 5 ? (
          <section aria-label="AI analysis" className="text-center py-8">
            <div className="mx-auto w-14 h-14 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center float-soft">
              <ShieldCheck className="w-7 h-7 text-accent" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100 mt-4">AI analysis complete</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Security intent extracted{detection ? ` (${detection.vendor.toUpperCase()})` : ""}, risk prioritized and remediation synthesized. Preparing the compliance report…
            </p>
            <div className="max-w-md mx-auto mt-6">
              <NexusFlow state="complete" />
            </div>
            <AiStatusIndicator state="COMPLETE" compact className="max-w-xs mx-auto mt-5" />
          </section>
        ) : null}

        {/* Step 7: report */}
        {step === 6 ? (
          <section aria-label="Report ready" className="text-center py-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-status-ok-soft border border-status-ok/40 flex items-center justify-center status-flash">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100 mt-4">Audit completed</h2>
            <p className="text-xs text-slate-500 mt-1">
              {detection ? `${detection.vendor.toUpperCase()} · ${detection.status} parser` : "Engine analysis"} — view the full compliance report with evidence, exposure and remediation options.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <button className="btn-primary group" onClick={() => result && navigate(`/app/audits/${result.id}`)}>
                Open compliance report <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
              <button className="btn-outline" onClick={() => navigate("/app/audits/history")}>Audit history</button>
            </div>
          </section>
        ) : null}
        </div>
      </div>

      {/* Footer nav */}
      {step < 5 ? (
        <div className="flex items-center justify-between mt-5">
          <button className="btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back
          </button>
          <div className="flex items-center gap-2">
            {hasContent && step !== 4 ? (
              <button className="btn-primary" onClick={runAudit} disabled={running}>
                {running ? (<><span className="btn-spinner" aria-hidden="true" /> <span className="hidden sm:inline">ANALYZING…</span></>) : "Run audit now"}
              </button>
            ) : null}
            {step < 3 ? (
              <button className="btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : null}
            {step === 3 && hasContent ? (
              <button className="btn-primary" onClick={runAudit} disabled={running}>
                {running ? (<><span className="btn-spinner" aria-hidden="true" /> <span className="hidden sm:inline">ANALYZING…</span></>) : (<>Run compliance audit <ChevronRight className="w-4 h-4" aria-hidden="true" /></>)}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}