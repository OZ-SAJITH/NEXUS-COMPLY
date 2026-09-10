import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadDemoConfigs } from "../services/demo";
import { api } from "../services/api";
import type { DemoConfig } from "../types";
import { cn } from "../utils/cn";

interface Props {
  onLoaded?: () => void;
  full?: boolean;
}

export function LoadDemoButton({ onLoaded, full }: Props) {
  const [open, setOpen] = useState(false);
  const [configs, setConfigs] = useState<DemoConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const openPicker = async () => {
    setError("");
    try {
      const list = await loadDemoConfigs();
      setConfigs(list);
      setOpen(true);
    } catch {
      setError("Could not load demo samples. Is the API running?");
    }
  };

  const runDemo = async (c: DemoConfig) => {
    setLoading(true);
    setError("");
    try {
      const audit = await api.createAudit(c.label, c.content);
      setOpen(false);
      onLoaded?.();
      navigate(`/audit/${audit.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const flagship = configs.find((c) => c.id === "unknown-custom");
  const insecure = configs.find((c) => c.id === "cisco-insecure");

  return (
    <>
      <button className={cn("btn-primary", full && "w-full !py-3 text-base")} onClick={openPicker} disabled={loading}>
        {loading ? "Running audit…" : "🚀 LOAD DEMO"}
      </button>
      {error ? <div className="text-xs text-red-400 mt-1">{error}</div> : null}

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Demo Scenarios</h3>
                <p className="text-xs text-slate-500">Pick a configuration to audit live. Every number you see is computed from actual findings.</p>
              </div>
              <button className="btn-outline !px-2" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                <div className="font-semibold text-amber-300 mb-2">Flagship: Adaptive Learning</div>
                {flagship ? (
                  <button className="w-full text-left rounded-lg border border-surface-700 hover:border-accent/50 p-3 transition-colors" onClick={() => runDemo(flagship)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{flagship.label}</div>
                        <div className="text-xs text-slate-500 mt-1">Unknown syntax → AI interpretation → confidence → human approval → reusable mapping</div>
                      </div>
                      <span className="chip border border-sky-500/40 bg-sky-500/10 text-sky-400">UNKNOWN</span>
                    </div>
                  </button>
                ) : null}
              </div>

              <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
                <div className="font-semibold text-sky-300 mb-2">Known Vendor Scenarios</div>
                <div className="grid md:grid-cols-2 gap-3">
                  {configs
                    .filter((c) => c.status === "known")
                    .map((c) => (
                      <button key={c.id} className="text-left rounded-lg border border-surface-700 hover:border-accent/50 p-3 transition-colors" onClick={() => runDemo(c)}>
                        <div className="text-sm font-medium text-slate-100">{c.label}</div>
                        <div className="text-xs text-slate-500 mt-1">{c.file}</div>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <button
                className="btn-outline w-full text-xs"
                onClick={() => runDemo(insecure!)}
                disabled={!insecure}
              >
                Quick path: Internet-facing administration exposure (Cisco) →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}