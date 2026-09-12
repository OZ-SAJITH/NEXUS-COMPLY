import { useMemo, useState } from "react";
import type { DependencyNode, GraphNodeType } from "@nexus/shared-types";
import { GRAPH_NODE_META } from "@nexus/governance-core";
import { RiskBandPill } from "./RiskBandPill";

const TYPE_ORDER: GraphNodeType[] = [
  "organization",
  "application",
  "service",
  "api",
  "database",
  "identity",
  "cloud",
  "asset",
  "vendor",
  "subvendor",
  "legacy",
];

export function DependencyGraphView({ nodes }: { nodes: DependencyNode[] }) {
  const layout = useMemo(() => {
    const depth = new Map<string, number>();
    const roots = nodes.filter((n) => n.type === "organization" || n.type === "application");
    roots.forEach((r) => depth.set(r.id, 0));
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach((n) => {
        if (depth.has(n.id)) return;
        n.edges.forEach((e) => {
          const d = depth.get(e.to);
          if (d !== undefined && (depth.get(n.id) === undefined || depth.get(n.id)! > d + 1)) {
            depth.set(n.id, d + 1);
            changed = true;
          }
        });
      });
    }
    nodes.forEach((n) => {
      if (!depth.has(n.id)) depth.set(n.id, 99);
    });
    const maxDepth = Math.min(Math.max(...Array.from(depth.values())), 5);
    const cols: DependencyNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((n) => {
      const d = Math.min(depth.get(n.id) ?? 99, maxDepth);
      cols[d].push(n);
    });
    const colH = 260;
    const colW = 240;
    const perCol = Math.max(...cols.map((c) => c.length), 1);
    const positions = new Map<string, { x: number; y: number }>();
    cols.forEach((col, ci) => {
      const cx = 90 + ci * colW;
      col.forEach((n, i) => {
        const cy = 70 + (i + 0.5) * ((colH - 60) / Math.max(col.length, 1)) + (col.length < perCol ? (perCol - col.length) * ((colH - 60) / perCol) / 2 : 0);
        positions.set(n.id, { x: cx, y: cy });
      });
    });
    return { depths: cols, positions, maxDepth };
  }, [nodes]);

  const [selected, setSelected] = useState<DependencyNode | null>(nodes.find((n) => n.type === "organization") ?? nodes[0] ?? null);

  const edges = useMemo(() => {
    const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    nodes.forEach((n) => {
      const p = layout.positions.get(n.id);
      if (!p) return;
      n.edges.forEach((e) => {
        const q = layout.positions.get(e.to);
        if (!q) return;
        out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
      });
    });
    return out;
  }, [nodes, layout.positions]);

  return (
    <div className="grid lg:grid-cols-[1fr_260px] gap-4">
      <div className="overflow-x-auto rounded-xl border border-surface-700 bg-surface-900/40 p-2">
        <svg viewBox="0 0 1240 300" className="w-full min-w-[900px]" role="img" aria-label="Dependency and vendor graph">
          {edges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#1e2c49" strokeWidth="1" />
          ))}
          {layout.depths.map((col, ci) => (
            <g key={ci}>
              <text x={90 + ci * 240} y={24} textAnchor="middle" fill="#334155" fontSize="8" letterSpacing="1.5" style={{ fontWeight: 600 }}>
                TIER {ci}
              </text>
              {col.map((n) => {
                const p = layout.positions.get(n.id);
                if (!p) return null;
                const meta = GRAPH_NODE_META[n.type];
                const active = selected?.id === n.id;
                return (
                  <g
                    key={n.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(n)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.label}, ${n.type}`}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(n)}
                  >
                    <circle cx={p.x} cy={p.y} r={15} fill="#0e1628" stroke={meta.color} strokeWidth={active ? 3 : 1.5} className={active ? "animate-pulse-dot" : ""} />
                    <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="8.5" fill={meta.color} style={{ fontWeight: 700 }}>
                      {n.label.slice(0, 3).toUpperCase()}
                    </text>
                    {active ? (
                      <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize="8.5" fill={meta.color} style={{ fontWeight: 600 }}>
                        {n.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          ))}
          <g>
            {TYPE_ORDER.map((t, i) => {
              const meta = GRAPH_NODE_META[t];
              return (
                <text key={t} x={10 + i * 128} y={292} fill={meta.color} fontSize="8">
                  ● {meta.label}
                </text>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="rounded-xl border border-surface-700 bg-surface-850/60 p-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Selected node</div>
        {selected ? (
          <div className="mt-2 space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">{selected.label}</div>
              <div className="text-xs text-slate-500 capitalize">{selected.type}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-surface-800 border border-surface-700 p-2">
                <div className="text-slate-500">Criticality</div>
                <RiskBandPill band={selected.criticality} className="mt-1" />
              </div>
              <div className="rounded-lg bg-surface-800 border border-surface-700 p-2">
                <div className="text-slate-500">Risk</div>
                <RiskBandPill band={selected.risk} className="mt-1" />
              </div>
              <div className="rounded-lg bg-surface-800 border border-surface-700 p-2 col-span-2">
                <div className="text-slate-500">Findings</div>
                <div className="text-slate-200 font-mono">{selected.findings}</div>
              </div>
            </div>
            <div className="text-xs text-slate-500 leading-relaxed">
              <span className="text-slate-400 font-medium">Connections:</span> {selected.edges.map((e) => e.to).join(", ") || "none"}
            </div>
            {selected.description ? <p className="text-xs text-slate-500 leading-relaxed">{selected.description}</p> : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500 mt-2">Select a node to inspect risk posture.</p>
        )}
      </div>
    </div>
  );
}