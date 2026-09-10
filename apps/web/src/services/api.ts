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
};