/**
 * ============================================================================
 * DEMO / DISPLAY MODULE  (replaceable)
 * ----------------------------------------------------------------------------
 * Everything in this file is PRESENTATION metadata. Values are derived from
 * LIVE audit data when the backend provides it; the remainder is a clearly
 * separated, hand-curated dataset you can replace with real vendor feeds /
 * framework definitions later. Nothing here claims to be a backend result.
 * ============================================================================
 */

import type { AuditRecord, Finding, Severity } from "@nexus/shared-types";
import { riskBandLabel } from "../utils/cn";

export interface ComplianceCategory {
  id: string;
  label: string;
  /** control-id prefixes counted inside this category */
  controls: string[];
}

export interface FrameworkDef {
  id: string;
  name: string;
  version: string;
  description: string;
  /** control-id prefixes mapped to this framework */
  controls: string[];
}

export interface VendorDef {
  id: string;
  name: string;
  monogram: string;
  /** tailwind-ish hex accents */
  color: string;
}

export interface AiInsight {
  id: string;
  title: string;
  narrative: string;
  risk: Severity;
  affected: number;
  action: string;
  auditId?: string;
  findingId?: string;
}

export const COMPLIANCE_CATEGORIES: ComplianceCategory[] = [
  { id: "network", label: "Network Security", controls: ["NET", "AC-3", "SC-7"] },
  { id: "access", label: "Access Control", controls: ["AC", "IA", "NET-USER"] },
  { id: "encryption", label: "Encryption", controls: ["SC-8", "CRYPTO", "IPSEC"] },
  { id: "logging", label: "Logging & Monitoring", controls: ["AU", "LOGGING"] },
  { id: "config", label: "Configuration", controls: ["CM", "CFG"] },
];

export const GUIDANCE_FRAMEWORKS: (FrameworkDef & {
  score: number;
  passed: number;
  failed: number;
  openFindings: number;
})[] = [
  {
    id: "iso27001",
    name: "ISO 27001",
    version: "2022 · A.12 / A.13",
    description: "Information security controls for management systems and network operations.",
    controls: ["NET", "AC", "SC", "AU", "IA", "CM", "NET-SSH", "NET-TELNET"],
    score: 94,
    passed: 0,
    failed: 0,
    openFindings: 0,
  },
  {
    id: "nist-csf",
    name: "NIST CSF",
    version: "2.0 · Identify / Protect / Detect",
    description: "Framework core mapped to operational security controls.",
    controls: ["NET", "AC", "SC", "AU", "IA", "CM"],
    score: 91,
    passed: 0,
    failed: 0,
    openFindings: 0,
  },
  {
    id: "cis-controls",
    name: "CIS Controls",
    version: "v8 · Secure Config / Access Mgmt",
    description: "Prioritized set of defensive actions for network hygiene.",
    controls: ["NET", "AC", "AU", "IA", "CM"],
    score: 89,
    passed: 0,
    failed: 0,
    openFindings: 0,
  },
  {
    id: "soc2",
    name: "SOC 2",
    version: "2023 · CC6 / CC7",
    description: "Trust services criteria for security and availability.",
    controls: ["NET", "SC", "AU", "AC"],
    score: 93,
    passed: 0,
    failed: 0,
    openFindings: 0,
  },
];

/** Friendly names / monograms for vendor identities. Unknown -> ASSET. */
export const VENDOR_META: Record<string, VendorDef> = {
  cisco: { id: "cisco", name: "Cisco", monogram: "CS", color: "#38bdf8" },
  fortinet: { id: "fortinet", name: "Fortinet", monogram: "FT", color: "#fb923c" },
  juniper: { id: "juniper", name: "Juniper", monogram: "JN", color: "#a78bfa" },
  paloalto: { id: "paloalto", name: "Palo Alto Networks", monogram: "PA", color: "#f472b6" },
  aws: { id: "aws", name: "AWS", monogram: "AW", color: "#fbbf24" },
  checkpoint: { id: "checkpoint", name: "Check Point", monogram: "CP", color: "#4ade80" },
  unknown: { id: "unknown", name: "Other / Unknown", monogram: "??", color: "#64748b" },
};

/** KPI deltas — hand-curated for the demo workspace (replace with trend store). */
export const KPI_INSIGHTS = {
  complianceDelta: +4.8,
  riskDeltaPct: -12,
  assetsAudited: 247,
  "assets-across": "8 vendor platforms",
  complianceTargetTxt: "+4.8% vs previous audit",
  riskTrendTxt: "12% improvement over 30 days",
} as const;

function matches(finding: Finding, prefixes: string[]): boolean {
  const id = finding.controlId.toUpperCase();
  return prefixes.some((p) => id.startsWith(p.toUpperCase()));
}

export function frameworkStats(
  audits: AuditRecord[],
  defs: FrameworkDef[],
): typeof GUIDANCE_FRAMEWORKS {
  const findings = audits.flatMap((a) => a.findings.map((f) => ({ ...f, auditId: a.id })));
  return defs.map((fw) => {
    const mine = findings.filter((f) => matches(f, fw.controls));
    const passed = mine.filter((f) => f.status === "PASS" || f.status === "NOT_APPLICABLE").length;
    const failed = mine.filter((f) => f.status === "FAIL" || f.status === "WARNING").length;
    const open = mine.filter((f) => f.status === "FAIL").length;
    const total = passed + failed;
    const score = total ? Math.round((passed / total) * 100) : 0;
    return { ...fw, score, passed, failed, openFindings: open };
  });
}

export function categoryBreakdown(audits: AuditRecord[]): { id: string; label: string; score: number; total: number }[] {
  const findings = audits.flatMap((a) => a.findings);
  return COMPLIANCE_CATEGORIES.map((cat) => {
    const mine = findings.filter((f) => matches(f, cat.controls));
    if (!mine.length) return { id: cat.id, label: cat.label, score: 100, total: 0 };
    const pass = mine.filter((f) => f.status === "PASS" || f.status === "NOT_APPLICABLE").length;
    return { id: cat.id, label: cat.label, score: Math.round((pass / mine.length) * 100), total: mine.length };
  });
}

export function buildInsights(audits: AuditRecord[], approvedMappings: number): AiInsight[] {
  const failing = audits.flatMap((a) => a.findings.filter((f) => f.status === "FAIL").map((f) => ({ ...f, auditId: a.id })));
  const insights: AiInsight[] = [];

  const byControl = new Map<string, Finding[]>();
  failing.forEach((f) => {
    const list = byControl.get(f.controlId) ?? [];
    list.push(f);
    byControl.set(f.controlId, list);
  });

  const mostRepeated = [...byControl.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (mostRepeated) {
    const [controlId, list] = mostRepeated;
    const risk = Math.max(...list.map((f) => f.risk));
    insights.push({
      id: "control-repeat",
      title: `Configuration drift across ${list.length} device${list.length > 1 ? "s" : ""}`,
      narrative: `${list.length} ${list[0].controlName} finding(s) on control ${controlId} - configuration drift from the approved security baseline detected across your fleet.`,
      risk: risk > 60 ? "HIGH" : risk > 40 ? "MEDIUM" : "LOW",
      affected: list.length,
      action: list[0].recommendedFix || "Enforce the approved security baseline and centralize configuration management.",
      auditId: list[0].auditId,
      findingId: list[0].id,
    });
  }

  const byVendor = new Map<string, Finding[]>();
  failing.forEach((f) => {
    const audit = audits.find((a) => a.id === f.auditId);
    const vendor = audit?.vendor ?? "unknown";
    const list = byVendor.get(vendor) ?? [];
    list.push(f);
    byVendor.set(vendor, list);
  });
  const weakestVendor = [...byVendor.entries()].sort((a, b) => b[1].filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH").length - a[1].filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH").length)[0];
  if (weakestVendor) {
    const [vendor, list] = weakestVendor;
    const label = VENDOR_META[vendor]?.name ?? vendor;
    insights.push({
      id: "vendor-drift",
      title: `${label} attack surface expanding from ${list.length} non-compliant control(s)`,
      narrative: `${list.length} failing control(s) on ${label} assets elevate the blast radius of the most exposed network segments.`,
      risk: "HIGH",
      affected: list.length,
      action: "Prioritize remediation of high-severity findings and enforce the vendor security baseline template.",
      auditId: list[0].auditId,
      findingId: list[0].id,
    });
  }

  const authFindings = failing.filter((f) => /AUTH|AAA|TACACS|RADIUS|NET-AC|AC-0/i.test(f.controlId + f.what));
  if (authFindings.length) {
    const risk = Math.max(...authFindings.map((f) => f.risk));
    insights.push({
      id: "auth-aaa",
      title: `${authFindings.length} device(s) with weak administrative authentication`,
      narrative: `Administrative access is not protected by centralized AAA across ${authFindings.length} audited device(s), increasing the risk of lateral movement by attackers.`,
      risk: risk > 60 ? "HIGH" : "MEDIUM",
      affected: authFindings.length,
      action: "Review AAA configuration, enforce centralized authentication (TACACS+/RADIUS), and remove local weak credentials.",
      auditId: authFindings[0].auditId,
      findingId: authFindings[0].id,
    });
  }

  insights.push({
    id: "adaptive-memory",
    title: "Adaptive engine learning",
    narrative: `The human-in-the-loop engine has consolidated ${Math.max(approvedMappings, 0)} approved syntax-to-intent mappings, allowing unknown vendor configurations to be parsed without re-annotation.`,
    risk: "LOW",
    affected: Math.max(approvedMappings, 0),
    action: "Continue approving candidate interpretations during reviews to expand coverage of uncommon syntax variants.",
  });

  return insights;
}

export function recommendationsFor(audits: AuditRecord[]): { findingId?: string; auditId?: string; title: string; detail: string; priority: Severity; }[] {
  const failing = audits.flatMap((a) => a.findings.filter((f) => f.status === "FAIL").map((f) => ({ ...f, auditId: a.id })));
  return failing
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 6)
    .map((f) => ({
      findingId: f.id,
      auditId: f.auditId,
      title: `${f.controlId} · ${f.controlName}`,
      detail: f.recommendedFix,
      priority: riskBandLabel(f.risk) as Severity,
    }));
}

export interface VendorAggregate {
  vendor: string;
  assets: number;
  compliance: number;
  risk: number;
  highRisk: number;
  findings: number;
  auditId?: string;
}

export function computeVendors(audits: AuditRecord[]): VendorAggregate[] {
  const by = new Map<string, AuditRecord[]>();
  audits.forEach((a) => by.set(a.vendor, [...(by.get(a.vendor) ?? []), a]));
  return [...by.entries()]
    .map(([vendor, list]) => {
      const failing = list.flatMap((a) => a.findings.filter((f) => f.status === "FAIL"));
      const scores = list.map((a) => a.compliance?.score ?? 0);
      const risks = list.map((a) => a.risk?.overallScore ?? 0);
      const worst = [...list].sort((a, b) => (b.risk?.overallScore ?? 0) - (a.risk?.overallScore ?? 0))[0];
      return {
        vendor,
        assets: list.length,
        compliance: Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, list.length)),
        risk: Math.round(risks.reduce((a, b) => a + b, 0) / Math.max(1, list.length)),
        highRisk: failing.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH").length,
        findings: failing.length,
        auditId: worst?.id,
      };
    })
    .sort((a, b) => b.assets - a.assets);
}