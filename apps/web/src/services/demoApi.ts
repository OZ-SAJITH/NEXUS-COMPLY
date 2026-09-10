import type { ConfigurationRecord } from "@nexus/shared-types";
import { DemoApiError, reviewAggregate, listAudits, getAudit, createAudit, getDashboardStats, getFinding, getExposurePaths, simulateRemediation, interpret, aiInterpretTransition, listReviewQueue, getReviewDetail, getAuditTrail, approveFinding, rejectFinding, requestChanges, modifyFinding, reopenFinding, finalizeAudit, listConfigurations, listSamples, reportHtml } from "../demo/demoStore";
import { latestState } from "../demo/demoStore";

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
];

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