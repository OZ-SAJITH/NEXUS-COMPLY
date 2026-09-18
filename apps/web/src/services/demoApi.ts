import type { ConfigurationRecord, GovernanceExceptionDecision, GovernanceExceptionRequest, OrganizationProfile } from "@nexus/shared-types";
import { DemoApiError, reviewAggregate, listAudits, getAudit, createAudit, getDashboardStats, getFinding, getExposurePaths, simulateRemediation, interpret, aiInterpretTransition, listReviewQueue, getReviewDetail, getAuditTrail, approveFinding, rejectFinding, requestChanges, modifyFinding, reopenFinding, finalizeAudit, listConfigurations, listSamples, reportHtml } from "../demo/demoStore";
import { latestState } from "../demo/demoStore";
import {
  getGovernanceDashboard,
  getPassport,
  listOrgProfiles,
  getActiveOrg,
  setActiveOrg,
  resetOrg,
  listFrameworks,
  listGovernanceControls,
  controlMappingsView,
  listDrift,
  suppressDrift,
  listRegulatoryUpdates,
  listRegionConflicts,
  listVendorRisks,
  dependencyGraph,
  listChanges,
  getChange,
  createChange,
  createChangeFromFinding,
  createChangeFromScenario,
  analyzeChange,
  runChangeSimulation,
  requestApproval,
  decideApproval,
  executeChange,
  verifyChange,
  rollbackChange,
  investigateRollback,
  keepChange,
  getTelemetryForChange,
  changeEvents,
  listExceptions,
  resolveException,
  getFreeze,
  setChangeFreeze,
  getAuditTrail as getGovernanceTrail,
  listScenarios,
  getGovernanceEvaluation,
  getGovernanceContext,
  updateGovernanceContext,
  listGovernanceConflicts,
  requestConflictReview,
  getActiveFrameworks,
  getFrameworkEvaluation,
  getFrameworkMappings,
} from "../demo/governanceStore";
import { enterpriseDemo } from "../demo/enterpriseStore";

type Handler = (body: unknown, query: URLSearchParams, match: RegExpMatchArray) => unknown;

const HANDLERS: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  { method: "GET", pattern: /^\/health$/, handler: () => ({ ok: true }) },
  { method: "GET", pattern: /^\/samples$/, handler: () => listSamples() },
  { method: "GET", pattern: /^\/configurations$/, handler: () => listConfigurations() },
  { method: "GET", pattern: /^\/dashboard$/, handler: () => getDashboardStats() },
  { method: "GET", pattern: /^\/reviews$/, handler: (_body, query) => listReviewQueue(toParams(query)) },
  { method: "GET", pattern: /^\/audits$/, handler: () => listAudits() },
  { method: "POST", pattern: /^\/audits$/, handler: (body) => {
      const { name, content, aiOverrides } = body as { name: string; content: string; aiOverrides?: Array<{ status?: string; securityIntent?: string; protocol?: string; sourceRestriction?: boolean; loggingEnabled?: boolean; confidence?: number }> };
      return createAudit(name, content, aiOverrides);
    } },
  { method: "GET", pattern: /^\/audits\/([^/]+)$/, handler: (_b, _q, m) => getAudit(m[1]) },
  { method: "GET", pattern: /^\/audits\/([^/]+)\/findings$/, handler: (_b, _q, m) => getAudit(m[1]).findings },
  { method: "GET", pattern: /^\/audits\/([^/]+)\/exposure$/, handler: (_b, _q, m) => getExposurePaths(m[1]) },
  { method: "GET", pattern: /^\/findings\/([^/]+)$/, handler: (_b, _q, m) => getFinding(m[1]) },
  { method: "GET", pattern: /^\/findings\/([^/]+)\/review$/, handler: (_b, _q, m) => getReviewDetail(m[1]) },
  { method: "GET", pattern: /^\/findings\/([^/]+)\/audit-trail$/, handler: (_b, _q, m) => getAuditTrail(m[1]) },
  { method: "POST", pattern: /^\/findings\/([^/]+)\/approve$/, handler: (body, _q, m) => ({ review: approveFinding(m[1], (body as { comment?: string })?.comment), message: "Finding approved. The human decision is recorded in the audit trail." }) },
  { method: "POST", pattern: /^\/findings\/([^/]+)\/reject$/, handler: (body, _q, m) => ({ review: rejectFinding(m[1], (body as { reason?: string })?.reason ?? "") }) },
  { method: "POST", pattern: /^\/findings\/([^/]+)\/request-changes$/, handler: (body, _q, m) => ({ review: requestChanges(m[1], (body as { requestedChanges?: string })?.requestedChanges ?? "") }) },
  { method: "POST", pattern: /^\/findings\/([^/]+)\/modify$/, handler: (body, _q, m) => ({ review: modifyFinding(m[1], (body as { why?: string; impact?: string; recommendedFix?: string; risk?: number }) ?? {}) }) },
  { method: "POST", pattern: /^\/findings\/([^/]+)\/reopen$/, handler: (_b, _q, m) => ({ review: reopenFinding(m[1]) }) },
  { method: "POST", pattern: /^\/compliance\/([^/]+)\/finalize$/, handler: (body, _q, m) => ({ finalization: finalizeAudit(m[1], (body as { acknowledgePendingCritical?: boolean; comment?: string }) ?? {}) }) },
  { method: "POST", pattern: /^\/remediation\/simulate$/, handler: (body) => simulateRemediation((body as { auditId: string })?.auditId ?? "") },
  { method: "POST", pattern: /^\/ai\/interpret$/, handler: (body) => interpret(body as { configName: string; config: string }) },
  { method: "POST", pattern: /^\/ai\/interpret\/([^/]+)\/approve$/, handler: (body, _q, m) => aiInterpretTransition("approve", m[1], (body as { auditId: string; syntaxFingerprint: string }) ?? { auditId: "", syntaxFingerprint: "" }) },
  { method: "POST", pattern: /^\/ai\/interpret\/([^/]+)\/reject$/, handler: (body, _q, m) => aiInterpretTransition("reject", m[1], (body as { auditId: string; syntaxFingerprint: string }) ?? { auditId: "", syntaxFingerprint: "" }) },
  { method: "POST", pattern: /^\/ai\/interpret\/([^/]+)\/edit$/, handler: (body, _q, m) => aiInterpretTransition("edit", m[1], (body as { auditId: string; syntaxFingerprint: string; [k: string]: unknown }) ?? { auditId: "", syntaxFingerprint: "" }) },
  { method: "GET", pattern: /^\/reports\/([^/]+)$/, handler: (_b, _q, m) => ({ __htmlReport: reportHtml(m[1]) }) },

  // ---- Global Compliance / Change Governance ----
  { method: "GET", pattern: /^\/governance\/dashboard$/, handler: () => getGovernanceDashboard() },
  { method: "GET", pattern: /^\/governance\/passport$/, handler: () => getPassport() },
  { method: "GET", pattern: /^\/governance\/evaluate$/, handler: () => getGovernanceEvaluation() },
  { method: "GET", pattern: /^\/governance\/context$/, handler: () => getGovernanceContext() },
  { method: "POST", pattern: /^\/governance\/context$/, handler: (body) => updateGovernanceContext((body as { profile: OrganizationProfile }).profile ?? (body as OrganizationProfile)) },
  { method: "GET", pattern: /^\/governance\/conflicts$/, handler: () => listGovernanceConflicts() },
  { method: "POST", pattern: /^\/governance\/conflicts\/([^/]+)\/review-request$/, handler: (_b, _q, m) => requestConflictReview(m[1]) },
  { method: "GET", pattern: /^\/governance\/frameworks\/active$/, handler: () => getActiveFrameworks() },
  { method: "GET", pattern: /^\/governance\/frameworks\/([^/]+)\/mappings$/, handler: (_b, _q, m) => getFrameworkMappings(m[1]) },
  { method: "GET", pattern: /^\/governance\/frameworks\/([^/]+)$/, handler: (_b, _q, m) => getFrameworkEvaluation(m[1]) },
  { method: "GET", pattern: /^\/governance\/organizations$/, handler: () => listOrgProfiles() },
  { method: "GET", pattern: /^\/governance\/organizations\/active$/, handler: () => getActiveOrg() },
  { method: "POST", pattern: /^\/governance\/organizations$/, handler: (body) => setActiveOrg((body as { profile: OrganizationProfile }).profile ?? (body as OrganizationProfile)) },
  { method: "POST", pattern: /^\/governance\/organizations\/reset$/, handler: () => resetOrg() },
  { method: "GET", pattern: /^\/governance\/frameworks$/, handler: () => listFrameworks() },
  { method: "GET", pattern: /^\/governance\/controls$/, handler: () => listGovernanceControls() },
  { method: "GET", pattern: /^\/governance\/control-mappings$/, handler: () => controlMappingsView() },
  { method: "GET", pattern: /^\/governance\/drift$/, handler: () => listDrift() },
  { method: "POST", pattern: /^\/governance\/drift\/([^/]+)\/suppress$/, handler: (_b, _q, m) => { suppressDrift(m[1]); return { ok: true }; } },
  { method: "GET", pattern: /^\/governance\/regulatory-updates$/, handler: () => listRegulatoryUpdates() },
  { method: "GET", pattern: /^\/governance\/region-conflicts$/, handler: () => listRegionConflicts() },
  { method: "GET", pattern: /^\/governance\/vendors$/, handler: () => listVendorRisks() },
  { method: "GET", pattern: /^\/governance\/dependency-graph$/, handler: () => dependencyGraph() },
  { method: "GET", pattern: /^\/governance\/scenarios$/, handler: () => listScenarios() },
  { method: "GET", pattern: /^\/governance\/change-requests$/, handler: () => listChanges() },
  { method: "POST", pattern: /^\/governance\/change-requests$/, handler: (body) => createChange(body as never) },
  { method: "POST", pattern: /^\/governance\/change-requests\/from-finding$/, handler: (body) => createChangeFromFinding((body as { findingId: string })?.findingId ?? "") },
  { method: "POST", pattern: /^\/governance\/change-requests\/from-scenario$/, handler: (body) => createChangeFromScenario((body as { scenarioId: string })?.scenarioId ?? "") },
  { method: "GET", pattern: /^\/governance\/change-requests\/([^/]+)$/, handler: (_b, _q, m) => getChange(m[1]) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/analyze$/, handler: (_b, _q, m) => analyzeChange(m[1]) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/simulate$/, handler: (_b, _q, m) => runChangeSimulation(m[1]) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/request-approval$/, handler: (body, _q, m) => requestApproval(m[1], (body as { comment?: string })?.comment) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/approve$/, handler: (body, _q, m) => decideApproval(m[1], (body as { approverName: string })?.approverName ?? "Security Review Lead", (body as { approverRole?: string })?.approverRole ?? "Security Engineer", (body as { decision: ApprovalDecision })?.decision ?? "APPROVED", (body as { comment?: string })?.comment ?? "", { emergency: (body as { emergency?: boolean })?.emergency, emergencyReason: (body as { emergencyReason?: string })?.emergencyReason }) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/execute$/, handler: (body, _q, m) => executeChange(m[1], (body as { executor?: string })?.executor) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/verify$/, handler: (body, _q, m) => verifyChange(m[1], (body as { verifier?: string })?.verifier) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/rollback$/, handler: (body, _q, m) => rollbackChange(m[1], (body as { reason?: string })?.reason) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/investigate$/, handler: (_b, _q, m) => investigateRollback(m[1]) },
  { method: "POST", pattern: /^\/governance\/change-requests\/([^/]+)\/keep$/, handler: (_b, _q, m) => keepChange(m[1]) },
  { method: "GET", pattern: /^\/governance\/change-requests\/([^/]+)\/telemetry$/, handler: (_b, _q, m) => getTelemetryForChange(m[1]) },
  { method: "GET", pattern: /^\/governance\/change-requests\/([^/]+)\/events$/, handler: (_b, _q, m) => ({ items: changeEvents(m[1]) }) },
  { method: "GET", pattern: /^\/governance\/exceptions$/, handler: () => listExceptions() },
  { method: "POST", pattern: /^\/governance\/exceptions\/([^/]+)\/resolve$/, handler: (body, _q, m) => resolveException(m[1], (body as { action: "ACCEPT_OVERRIDE" | "REQUEST_REMEDIATION" | "ESCALATE" | "COMPENSATING_CONTROL" })?.action ?? "ACCEPT_OVERRIDE", (body as { compensatingControls?: string[] })?.compensatingControls) },
  { method: "GET", pattern: /^\/governance\/freeze$/, handler: () => getFreeze() },
  { method: "POST", pattern: /^\/governance\/freeze$/, handler: (body) => setChangeFreeze((body as { active: boolean })?.active ?? false, (body as { reason?: string })?.reason) },
  { method: "GET", pattern: /^\/governance\/audit-trail$/, handler: () => ({ items: getGovernanceTrail() }) },

  // ---- Enterprise Compliance & Remediation ----
  { method: "GET", pattern: /^\/assets$/, handler: () => enterpriseDemo.listAssets() },
  { method: "GET", pattern: /^\/assets\/([^/]+)$/, handler: (_b, _q, m) => need(enterpriseDemo.assetById(m[1]), "Asset not found") },
  { method: "POST", pattern: /^\/assets\/discover$/, handler: () => enterpriseDemo.discover() },
  { method: "POST", pattern: /^\/assets\/([^/]+)\/scan$/, handler: (body, _q, m) => enterpriseDemo.scan(m[1], (body as { trigger?: "manual" | "auto_verify" | "scheduled" })?.trigger ?? "manual") },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/evidence$/, handler: (_b, _q, m) => enterpriseDemo.assetEvidence(m[1]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/connector$/, handler: (_b, _q, m) => enterpriseDemo.assetConnectorProfile(m[1]) },
  { method: "POST", pattern: /^\/assets\/([^/]+)\/connector\/test$/, handler: (_b, _q, m) => enterpriseDemo.testAssetConnector(m[1]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/evidence\/([^/]+)$/, handler: (_b, _q, m) => enterpriseDemo.assetEvidenceDetail(m[1], m[2]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/findings$/, handler: (_b, _q, m) => need(enterpriseDemo.assetFindings(m[1]), "Asset not found") },
  { method: "POST", pattern: /^\/assets\/([^/]+)\/findings\/([^/]+)\/lifecycle$/, handler: (body, _q, m) => enterpriseDemo.setFindingLifecycle(m[1], m[2], (body as { lifecycle: "ACKNOWLEDGED" | "EXCEPTED" | "OPEN"; reason?: string })?.lifecycle ?? "OPEN", (body as { reason?: string })?.reason) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/scans$/, handler: (_b, _q, m) => enterpriseDemo.assetScans(m[1]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/impact$/, handler: (_b, _q, m) => enterpriseDemo.assetImpact(m[1]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/graph$/, handler: (_b, _q, m) => enterpriseDemo.assetGraph(m[1]) },
  { method: "GET", pattern: /^\/findings\/([^/]+)\/impact$/, handler: (_b, _q, m) => enterpriseDemo.findingImpact(m[1]) },
  { method: "GET", pattern: /^\/findings\/([^/]+)\/exposure-path$/, handler: (_b, _q, m) => enterpriseDemo.findingExposurePath(m[1]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/governance$/, handler: (_b, _q, m) => enterpriseDemo.assetGovernance(m[1]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/frameworks$/, handler: (_b, _q, m) => enterpriseDemo.assetFrameworks(m[1]) },
  { method: "GET", pattern: /^\/assets\/([^/]+)\/applicable-controls$/, handler: (_b, _q, m) => enterpriseDemo.assetApplicableControls(m[1]) },
  { method: "GET", pattern: /^\/enterprise\/topology$/, handler: () => enterpriseDemo.topology() },
  { method: "GET", pattern: /^\/enterprise\/compliance-summary$/, handler: () => enterpriseDemo.complianceSummary() },
  { method: "GET", pattern: /^\/connectors$/, handler: () => enterpriseDemo.listConnectors() },
  { method: "GET", pattern: /^\/connectors\/([^/]+)\/health$/, handler: (_b, _q, m) => {
      const c = need(enterpriseDemo.connectorById(m[1]), "Connector not found");
      return { id: c.id, status: c.status, lastContactAt: c.lastContactAt, message: c.status === "ONLINE" ? "Healthy" : c.connectError ?? "Unavailable" };
    } },
  { method: "GET", pattern: /^\/connectors\/([^/]+)$/, handler: (_b, _q, m) => need(enterpriseDemo.connectorById(m[1]), "Connector not found") },
  { method: "POST", pattern: /^\/connectors\/([^/]+)\/test$/, handler: (_b, _q, m) => enterpriseDemo.testConnector(m[1]) },
  { method: "GET", pattern: /^\/evidence\/([^/]+)$/, handler: (_b, _q, m) => need(enterpriseDemo.evidenceById(m[1]), "Evidence record not found") },
  { method: "GET", pattern: /^\/asset-controls$/, handler: () => enterpriseDemo.controls() },
  { method: "GET", pattern: /^\/frameworks$/, handler: () => enterpriseDemo.frameworks() },
  { method: "GET", pattern: /^\/frameworks\/([^/]+)$/, handler: (_b, _q, m) => enterpriseDemo.frameworkById(m[1]) },
  { method: "GET", pattern: /^\/policies$/, handler: () => enterpriseDemo.listPolicies() },
  { method: "GET", pattern: /^\/policies\/([^/]+)$/, handler: (_b, _q, m) => enterpriseDemo.policyById(m[1]) },
  { method: "POST", pattern: /^\/governance\/policy\/select$/, handler: (body) => enterpriseDemo.selectPolicy((body as { assetId: string })?.assetId ?? "") },
  { method: "GET", pattern: /^\/governance\/evaluate\/([^/]+)$/, handler: (_b, _q, m) => {
      const assetId = m[1];
      return { assetId, policy: enterpriseDemo.selectPolicy(assetId), applicableControls: enterpriseDemo.assetApplicableControls(assetId), trace: enterpriseDemo.assetGovernance(assetId), exceptions: enterpriseDemo.listExceptions(assetId) };
    } },
  { method: "GET", pattern: /^\/enterprise\/governance\/exceptions$/, handler: () => enterpriseDemo.listExceptions() },
  { method: "POST", pattern: /^\/enterprise\/governance\/exceptions$/, handler: (body) => enterpriseDemo.requestException(body as GovernanceExceptionRequest) },
  { method: "POST", pattern: /^\/enterprise\/governance\/exceptions\/([^/]+)\/decide$/, handler: (body, _q, m) => enterpriseDemo.decideException({ ...(body as Record<string, unknown>), exceptionId: m[1] } as GovernanceExceptionDecision) },
  { method: "POST", pattern: /^\/findings\/([^/]+)\/analyze$/, handler: (_b, _q, m) => enterpriseDemo.analyze(m[1]) },
  { method: "GET", pattern: /^\/remediations$/, handler: () => enterpriseDemo.remediations() },
  { method: "POST", pattern: /^\/remediations$/, handler: (body) => enterpriseDemo.createRemediation((body as { findingId: string })?.findingId ?? "", (body as { reason?: string })?.reason) },
  { method: "GET", pattern: /^\/remediations\/([^/]+)$/, handler: (_b, _q, m) => need(enterpriseDemo.remediationById(m[1]), "Remediation not found") },
  { method: "POST", pattern: /^\/remediations\/([^/]+)\/validate$/, handler: (_b, _q, m) => enterpriseDemo.validateRemediation(m[1]) },
  { method: "POST", pattern: /^\/remediations\/([^/]+)\/request-approval$/, handler: (_b, _q, m) => enterpriseDemo.requestApproval(m[1]) },
  { method: "POST", pattern: /^\/remediations\/([^/]+)\/approve$/, handler: (body, _q, m) => enterpriseDemo.approve(m[1], (body as { comment?: string })?.comment) },
  { method: "POST", pattern: /^\/remediations\/([^/]+)\/reject$/, handler: (body, _q, m) => enterpriseDemo.reject(m[1], (body as { reason?: string })?.reason) },
  { method: "POST", pattern: /^\/remediations\/([^/]+)\/execute$/, handler: (_b, _q, m) => enterpriseDemo.execute(m[1]) },
  { method: "POST", pattern: /^\/remediations\/([^/]+)\/verify$/, handler: (_b, _q, m) => enterpriseDemo.verify(m[1]) },
  { method: "POST", pattern: /^\/remediations\/([^/]+)\/rollback$/, handler: (body, _q, m) => enterpriseDemo.rollback(m[1], (body as { reason?: string })?.reason) },
  { method: "GET", pattern: /^\/audit$/, handler: () => enterpriseDemo.auditEvents() },
];

type ApprovalDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

function need<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new DemoApiError(404, message);
  return value;
}

function toParams(query: URLSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of ["vendor", "framework", "severity", "status", "reviewer", "sortBy", "search"]) {
    const v = query.get(key);
    out[key] = v ?? undefined;
  }
  return out;
}

function parseBody(init?: RequestInit): unknown {
  if (!init?.body) return undefined;
  try {
    return JSON.parse(String(init.body));
  } catch {
    return undefined;
  }
}

export interface DemoDispatchResult {
  status: number;
  body: unknown;
}

function cleanPath(p: string): string {
  return p.replace(/^\/api/, "").split("?")[0];
}

export function normalizeDemoPath(path: string): string {
  return cleanPath(path);
}

export function dispatchDemo<T = unknown>(path: string, init?: RequestInit): { status: number; body: T } {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://nexus-demo.local");
  const clean = cleanPath(url.pathname);
  const query = url.searchParams;
  const body = parseBody(init);
  for (const h of HANDLERS) {
    if (h.method !== method) continue;
    const m = clean.match(h.pattern);
    if (!m) continue;
    const result = (h.handler as (b: unknown, q: URLSearchParams, m: RegExpMatchArray) => unknown)(body, query, m);
    return { status: 200, body: result as T };
  }
  throw new DemoApiError(404, `Demo mode: no handler for ${method} ${clean}`);
}

export async function demoResponse(path: string, init?: RequestInit): Promise<Response> {
  try {
    const { status, body } = dispatchDemo(path, init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const e = err as DemoApiError;
    const status = e.status ?? 500;
    return new Response(JSON.stringify({ error: e.message ?? "Demo error" }), { status, headers: { "Content-Type": "application/json" } });
  }
}

export function demoReportUrl(auditId: string): string {
  let html = "";
  const s = latestState();
  const audit = s.audits.find((a) => a.id === auditId);
  if (audit) html = reportHtml(auditId);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return URL.createObjectURL(blob);
}

export { reviewAggregate, listAudits, listConfigurations };
export type { ConfigurationRecord };