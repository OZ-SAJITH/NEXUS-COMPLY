import { Link } from "react-router-dom";
import type { AssetRecord } from "@nexus/shared-types";
import { SeverityBadge, StatusBadge } from "../ui";
import { cn, timeAgo } from "../../utils/cn";
import { AssetStatusChip } from "./AssetStatusChip";

/** Compact, linked asset identity card — name/hostname/IP, type/vendor/tier,
 *  placement, compliance, risk band and last-scan recency. Shared by pages that
 *  surface a single asset and link into its enterprise detail. */
export function AssetCard({ asset, className }: { asset: AssetRecord; className?: string }) {
  return (
    <Link
      to={`/app/enterprise/assets/${asset.id}`}
      className={cn("card !p-3 block hover:border-accent/40 focus-visible:outline-none", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">{asset.name}</div>
          <div className="text-[11px] text-slate-500 font-mono truncate">{asset.hostname}</div>
          <div className="text-[11px] text-slate-600 font-mono">{asset.ipAddress}</div>
        </div>
        <AssetStatusChip criticality={asset.criticality} />
      </div>
      <div className="mt-2 text-[11px] text-slate-500">{asset.assetType} · {asset.vendor} · {asset.location.tier}</div>
      <div className="mt-1 text-[11px] text-slate-500">
        {asset.siteLabel} ({asset.regionLabel}) · {asset.location.networkZone} zone
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {asset.complianceStatus ? <StatusBadge status={asset.complianceStatus} /> : <span className="text-slate-600">unscanned</span>}
        {asset.riskScore !== undefined ? <SeverityBadge severity={asset.riskBand ?? "LOW"} /> : null}
        <span className="text-slate-600">{asset.lastScannedAt ? `scanned ${timeAgo(asset.lastScannedAt)}` : "never scanned"}</span>
      </div>
    </Link>
  );
}