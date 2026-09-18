import { useState } from "react";
import { Radar } from "lucide-react";
import { api } from "../../services/api";

/**
 * Discovery run affordance — kicks off a discovery pass over the simulated
 * estate and reports the result notice back to the host page. Named as the
 * reusable entry point for the discovery workflow (plan §3).
 */
export function DiscoveryWizard({
  onResult,
  onComplete,
  className,
}: {
  onResult?: (notice: string) => void;
  onComplete?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.enterprise.discover();
      const regions = new Set(r.assets.map((a) => a.regionLabel).filter(Boolean));
      onResult?.(
        `Discovery run ${r.runId}: ${r.discovered} new assets discovered across ${regions.size} region${regions.size === 1 ? "" : "s"}, ${r.updated} updated.`
      );
      onComplete?.();
    } catch (e) {
      onResult?.(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={run} disabled={busy} className={className ?? "btn-primary text-sm inline-flex items-center gap-2"}>
      <Radar className="w-4 h-4" aria-hidden="true" /> {busy ? "Discovering…" : "Discover Assets"}
    </button>
  );
}