import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { DashboardStats, Severity } from "../types";

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#f59e0b",
  LOW: "#facc15",
  INFO: "#64748b",
};

const VENDOR_COLORS: Record<string, string> = {
  cisco: "#0ea5e9",
  fortinet: "#f97316",
  juniper: "#a78bfa",
  unknown: "#64748b",
};

export function ComplianceDonut({ stats }: { stats: DashboardStats }) {
  const data = [
    { name: "Passed", value: stats.compliance.passed, color: "#10b981" },
    { name: "Failed", value: stats.compliance.failed, color: "#dc2626" },
    { name: "Warnings", value: stats.compliance.warnings, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3} stroke="none">
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#131c31", border: "1px solid #1b2740", borderRadius: 8 }} itemStyle={{ color: "#e2e8f0" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 -mt-2">
        {data.map((d) => (
          <span key={d.name} className="text-xs text-slate-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} /> {d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}

export function RiskBarChart({ stats }: { stats: DashboardStats }) {
  const data = (Object.keys(SEV_COLORS) as Severity[]).map((sev) => ({
    name: sev.toLowerCase(),
    count: stats.risk[sev] ?? 0,
    color: SEV_COLORS[sev],
  }));

  return (
    <div className="h-[190px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.08)" />
          <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={70} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "#131c31", border: "1px solid #1b2740", borderRadius: 8 }} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VendorDistribution({ stats }: { stats: DashboardStats }) {
  const data = (Object.keys(stats.vendorDistribution) as Array<keyof typeof stats.vendorDistribution>).map((v) => ({
    name: v,
    count: stats.vendorDistribution[v],
    color: VENDOR_COLORS[v] ?? "#64748b",
  }));
  return (
    <div className="h-[190px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.08)" />
          <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "#131c31", border: "1px solid #1b2740", borderRadius: 8 }} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PostureRing({ posture }: { posture: number }) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={posture >= 70 ? "#10b981" : posture >= 40 ? "#f59e0b" : "#dc2626"}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(posture / 100) * 314} 314`}
            style={{ transition: "stroke-dasharray 600ms" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-slate-100">{posture}</div>
          <div className="text-[10px] text-slate-500">/100</div>
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-200">Overall Security Posture</div>
        <div className="text-xs text-slate-500 mt-1">Blend of compliance score and inverse of overall risk.</div>
      </div>
    </div>
  );
}