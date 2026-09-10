import type { AuditRecord, FindingReviewRecord } from "@nexus/shared-types";
import { summarizeCompliance, postureScore } from "@nexus/compliance-rules";
import { getRepository } from "../storage/jsonRepo";
import { humanVerifiedSummary } from "./reviewService";

/**
 * Generates a self-contained HTML report that can be printed/saved as a PDF
 * from any browser (File > Print > Save as PDF). No native PDF dependency.
 * Content is derived entirely from actual audit findings.
 */
export async function generateReport(audit: AuditRecord): Promise<string> {
  const repo = getRepository();
  const reviews = await repo.getFindingReviewsForAudit(audit.id);
  const verified = humanVerifiedSummary(audit.findings, reviews);
  const finalization = await repo.getFinalization(audit.id);
  const aiSummary = summarizeCompliance(audit.findings);
  const compliance = aiSummary;
  const posture = audit.risk ? postureScore(compliance, audit.risk) : 0;

  const reviewOf = new Map(reviews.map((r): [string, FindingReviewRecord] => [r.findingId, r]));

  const sevBadge = (sev: string) => {
    const colors: Record<string, string> = {
      CRITICAL: "#dc2626",
      HIGH: "#ea580c",
      MEDIUM: "#d97706",
      LOW: "#ca8a04",
      INFO: "#475569",
    };
    return `<span style="background:${colors[sev] ?? "#475569"};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">${sev}</span>`;
  };

  const statusBadge = (s: string) => {
    const map: Record<string, [string, string]> = {
      PASS: ["#059669", "PASS"],
      FAIL: ["#dc2626", "FAIL"],
      WARNING: ["#d97706", "WARNING"],
      NOT_APPLICABLE: ["#64748b", "N/A"],
    };
    const [bg, label] = map[s] ?? ["#64748b", s];
    return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">${label}</span>`;
  };

  const reviewStatusBadge = (s: string | undefined) => {
    const map: Record<string, [string, string]> = {
      AI_GENERATED: ["#64748b", "AI-GENERATED"],
      PENDING_REVIEW: ["#d97706", "PENDING REVIEW"],
      CHANGES_REQUESTED: ["#be185d", "CHANGES REQUESTED"],
      APPROVED: ["#059669", "HUMAN APPROVED"],
      REJECTED: ["#dc2626", "HUMAN REJECTED"],
      RESOLVED: ["#0f766e", "RESOLVED"],
    };
    const rec = reviewOf.get(s ?? "");
    const [bg, label] = map[rec?.status ?? ""] ?? ["#64748b", "NOT IN REVIEW"];
    return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">${label}</span>`;
  };

  const evidenceHtml = audit.findings
    .map((f) => {
      const ev = f.evidence
        .map(
          (e) =>
            `<div style="margin:4px 0 0 16px;font-size:12px;color:#475569">${e.file} · Lines ${e.lineStart}–${e.lineEnd}${e.reason ? `<br/>${escapeHtml(e.reason)}` : ""}</div>`
        )
        .join("");
      return `<tr>
        <td>${sevBadge(f.severity)}</td>
        <td>${statusBadge(f.status)}</td>
        <td>${reviewStatusBadge(f.id)}</td>
        <td><strong>${escapeHtml(f.controlName)}</strong><div style="font-size:12px;color:#64748b">${escapeHtml(f.controlId)}</div></td>
        <td style="font-size:13px">${escapeHtml(f.why)}<div style="font-size:12px;color:#64748b;margin-top:4px">${escapeHtml(f.recommendedFix)}</div>${ev}</td>
      </tr>`;
    })
    .join("");

  const reviewHtml = reviews
    .map((r) => {
      const f = audit.findings.find((x) => x.id === r.findingId);
      return `<tr>
        <td>${escapeHtml(f?.controlId ?? r.findingId)}</td>
        <td>${reviewStatusBadge(r.findingId)}</td>
        <td>${escapeHtml(r.reviewedBy ?? "-")}</td>
        <td>${r.reviewedAt ? new Date(r.reviewedAt).toISOString() : "-"}</td>
        <td style="font-size:12px">${escapeHtml(r.reviewComment ?? r.rejectionReason ?? r.requestedChanges ?? r.humanModifiedRecommendation?.why ?? "-")}${r.humanModifiedRecommendation?.recommendedFix ? `<div style="color:#64748b;margin-top:4px">Human-modified recommendation: ${escapeHtml(r.humanModifiedRecommendation.recommendedFix)}</div>` : ""}</td>
      </tr>`;
    })
    .join("");

  const aiHtml = (audit.aiInterpretations ?? [])
    .map(
      (ai) => `<tr>
        <td>${escapeHtml(ai.securityIntent)}</td>
        <td>${escapeHtml(ai.detectedConcept)}</td>
        <td>${Math.round(ai.confidence * 100)}%</td>
        <td>${ai.status}</td>
        <td>${ai.provider === "mock" ? "DEMO (Mock)" : "LIVE"}</td>
      </tr>`
    )
    .join("");

  const sim = audit.remediation;

  const humanCoverageText = `${verified.coverage}% of engine findings human-reviewed`;
  const pendingNote =
    verified.pending > 0
      ? `<p style="font-size:12px;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 14px">${verified.pending} finding(s) still await human review. Pending and AI-generated findings are NOT counted as human-verified compliance; they only affect the AI score above.</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>NEXUS-COMPLY Audit Report</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#0f172a; margin:32px; }
  h1 { font-size:24px; margin:0 0 4px; }
  .sub { color:#64748b; font-size:14px; }
  .grid { display:flex; gap:16px; margin:20px 0; flex-wrap:wrap; }
  .card { border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; min-width:160px; }
  .num { font-size:26px; font-weight:700; }
  table { border-collapse:collapse; width:100%; margin-top:8px; }
  th, td { border:1px solid #e2e8f0; padding:8px 10px; text-align:left; font-size:13px; vertical-align:top; }
  th { background:#f8fafc; }
  .section { margin-top:28px; }
  .section h2 { font-size:17px; border-bottom:2px solid #0f172a; padding-bottom:4px; }
</style>
</head>
<body>
  <h1>NEXUS-COMPLY — Compliance Audit Report</h1>
  <div class="sub">Configuration: <strong>${escapeHtml(audit.configurationName)}</strong> · Vendor: ${audit.vendor.toUpperCase()} · Audit Date: ${new Date(audit.completedAt ?? audit.startedAt).toISOString()} · Audit ID: ${audit.id}</div>

  <div class="grid">
    <div class="card"><div class="num">${posture}/100</div><div style="font-size:12px;color:#64748b">Overall Security Posture</div></div>
    <div class="card"><div class="num">${compliance.score}%</div><div style="font-size:12px;color:#64748b">AI Compliance Score (${compliance.passed}/${compliance.passed + compliance.failed})</div></div>
    <div class="card"><div class="num">${verified.score !== null ? `${verified.score}%` : "-"}</div><div style="font-size:12px;color:#64748b">Human-Verified Compliance (${humanCoverageText})</div></div>
    <div class="card"><div class="num">${audit.risk ? audit.risk.overallScore : 0}</div><div style="font-size:12px;color:#64748b">Overall Risk /100</div></div>
  </div>

  ${finalization ? `<div style="margin:8px 0;padding:10px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:13px;color:#065f46"><strong>Human-verified assessment finalized</strong> by ${escapeHtml(finalization.finalizerName)} on ${new Date(finalization.finalizedAt).toISOString()}${finalization.comment ? ` — ${escapeHtml(finalization.comment)}` : ""}. All review actions are now sealed.</div>` : ""}

  <div class="section">
    <h2>Security Intent</h2>
    <p style="font-size:13px;color:#334155">Vendor-neutral representation of what the configuration is intended to do from a security perspective.</p>
    <table>
      <tr><th>Intent Type</th><th>Protocol</th><th>Source</th><th>Action</th><th>Logging</th><th>Lines</th></tr>
      ${audit.intents
        .map(
          (i) =>
            `<tr><td>${escapeHtml(i.intentType)}</td><td>${escapeHtml(i.protocol ?? "-")}</td><td>${escapeHtml(i.source?.value ?? "any")}</td><td>${escapeHtml(i.action ?? "-")}</td><td>${i.loggingRequired ? "Yes" : "No"}</td><td>${i.evidence.map((e) => `${e.lineStart}-${e.lineEnd}`).join(", ")}</td></tr>`
        )
        .join("")}
    </table>
  </div>

  <div class="section">
    <h2>Compliance Findings &amp; Evidence</h2>
    <table>
      <tr><th>Severity</th><th>Status</th><th>Human Review</th><th>Control</th><th>Reason / Evidence / Fix</th></tr>
      ${evidenceHtml}
    </table>
  </div>

  ${reviewHtml ? `<div class="section">
    <h2>Human Verification</h2>
    <p style="font-size:13px;color:#334155">Findings are generated by the analysis engine and AI. Every FAIL/WARNING finding must be individually reviewed and approved, rejected, or modified by an authorized human reviewer before it counts as verified compliance.</p>
    ${pendingNote}
    <table>
      <tr><th>Control</th><th>Decision</th><th>Reviewer</th><th>Decision Time</th><th>Notes</th></tr>
      ${reviewHtml}
    </table>
  </div>` : ""}

  ${aiHtml ? `<div class="section"><h2>AI Interpretation</h2><table><tr><th>Security Intent</th><th>Concept</th><th>Confidence</th><th>Status</th><th>Mode</th></tr>${aiHtml}</table></div>` : ""}

  ${sim ? `<div class="section">
    <h2>Remediation Simulation (Before → After)</h2>
    <div class="grid">
      <div class="card"><div class="num">${sim.postureBefore}</div><div style="font-size:12px;color:#64748b">Posture Before</div></div>
      <div class="card"><div class="num">${sim.postureAfter}</div><div style="font-size:12px;color:#64748b">Posture After</div></div>
      <div class="card"><div class="num">${sim.complianceBefore.score}%</div><div style="font-size:12px;color:#64748b">Passed Before ${sim.complianceBefore.passed}/${sim.complianceBefore.passed + sim.complianceBefore.failed}</div></div>
      <div class="card"><div class="num">${sim.complianceAfter.score}%</div><div style="font-size:12px;color:#64748b">Passed After ${sim.complianceAfter.passed}/${sim.complianceAfter.passed + sim.complianceAfter.failed}</div></div>
      <div class="card"><div class="num">${sim.highRiskBefore}</div><div style="font-size:12px;color:#64748b">High-Risk Before</div></div>
      <div class="card"><div class="num">${sim.highRiskAfter}</div><div style="font-size:12px;color:#64748b">High-Risk After</div></div>
    </div>
    <p style="font-size:12px;color:#64748b">This is a safe, simulated remediation. No production configuration was modified.</p>
  </div>` : ""}

  <p style="margin-top:32px;font-size:11px;color:#94a3b8">Prototype Control labels indicate controls based on CIS/NIST/STIG security principles, but not official identifiers. This report is generated from actual audit findings.</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
