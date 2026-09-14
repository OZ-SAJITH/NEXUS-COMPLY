import type {
  AssetImpactGraph,
  AssetRecord,
  ImpactEdge,
  ImpactNode,
} from "@nexus/shared-types";

// ---------------------------------------------------------------------------
// Impact graph — how a finding on one asset can cascade to services,
// applications, databases and business data (based on simulated relationships).
// ---------------------------------------------------------------------------

const BIZ_BY_TAG: Record<string, { label: string; detail: string }> = {
  pii: { label: "Customer PII", detail: "Regulatory personal data" },
  pci: { label: "Cardholder Data", detail: "PCI DSS in-scope data" },
  "internet-facing": { label: "Internet Revenue Path", detail: "Customer-facing service" },
  "payment-border": { label: "Payment Border", detail: "Payment processing path" },
  "customer-data": { label: "Customer Master Data", detail: "CRM/customer records" },
};

function dataLabelFor(asset: AssetRecord): string | null {
  for (const tag of asset.tags ?? []) {
    if (BIZ_BY_TAG[tag]) return tag;
  }
  return null;
}

export function buildImpactGraph(asset: AssetRecord, allAssets: AssetRecord[]): AssetImpactGraph {
  const now = new Date().toISOString();
  const nodes: ImpactNode[] = [];
  const edges: ImpactEdge[] = [];
  const byId = new Map(allAssets.map((a) => [a.id, a]));
  const visited = new Set<string>();

  nodes.push({ id: asset.id, label: asset.name, kind: "asset", detail: `${asset.assetType} · ${asset.vendor}`, criticality: asset.criticality });

  const visit = (current: AssetRecord, reachedFrom: string) => {
    if (visited.has(current.id)) return;
    visited.add(current.id);

    for (const rel of current.relationships) {
      if (rel.fromAssetId !== current.id) continue;
      const target = byId.get(rel.toAssetId);
      if (!target || visited.has(target.id)) continue;

      const kind: ImpactNode["kind"] =
        target.assetType === "DATABASE" ? "database" : target.assetType === "API" || target.assetType === "APPLICATION" ? "application" : target.assetType === "MESSAGE_QUEUE" ? "service" : "service";
      nodes.push({ id: target.id, label: target.name, kind, detail: `${target.assetType} · ${target.vendor}`, criticality: target.criticality, reachedFrom });
      edges.push({ from: current.id, to: target.id, relation: rel.relation });
      visit(target, current.id);
    }
  };

  visit(asset, asset.id);

  const dataTag = dataLabelFor(asset) ?? dataLabelOfDependents(asset, byId);
  if (dataTag) {
    const biz = BIZ_BY_TAG[dataTag];
    const bizId = `biz-${dataTag}`;
    nodes.push({ id: bizId, label: biz.label, kind: "business", detail: biz.detail });
    const lastNode = nodes[nodes.length - 2];
    edges.push({ from: lastNode.id, to: bizId, relation: "exposes" });
  } else {
    nodes.push({ id: "biz-general", label: "Business Service Continuity", kind: "business", detail: "General business operations" });
    const last = nodes[nodes.length - 2];
    edges.push({ from: last.id, to: "biz-general", relation: "supports" });
  }

  const summary = [
    `Finding on ${asset.name} propagates to ${nodes.length - 1} related assets and business impact.`,
    asset.criticality === "CRITICAL"
      ? `${asset.name} is CRITICAL — impact on dependent services is considered high priority.`
      : `${asset.name} is ${asset.criticality.toLowerCase()} criticality.`,
    graphBlastSummary(asset),
  ];

  return { rootAssetId: asset.id, rootLabel: asset.name, nodes, edges, summary, generatedAt: now };
}

function dataLabelOfDependents(root: AssetRecord, byId: Map<string, AssetRecord>): string | null {
  for (const rel of root.relationships) {
    const target = byId.get(rel.toAssetId);
    if (target) {
      const tag = dataLabelFor(target);
      if (tag) return tag;
    }
  }
  return null;
}

function graphBlastSummary(asset: AssetRecord): string {
  const dependentCount = asset.relationships.filter((r) => r.fromAssetId === asset.id).length;
  return dependentCount > 0
    ? `${dependentCount} direct dependent relation(s) observed in the simulated asset graph.`
    : "No direct dependent relations recorded in this environment.";
}