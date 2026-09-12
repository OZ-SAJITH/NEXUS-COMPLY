import type {
  AuditRecord,
  AuditEventRecord,
  DashboardStats,
  ExposurePath,
  Finding,
  FinalizeReviewInput,
  RemediationSimulation,
  ReviewDetail,
  ReviewQueueParams,
  ReviewQueueResponse,
  ChangeRequest,
  ComplianceException,
  ComplianceFrameworkDef,
  CompliancePassport,
  ComplianceDriftItem,
  ConfigSetting,
  ControlMappingEntry,
  DemoSintPilotScenario,
  DependencyNode,
  GovernanceAuditEvent,
  GovernanceControl,
  GovernanceDashboardStats,
  OrganizationProfile,
  RegionPolicyConflict,
  RegulatoryUpdate,
  TelemetryPoint,
  VendorRiskSummary,
  GovernanceEvaluation,
  GovernanceContext,
  FrameworkApplicability,
  PolicyConflict,
  FrameworkMappings,
} from "@nexus/shared-types";

import { DEMO_MODE, API_BASE, ApiConfigurationError, apiEndpoint } from "./apiConfig";
import { dispatchDemo, demoReportUrl } from "./demoApi";

export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (DEMO_MODE) {
    try {
      return dispatchDemo<T>(path, init).body;
    } catch (err) {
      if (err instanceof ApiRequestError) throw err;
      throw new ApiRequestError((err as { status?: number })?.status ?? 500, (err as { message?: string })?.message ?? "Demo engine error");
    }
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const url = apiEndpoint(path);
  let res: Response;
  try {
    res = await fetch(url, { headers, ...init });
  } catch {
    throw new ApiRequestError(
      0,
      "Backend unavailable — the NEXUS-COMPLY engine did not respond. Check that the hosted API is running and reachable, then retry."
    );
  }
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const looksLikeHtml = /^\s*</.test(text);
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : looksLikeHtml && (res.status === 404 || res.status === 405)
          ? `API backend is not reachable at ${url}. This deployment serves static files only — set the VITE_API_URL repository variable to your hosted backend, then redeploy.`
          : `${res.status} ${text.slice(0, 200)}`;
    throw new ApiRequestError(res.status, message);
  }
  return body as T;
}

export function describeApiError(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiConfigurationError) {
    return {
      title: "API configuration required",
      detail: err.message,
    };
  }
  if (err instanceof ApiRequestError && err.status === 0) {
    return {
      title: "Backend unavailable",
      detail: "Could not reach the NEXUS-COMPLY engine. Check that the hosted API backend is deployed and reachable, then retry.",
    };
  }
  return { title: "Could not reach the NEXUS-COMPLY engine", detail: err instanceof Error ? err.message : String(err) };
}

export interface AuditApiOverrides {
  securityIntent: string;
  protocol?: string;
  sourceRestriction?: boolean;
  loggingEnabled?: boolean;
  status?: string;
  confidence?: number;
}

export const api = {
  getDashboard: () => request<DashboardStats>("/dashboard"),

  createAudit: (name: string, content: string, aiOverrides?: AuditApiOverrides[]) =>
    request<AuditRecord>("/audits", {
      method: "POST",
      body: JSON.stringify({ name, content, aiOverrides }),
    }),

  getAudit: (id: string) => request<AuditRecord>(`/audits/${id}`),

  listAudits: () => request<AuditRecord[]>("/audits"),

  getFinding: (id: string) => request<{ finding: Finding; auditId: string }>(`/findings/${id}`),

  getExposurePaths: (id: string) => request<ExposurePath[]>(`/audits/${id}/exposure`),

  simulateRemediation: (auditId: string) =>
    request<RemediationSimulation>("/remediation/simulate", {
      method: "POST",
      body: JSON.stringify({ auditId }),
    }),

  approveAiInterpretation: (aiId: string, auditId: string, syntaxFingerprint: string) =>
    request<{ status: string; mappingSaved: boolean }>(`/ai/interpret/${aiId}/approve`, {
      method: "POST",
      body: JSON.stringify({ auditId, syntaxFingerprint }),
    }),

  rejectAiInterpretation: (aiId: string, auditId: string, syntaxFingerprint: string) =>
    request<{ status: string }>(`/ai/interpret/${aiId}/reject`, {
      method: "POST",
      body: JSON.stringify({ auditId, syntaxFingerprint }),
    }),

  editAiInterpretation: (
    aiId: string,
    auditId: string,
    syntaxFingerprint: string,
    patch: { securityIntent?: string; protocol?: string; sourceRestriction?: boolean; loggingEnabled?: boolean }
  ) =>
    request<{ status: string }>(`/ai/interpret/${aiId}/edit`, {
      method: "POST",
      body: JSON.stringify({ auditId, syntaxFingerprint, ...patch }),
    }),

  // ---- Human-in-the-loop review ----
  getReviewQueue: (params: ReviewQueueParams = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") q.set(k, String(v));
    });
    const query = q.toString();
    return request<ReviewQueueResponse>(`/reviews${query ? `?${query}` : ""}`);
  },

  getFindingReview: (findingId: string) => request<ReviewDetail>(`/findings/${findingId}/review`),

  getAuditTrail: (findingId: string) => request<{ items: AuditEventRecord[] }>(`/findings/${findingId}/audit-trail`),

  approveFinding: (findingId: string, comment?: string) =>
    request<{ review: ReviewDetail["review"]; message: string }>(`/findings/${findingId}/approve`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),

  rejectFinding: (findingId: string, reason: string) =>
    request<{ review: ReviewDetail["review"] }>(`/findings/${findingId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  requestChanges: (findingId: string, requestedChanges: string) =>
    request<{ review: ReviewDetail["review"] }>(`/findings/${findingId}/request-changes`, {
      method: "POST",
      body: JSON.stringify({ requestedChanges }),
    }),

  modifyFinding: (findingId: string, patch: { why?: string; impact?: string; recommendedFix?: string; risk?: number }) =>
    request<{ review: ReviewDetail["review"] }>(`/findings/${findingId}/modify`, {
      method: "POST",
      body: JSON.stringify(patch),
    }),

  reopenFinding: (findingId: string) =>
    request<{ review: ReviewDetail["review"] }>(`/findings/${findingId}/reopen`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  finalizeAudit: (auditId: string, input: FinalizeReviewInput = {}) =>
    request<{ finalization: { auditId: string; finalizerName: string; finalizedAt: string; comment?: string } }>(`/compliance/${auditId}/finalize`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  reportUrl: (auditId: string) => (DEMO_MODE ? demoReportUrl(auditId) : API_BASE ? `${API_BASE}/reports/${auditId}` : "#"),

  // ---- Global Compliance & Change Governance ----
  gov: {
    dashboard: () => request<GovernanceDashboardStats>("/governance/dashboard"),
    passport: () => request<CompliancePassport>("/governance/passport"),
    organizations: () => request<OrganizationProfile[]>("/governance/organizations"),
    activeOrganization: () => request<OrganizationProfile>("/governance/organizations/active"),
    setOrganization: (profile: OrganizationProfile) =>
      request<CompliancePassport>("/governance/organizations", { method: "POST", body: JSON.stringify({ profile }) }),
    resetOrganization: () => request<CompliancePassport>("/governance/organizations/reset", { method: "POST", body: JSON.stringify({}) }),
    frameworks: () => request<ComplianceFrameworkDef[]>("/governance/frameworks"),
    controls: () => request<GovernanceControl[]>("/governance/controls"),
    controlMappings: () => request<ControlMappingEntry[]>("/governance/control-mappings"),
    drift: () => request<ComplianceDriftItem[]>("/governance/drift"),
    suppressDrift: (id: string) => request<{ ok: boolean }>(`/governance/drift/${id}/suppress`, { method: "POST", body: JSON.stringify({}) }),
    regulatoryUpdates: () => request<RegulatoryUpdate[]>("/governance/regulatory-updates"),
    evaluate: () => request<GovernanceEvaluation>("/governance/evaluate"),
    context: () => request<GovernanceContext>("/governance/context"),
    updateContext: (profile: OrganizationProfile) =>
      request<{ evaluation: GovernanceEvaluation }>("/governance/context", { method: "POST", body: JSON.stringify({ profile }) }),
    activeFrameworks: () => request<FrameworkApplicability[]>("/governance/frameworks/active"),
    frameworkById: (id: string) => request<FrameworkApplicability>(`/governance/frameworks/${id}`),
    frameworkMappings: (id: string) => request<FrameworkMappings>(`/governance/frameworks/${id}/mappings`),
    policyConflicts: () => request<PolicyConflict[]>("/governance/conflicts"),
    requestConflictReview: (conflictId: string) =>
      request<{ message: string; event: GovernanceAuditEvent }>("/governance/conflicts/" + conflictId + "/review-request", { method: "POST", body: JSON.stringify({}) }),
    regionConflicts: () => request<RegionPolicyConflict[]>("/governance/region-conflicts"),
    vendors: () => request<VendorRiskSummary[]>("/governance/vendors"),
    dependencyGraph: () => request<DependencyNode[]>("/governance/dependency-graph"),
    scenarios: () => request<DemoSintPilotScenario[]>("/governance/scenarios"),

    changes: () => request<ChangeRequest[]>("/governance/change-requests"),
    getChange: (id: string) => request<ChangeRequest>(`/governance/change-requests/${id}`),
    createChange: (input: { title: string; description: string; targetSystems: string[]; configBefore: ConfigSetting[]; configAfter: ConfigSetting[]; reason?: string; expectedBenefit?: string; aiConfidence?: number; aiSummary?: string; risk?: string; sourceFindingId?: string; fourEyes?: boolean; requiredApprovers?: string[]; rollbackPlan?: string }) =>
      request<ChangeRequest>("/governance/change-requests", { method: "POST", body: JSON.stringify(input) }),
    createChangeFromFinding: (findingId: string) =>
      request<ChangeRequest>("/governance/change-requests/from-finding", { method: "POST", body: JSON.stringify({ findingId }) }),
    createChangeFromScenario: (scenarioId: string) =>
      request<ChangeRequest>("/governance/change-requests/from-scenario", { method: "POST", body: JSON.stringify({ scenarioId }) }),
    analyzeChange: (id: string) => request<ChangeRequest>(`/governance/change-requests/${id}/analyze`, { method: "POST", body: JSON.stringify({}) }),
    simulateChange: (id: string) => request<ChangeRequest>(`/governance/change-requests/${id}/simulate`, { method: "POST", body: JSON.stringify({}) }),
    requestApproval: (id: string, comment?: string) =>
      request<ChangeRequest>(`/governance/change-requests/${id}/request-approval`, { method: "POST", body: JSON.stringify({ comment }) }),
    decideApproval: (id: string, body: { approverName: string; approverRole: string; decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED"; comment?: string; emergency?: boolean; emergencyReason?: string }) =>
      request<ChangeRequest>(`/governance/change-requests/${id}/approve`, { method: "POST", body: JSON.stringify(body) }),
    executeChange: (id: string, executor?: string) =>
      request<ChangeRequest>(`/governance/change-requests/${id}/execute`, { method: "POST", body: JSON.stringify({ executor }) }),
    verifyChange: (id: string, verifier?: string) =>
      request<ChangeRequest>(`/governance/change-requests/${id}/verify`, { method: "POST", body: JSON.stringify({ verifier }) }),
    rollbackChange: (id: string, reason?: string) =>
      request<ChangeRequest>(`/governance/change-requests/${id}/rollback`, { method: "POST", body: JSON.stringify({ reason }) }),
    investigateChange: (id: string) => request<ChangeRequest>(`/governance/change-requests/${id}/investigate`, { method: "POST", body: JSON.stringify({}) }),
    keepChange: (id: string) => request<ChangeRequest>(`/governance/change-requests/${id}/keep`, { method: "POST", body: JSON.stringify({}) }),
    telemetry: (id: string) => request<TelemetryPoint[]>(`/governance/change-requests/${id}/telemetry`),
    changeEvents: (id: string) => request<{ items: GovernanceAuditEvent[] }>(`/governance/change-requests/${id}/events`),

    exceptions: () => request<ComplianceException[]>("/governance/exceptions"),
    resolveException: (id: string, action: "ACCEPT_OVERRIDE" | "REQUEST_REMEDIATION" | "ESCALATE" | "COMPENSATING_CONTROL", compensatingControls?: string[]) =>
      request<ComplianceException>(`/governance/exceptions/${id}/resolve`, { method: "POST", body: JSON.stringify({ action, compensatingControls }) }),
    freeze: () => request<{ active: boolean; reason?: string; until?: string; triggeredAt?: string }>("/governance/freeze"),
    setFreeze: (active: boolean, reason?: string) => request<{ active: boolean; reason?: string; until?: string; triggeredAt?: string }>("/governance/freeze", { method: "POST", body: JSON.stringify({ active, reason }) }),
    auditTrail: () => request<{ items: GovernanceAuditEvent[] }>("/governance/audit-trail"),
  },
};