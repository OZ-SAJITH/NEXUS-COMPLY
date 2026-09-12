import type { DemoSintPilotScenario } from "@nexus/shared-types";
import { useNavigate } from "react-router-dom";
import { FlaskConical, ArrowRight, AlertTriangle, UserCheck } from "lucide-react";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { LoadingScreen } from "../../components/LoadingScreen";
import { GovTabs } from "./GovTabs";
import { useState } from "react";

export default function ScenarioLabPage() {
  const { data: scenarios, loading, error, refresh } = useAsyncData<DemoSintPilotScenario[]>(() => api.gov.scenarios(), []);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !scenarios) return <LoadingState label="Loading scenario catalog…" />;
  if (error && !scenarios) return <ErrorState title="Could not load scenarios" detail={error} onRetry={refresh} />;
  if (!scenarios) return null;

  const runScenario = async (s: DemoSintPilotScenario) => {
    setBusy(s.id);
    try {
      const change = await api.gov.createChangeFromScenario(s.id);
      navigate(`/app/governance/changes/${change.id}`);
    } catch {
      setBusy(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Scenario Lab"
        subtitle="End-to-end change-governance walkthroughs. Each scenario drafts a realistic change, runs AI analysis, simulation, safety-gate approvals and rollback."
      />
      <GovTabs />
      {busy ? <LoadingScreen label="Drafting change from scenario…" fullScreen={false} /> : null}

      <div className="grid md:grid-cols-2 gap-4">
        {scenarios.map((s) => (
          <div key={s.id} className="card !p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-lg border border-accent/20 bg-accent/10 flex items-center justify-center text-lg" aria-hidden="true">
                  {s.icon}
                </span>
                <div>
                  <div className="font-semibold text-slate-100">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.industry}</div>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-surface-700 rounded px-1.5 py-0.5">{s.orgProfile.size}</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>

            <div className="rounded-lg bg-surface-800/60 border border-surface-700 p-3">
              <div className="text-sm font-medium text-slate-200">{s.change.title}</div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{s.change.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-surface-700 bg-surface-800 text-[10px] text-slate-400">
                  <AlertTriangle className="w-3 h-3 text-red-400" aria-hidden="true" /> {s.change.flagsException ? s.change.exceptionType?.replaceAll("_", " ") ?? "exception" : "no exception"}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-surface-700 bg-surface-800 text-[10px] text-slate-400">
                  <UserCheck className="w-3 h-3 text-accent" aria-hidden="true" /> {s.change.fourEyes ? "four-eyes" : "single approval"}
                </span>
                <span className="px-2 py-0.5 rounded border border-surface-700 bg-surface-800 text-[10px] text-slate-400 font-mono">{s.change.targetSystems.length} targets</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 leading-relaxed">
              <span className="text-slate-400 font-semibold">Expected story:</span> {s.change.expectedStory.join(" → ")}
            </div>

            <button className="btn-primary text-sm w-full !justify-center mt-auto" onClick={() => runScenario(s)} disabled={busy !== null}>
              <FlaskConical className="w-4 h-4" aria-hidden="true" />
              Run scenario
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}