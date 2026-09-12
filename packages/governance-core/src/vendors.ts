import type { VendorRiskSummary } from "@nexus/shared-types";
import { GRAPH_INDEX, GRAPH_NODES, descendantsOf, nodeLabel } from "./dependencies";

export const VENDORS: VendorRiskSummary[] = [
  {
    id: "vendor-oidc",
    name: "Vendor A · IdentityCloud",
    tier: "Tier 1",
    risk: "HIGH",
    complianceScore: 78,
    criticality: "CRITICAL",
    openFindings: 4,
    provideServices: ["Identity Service", "Okta Cloud IdP"],
    subvendors: ["IDX Telecom Auth"],
    affectedSystems: 8,
    concentrationRisk: "CRITICAL",
    changeIncoming: true,
  },
  {
    id: "vendor-gw",
    name: "Vendor B · Gateway Systems",
    tier: "Tier 1",
    risk: "MEDIUM",
    complianceScore: 86,
    criticality: "HIGH",
    openFindings: 2,
    provideServices: ["API Gateway"],
    subvendors: ["EdgeAuth"],
    affectedSystems: 6,
    concentrationRisk: "HIGH",
    changeIncoming: false,
  },
  {
    id: "vendor-cdn",
    name: "Vendor C · EdgeCDN",
    tier: "Tier 2",
    risk: "LOW",
    complianceScore: 94,
    criticality: "MEDIUM",
    openFindings: 0,
    provideServices: ["Notification Service delivery"],
    subvendors: [],
    affectedSystems: 2,
    concentrationRisk: "MEDIUM",
    changeIncoming: false,
  },
  {
    id: "vendor-legacy",
    name: "Vendor D · Legacy Systems Ltd",
    tier: "Tier 3",
    risk: "HIGH",
    complianceScore: 61,
    criticality: "HIGH",
    openFindings: 5,
    provideServices: ["Legacy Auth Server", "Mainframe interfaces"],
    subvendors: [],
    affectedSystems: 4,
    concentrationRisk: "HIGH",
    changeIncoming: true,
  },
  {
    id: "vendor-aws",
    name: "Vendor E · AWS",
    tier: "Tier 1",
    risk: "LOW",
    complianceScore: 95,
    criticality: "CRITICAL",
    openFindings: 0,
    provideServices: ["AWS us-east-1", "AWS eu-central-1"],
    subvendors: [],
    affectedSystems: 9,
    concentrationRisk: "HIGH",
    changeIncoming: false,
  },
];

export function vendorRiskById(id: string): VendorRiskSummary | undefined {
  return VENDORS.find((v) => v.id === id);
}

export function vendorImpact(vendorId: string, changeType: string) {
  const vendor = vendorRiskById(vendorId);
  if (!vendor) return null;
  const nodes = GRAPH_NODES.filter((n) => n.vendorId === vendorId || vendor.provideServices.some((s) => nodeLabel(n.id).toLowerCase().includes(s.toLowerCase().replace(/[^a-z]/gi, "").slice(0, 8))));
  const affected = new Set<string>(nodes.map((n) => n.id));
  nodes.forEach((n) => descendantsOf(n.id).forEach((d) => affected.add(d)));
  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    changeType,
    affectedSystems: Array.from(affected),
    affectedServices: nodes.filter((n) => n.type === "service" || n.type === "identity" || n.type === "api").map((n) => n.label),
    affectedVendors: affected.size > 0 ? [vendor.name] : [],
    criticalAssets: nodes.filter((n) => n.criticality === "CRITICAL").map((n) => n.label),
    dependencyCount: affected.size,
    blastRadius: affected.size,
    risk: vendor.risk,
    requiredApproval: vendor.risk === "HIGH" || vendor.risk === "CRITICAL" || vendor.criticality === "CRITICAL",
    affectedControls: ["MFA-PRIV-001", "IDENT-001", "IR-001", "VENDOR-001"],
    affectedFrameworks: ["iso-27001", "nist-csf", "nis2", "dora"],
    securityImpact: vendor.risk === "CRITICAL" || vendor.risk === "HIGH" ? "HIGH" : "MEDIUM",
    complianceImpact: "Vendor control posture requires re-assessment",
    availabilityImpact: "Service availability depends on vendor operations",
    authenticationImpact: "Identity flows terminate at vendor identity services",
    dataImpact: "Personal and customer data transits vendor services",
    networkImpact: "Outbound dependency paths may be affected",
    potentialEffects: ["Service interruption", "Authentication failure", "Regulatory exposure", "Supply-chain propagation"],
    recommendation: "Perform vendor change impact review and obtain security approval before applying.",
    simulateFirst: vendor.risk === "HIGH" || vendor.risk === "CRITICAL",
  };
}

export function graphForVendor(vendorId: string) {
  const reachable = new Set<string>();
  GRAPH_NODES.forEach((n) => {
    if (n.vendorId === vendorId) {
      reachable.add(n.id);
      descendantsOf(n.id).forEach((d) => reachable.add(d));
    }
  });
  if (reachable.size === 0) {
    const vendor = vendorRiskById(vendorId);
    if (vendor) {
      GRAPH_NODES.forEach((n) => {
        if (n.label.toLowerCase().includes(vendor.name.toLowerCase().slice(0, 12))) {
          reachable.add(n.id);
          descendantsOf(n.id).forEach((d) => reachable.add(d));
        }
      });
    }
  }
  return GRAPH_NODES.filter((n) => reachable.has(n.id)).map((n) => ({ ...n, edges: n.edges.filter((e) => reachable.has(e.to)) }));
}

export { GRAPH_INDEX, GRAPH_NODES };