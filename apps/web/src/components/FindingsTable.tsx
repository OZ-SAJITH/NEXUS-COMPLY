import { Link } from "react-router-dom";
import type { Finding } from "@nexus/shared-types";
import { SeverityBadge, FindingStatusBadge } from "./SeverityBadge";
import { VENDOR_META } from "../demo/dashboard";
import { timeAgo } from "../utils/cn";

export interface FindingsRow {
  id: string;
  auditId: string;
  vendor: string;
  finding: Finding;
  detectedAt?: string;
  statusOverride?: string;
}

export function FindingsTable({ rows, limit }: { rows: FindingsRow[]; limit?: number }) {
  const visible = limit ? rows.slice(0, limit) : rows;
  if (!visible.length) {
    return <p className="text-sm text-slate-500">No findings to display.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-surface-700">
            <th scope="col" className="py-2.5 pr-3 font-medium">Severity</th>
            <th scope="col" className="py-2.5 pr-3 font-medium">Finding</th>
            <th scope="col" className="py-2.5 pr-3 font-medium">Vendor</th>
            <th scope="col" className="py-2.5 pr-3 font-medium">Asset</th>
            <th scope="col" className="py-2.5 pr-3 font-medium">Control</th>
            <th scope="col" className="py-2.5 pr-3 font-medium">Detected</th>
            <th scope="col" className="py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => {
            const vendorName = VENDOR_META[r.vendor]?.name ?? r.vendor ?? "—";
            return (
              <tr key={r.finding.id} className="border-b border-surface-800/70 last:border-0 hover:bg-surface-850/50 transition-colors row-in" style={{ animationDelay: `${Math.min(i, 14) * 40}ms` }}>
                <td className="py-2.5 pr-3">
                  <SeverityBadge severity={r.finding.severity} />
                </td>
                <td className="py-2.5 pr-3">
                  <Link to={`/app/findings/${r.finding.id}`} className="group text-slate-200 font-medium hover:text-accent transition-colors">
                    {r.finding.what || r.finding.controlName}
                    <span className="block h-px w-0 bg-accent/60 transition-all duration-200 group-hover:w-full" aria-hidden="true" />
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-slate-300">{vendorName}</td>
                <td className="py-2.5 pr-3 text-slate-400 truncate max-w-[160px]">{r.auditId}</td>
                <td className="py-2.5 pr-3">
                  <span className="font-mono text-xs text-accent/90">{r.finding.controlId}</span>
                </td>
                <td className="py-2.5 pr-3 text-slate-500">{timeAgo(r.detectedAt)}</td>
                <td className="py-2.5">
                  <FindingStatusBadge status={r.statusOverride ?? r.finding.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}