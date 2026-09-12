import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ConfigSetting } from "@nexus/shared-types";
import { PRESET_CONFIGS, GRAPH_NODES, findNodesByIds } from "@nexus/governance-core";
import { api } from "../../services/api";
import { PageHeader } from "../../components/PageHeader";
import { GovTabs } from "./GovTabs";
import { cn } from "../../utils/cn";
import { ArrowRight, AlertTriangle } from "lucide-react";

const PRESET_NAMES = Object.keys(PRESET_CONFIGS);

function ConfigEditor({ config, onChange, presetKey, onPreset }: { config: ConfigSetting[]; onChange: (c: ConfigSetting[]) => void; presetKey: string; onPreset: (k: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mr-1">Presets</span>
        {PRESET_NAMES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPreset(p)}
            className={cn(
              "px-2 py-1 rounded-md border text-[11px] transition-colors",
              presetKey === p ? "border-accent/40 bg-accent/10 text-accent" : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-surface-700 bg-surface-850/50 overflow-hidden">
        {config.map((row, i) => (
          <div key={row.key} className={cn("grid grid-cols-[1fr_auto_auto] sm:grid-cols-[130px_1fr_120px_140px] gap-2 items-center px-3 py-2", i > 0 && "border-t border-surface-800")}>
            <span className="text-[11px] font-mono text-slate-400 truncate">{row.label}</span>
            <input
              className="input !py-1 text-xs font-mono"
              value={row.value}
              aria-label={row.label}
              onChange={(e) => {
                const next = config.map((r, ri) => (ri === i ? { ...r, value: e.target.value } : r));
                onChange(next);
              }}
            />
            <span className="text-[10px] uppercase tracking-wider text-slate-600 hidden sm:block">{row.category}</span>
            <button
              type="button"
              className="text-[10px] text-red-400/80 hover:text-red-300 text-left"
              onClick={() => onChange(config.filter((_, ri) => ri !== i))}
            >
              remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-[11px] text-accent hover:bg-surface-800/40"
          onClick={() => onChange([...config, { key: `custom.${Date.now()}`, label: "New setting", value: "", category: "Custom" }])}
        >
          + add setting
        </button>
      </div>
    </div>
  );
}

export default function NewChangePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [benefit, setBenefit] = useState("");
  const [rollback, setRollback] = useState("");
  const [fourEyes, setFourEyes] = useState(false);
  const [targets, setTargets] = useState<string[]>(["identity", "gateway"]);
  const [beforeKey, setBeforeKey] = useState("MFA enforcement");
  const [afterKey, setAfterKey] = useState("TLS 1.3 only");
  const [before, setBefore] = useState<ConfigSetting[]>(PRESET_CONFIGS["MFA enforcement"].map((s) => ({ ...s })));
  const [after, setAfter] = useState<ConfigSetting[]>(PRESET_CONFIGS["TLS 1.3 only"].map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const serviceNodes = useMemo(() => GRAPH_NODES.filter((n) => ["service", "api", "database", "identity", "cloud", "application"].includes(n.type)), []);
  const targetLabels = useMemo(() => {
    const map = new Map(GRAPH_NODES.map((n) => [n.id, n.label]));
    return targets.map((t) => map.get(t) ?? t).join(", ");
  }, [targets]);

  const presetFor = (key: string) => PRESET_CONFIGS[key];

  const toggleTarget = (id: string) => setTargets((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const change = await api.gov.createChange({
        title: title.trim(),
        description: description.trim(),
        targetSystems: targets,
        configBefore: before,
        configAfter: after,
        reason: reason || "Improves security posture.",
        expectedBenefit: benefit || "Improved control coverage.",
        rollbackPlan: rollback || "Revert configuration to the documented baseline.",
        fourEyes,
      });
      navigate(`/app/governance/changes/${change.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Draft a change request"
        subtitle="Describe the change, its blast radius and the configuration delta. The engine will analyze, simulate and gate it on the next steps."
      />
      <GovTabs />

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200 flex items-center gap-2" role="alert">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" /> {error}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card !p-5 space-y-4">
          <div className="text-sm font-semibold text-slate-200">Change details</div>
          <label className="block">
            <span className="text-xs text-slate-500">Title</span>
            <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Enforce MFA on privileged access" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Description</span>
            <textarea className="input mt-1 min-h-[72px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is changing and why it matters…" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Reason / driver</span>
            <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. CIS / NIS2 control requirement" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Expected benefit</span>
            <input className="input mt-1" value={benefit} onChange={(e) => setBenefit(e.target.value)} placeholder="e.g. closes MFA gap across 3 services" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Rollback plan</span>
            <input className="input mt-1" value={rollback} onChange={(e) => setRollback(e.target.value)} placeholder="e.g. revert policy to documented baseline" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={fourEyes} onChange={(e) => setFourEyes(e.target.checked)} className="accent-[#38bdf8]" />
            Require four-eyes approval (two independent approvers)
          </label>
        </div>

        <div className="card !p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-200">Affected systems</div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Selected: <span className="font-mono text-slate-400">{targetLabels}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {serviceNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => toggleTarget(n.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md border text-xs transition-colors",
                  targets.includes(n.id) ? "border-accent/40 bg-accent/10 text-accent" : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200"
                )}
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Selected targets resolved to</div>
          <div className="text-xs text-slate-400 font-mono">{findNodesByIds(targets).map((n) => n.label).join(", ") || "—"}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card !p-5 space-y-2">
          <div className="text-sm font-semibold text-slate-200">Baseline configuration <span className="text-slate-500 text-[11px] font-normal">(before)</span></div>
          <ConfigEditor
            config={before}
            onChange={setBefore}
            presetKey={beforeKey}
            onPreset={(k) => {
              setBeforeKey(k);
              setBefore(presetFor(k).map((s) => ({ ...s })));
            }}
          />
        </div>
        <div className="card !p-5 space-y-2">
          <div className="text-sm font-semibold text-slate-200">Proposed configuration <span className="text-slate-500 text-[11px] font-normal">(after)</span></div>
          <ConfigEditor
            config={after}
            onChange={setAfter}
            presetKey={afterKey}
            onPreset={(k) => {
              setAfterKey(k);
              setAfter(presetFor(k).map((s) => ({ ...s })));
            }}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary text-sm" onClick={submit} disabled={busy}>
          {busy ? "Drafting…" : "Create change request"}
          {busy ? null : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}