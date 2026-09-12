import type { DependencyNode, GraphNodeType, RiskBand } from "@nexus/shared-types";

export const GRAPH_NODE_META: Record<GraphNodeType, { label: string; color: string; text: string; chip: string }> = {
  organization: { label: "Organization", color: "#38bdf8", text: "text-accent", chip: "border-accent/40 bg-accent/10 text-accent" },
  application: { label: "Application", color: "#7dd3fc", text: "text-sky-300", chip: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  service: { label: "Service", color: "#a78bfa", text: "text-violet-300", chip: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  api: { label: "API", color: "#f472b6", text: "text-pink-300", chip: "border-pink-500/40 bg-pink-500/10 text-pink-300" },
  identity: { label: "Identity", color: "#fbbf24", text: "text-amber-300", chip: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  database: { label: "Database", color: "#34d399", text: "text-emerald-300", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  vendor: { label: "Vendor", color: "#fb923c", text: "text-orange-300", chip: "border-orange-500/40 bg-orange-500/10 text-orange-300" },
  subvendor: { label: "Sub-vendor", color: "#fdba74", text: "text-orange-200", chip: "border-orange-400/40 bg-orange-500/10 text-orange-200" },
  asset: { label: "Asset", color: "#c084fc", text: "text-purple-300", chip: "border-purple-500/40 bg-purple-500/10 text-purple-300" },
  cloud: { label: "Cloud", color: "#60a5fa", text: "text-blue-300", chip: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
  legacy: { label: "Legacy", color: "#94a3b8", text: "text-slate-300", chip: "border-slate-500/40 bg-slate-500/10 text-slate-300" },
};

const CRIT: RiskBand = "CRITICAL";
const HIGH: RiskBand = "HIGH";
const MED: RiskBand = "MEDIUM";
const LOW: RiskBand = "LOW";

export const GRAPH_NODES: DependencyNode[] = [
  { id: "org", label: "NEXUS Enterprise", type: "organization", criticality: CRIT, risk: MED, findings: 0, edges: [{ to: "portal", relation: "deploys" }, { to: "admin", relation: "deploys" }, { to: "mobile", relation: "deploys" }] },

  { id: "portal", label: "Customer Portal", type: "application", criticality: HIGH, risk: MED, findings: 2, edges: [{ to: "api-gw", relation: "depends" }] },
  { id: "admin", label: "Admin Portal", type: "application", criticality: CRIT, risk: HIGH, findings: 4, edges: [{ to: "identity", relation: "depends" }, { to: "api-gw", relation: "depends" }] },
  { id: "mobile", label: "Mobile API Backend", type: "application", criticality: HIGH, risk: MED, findings: 1, edges: [{ to: "api-gw", relation: "depends" }] },

  { id: "api-gw", label: "API Gateway", type: "api", criticality: CRIT, risk: HIGH, findings: 3, vendorId: "vendor-gw", edges: [{ to: "identity", relation: "depends" }, { to: "billing", relation: "depends" }, { to: "analytics", relation: "depends" }, { to: "notify", relation: "depends" }, { to: "files", relation: "depends" }] },
  { id: "identity", label: "Identity Service", type: "identity", criticality: CRIT, risk: HIGH, findings: 5, vendorId: "vendor-oidc", edges: [{ to: "idp-cloud", relation: "depends" }, { to: "idp-legacy", relation: "depends" }, { to: "db-postgres", relation: "hosts" }] },
  { id: "billing", label: "Billing Service", type: "service", criticality: HIGH, risk: MED, findings: 2, edges: [{ to: "db-postgres", relation: "hosts" }] },
  { id: "analytics", label: "Analytics Platform", type: "service", criticality: MED, risk: LOW, findings: 1, edges: [{ to: "db-postgres", relation: "depends" }] },
  { id: "notify", label: "Notification Service", type: "service", criticality: MED, risk: LOW, findings: 0, edges: [{ to: "vendor-cdn", relation: "depends" }] },
  { id: "files", label: "File Storage", type: "service", criticality: HIGH, risk: MED, findings: 2, edges: [{ to: "cloud-aws", relation: "depends" }] },

  { id: "idp-cloud", label: "Okta Cloud IdP", type: "identity", criticality: CRIT, risk: MED, findings: 1, vendorId: "vendor-oidc", edges: [] },
  { id: "idp-legacy", label: "Legacy Local IdP", type: "legacy", criticality: CRIT, risk: HIGH, findings: 6, edges: [{ to: "srv-legacy", relation: "deploys" }] },
  { id: "srv-legacy", label: "Legacy Auth Server", type: "legacy", criticality: HIGH, risk: HIGH, findings: 4, vendorId: "vendor-legacy", edges: [{ to: "db-legacy", relation: "hosts" }] },

  { id: "db-postgres", label: "PostgreSQL Primary", type: "database", criticality: CRIT, risk: MED, findings: 1, edges: [] },
  { id: "db-legacy", label: "Legacy Mainframe DB", type: "legacy", criticality: HIGH, risk: HIGH, findings: 3, edges: [] },

  { id: "cloud-aws", label: "AWS us-east-1", type: "cloud", criticality: CRIT, risk: MED, findings: 2, vendorId: "vendor-aws", edges: [] },
  { id: "cloud-eu", label: "AWS eu-central-1", type: "cloud", criticality: HIGH, risk: LOW, findings: 0, vendorId: "vendor-aws", edges: [] },

  { id: "vuln-mgmt", label: "Vulnerability Scanner", type: "service", criticality: MED, risk: LOW, findings: 0, edges: [] },
  { id: "pa-payment", label: "Payment Processor", type: "asset", criticality: CRIT, risk: HIGH, findings: 3, edges: [{ to: "billing", relation: "depends" }] },

  { id: "vendor-oidc", label: "Vendor A · IdentityCloud", type: "vendor", criticality: CRIT, risk: HIGH, findings: 4, edges: [{ to: "vendor-oidc-sub", relation: "vendor_of" }] },
  { id: "vendor-oidc-sub", label: "Sub-vendor · IDX Telecom Auth", type: "subvendor", criticality: HIGH, risk: HIGH, findings: 2, edges: [] },
  { id: "vendor-gw", label: "Vendor B · Gateway Systems", type: "vendor", criticality: HIGH, risk: MED, findings: 2, edges: [{ to: "vendor-gw-sub", relation: "vendor_of" }] },
  { id: "vendor-gw-sub", label: "Sub-vendor · EdgeAuth", type: "subvendor", criticality: MED, risk: MED, findings: 1, edges: [] },
  { id: "vendor-cdn", label: "Vendor C · EdgeCDN", type: "vendor", criticality: MED, risk: LOW, findings: 0, edges: [] },
  { id: "vendor-legacy", label: "Vendor D · Legacy Systems Ltd", type: "vendor", criticality: HIGH, risk: HIGH, findings: 5, edges: [] },
  { id: "vendor-aws", label: "Vendor E · AWS", type: "vendor", criticality: CRIT, risk: LOW, findings: 0, edges: [] },
];

export const GRAPH_INDEX = new Map<string, DependencyNode>(GRAPH_NODES.map((n) => [n.id, n]));

export function nodeLabel(id: string): string {
  return GRAPH_INDEX.get(id)?.label ?? id;
}

export function findNodesByIds(ids: string[]): DependencyNode[] {
  return ids.map((i) => GRAPH_INDEX.get(i)).filter((n): n is DependencyNode => Boolean(n));
}

export function descendants(seedIds: string[]): string[] {
  const seen = new Set<string>();
  const visit = (id: string) => {
    const node = GRAPH_INDEX.get(id);
    if (!node || seen.has(id)) return;
    seen.add(id);
    for (const e of node.edges) visit(e.to);
  };
  seedIds.forEach(visit);
  return Array.from(seen);
}

export function descendantsOf(nodeId: string): string[] {
  return descendants([nodeId]).filter((i) => i !== nodeId);
}

export function providersOf(nodeId: string): string[] {
  const node = GRAPH_INDEX.get(nodeId);
  if (!node) return [];
  return node.edges.map((e) => e.to);
}