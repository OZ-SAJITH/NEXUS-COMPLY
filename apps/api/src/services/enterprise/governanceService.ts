import type {
  ApplicableControlsResult,
  ComplianceFramework2,
  GovernanceDecisionTrace,
  GovernanceException,
  GovernanceExceptionRequest,
  GovernanceExceptionDecision,
  OrganizationBaseline,
  PolicyProfile,
  PolicySelection,
} from "@nexus/shared-types";
import {
  COMPLIANCE_FRAMEWORKS,
  POLICY_PROFILES,
  DEFAULT_ORGANIZATION_BASELINE,
  applicableControlsForAsset,
  buildGovernanceTrace,
  evaluateEvidenceForAsset,
  getAssetControls,
  governanceContextForFinding,
  selectPolicyForAsset,
} from "@nexus/enterprise-catalog";
import { ApiError } from "../reviewService";
import { uniqueId } from "../../utils/helpers";
import type { Instantiation } from "./assetService";
import { logEnterpriseEvent } from "./events";

// ---------------------------------------------------------------------------
// PHASE 4 Governance Service — adaptive, region-driven, deterministic
// ---------------------------------------------------------------------------

// ---- Framework catalog ----

export async function listFrameworks(): Promise<ComplianceFramework2[]> {
  return COMPLIANCE_FRAMEWORKS;
}

export async function getFrameworkById(id: string): Promise<ComplianceFramework2> {
  const fw = COMPLIANCE_FRAMEWORKS.find((f) => f.id === id);
  if (!fw) throw new ApiError(404, "Framework not found");
  return fw;
}

// ---- Policy profiles ----

export async function listPolicies(): Promise<PolicyProfile[]> {
  return POLICY_PROFILES;
}

export async function getPolicyById(id: string): Promise<PolicyProfile> {
  const policy = POLICY_PROFILES.find((p) => p.profileId === id);
  if (!policy) throw new ApiError(404, "Policy profile not found");
  return policy;
}

// ---- Organization baseline ----

export async function getOrganizationBaseline(ctx: Instantiation): Promise<OrganizationBaseline> {
  const stored = await ctx.repo.getOrganizationBaseline();
  return stored ?? DEFAULT_ORGANIZATION_BASELINE;
}

// ---- Policy selection ----

export async function selectPolicy(ctx: Instantiation, assetId: string): Promise<PolicySelection> {
  const asset = await ctx.repo.getAsset(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");
  const org = await getOrganizationBaseline(ctx);
  return selectPolicyForAsset(asset, org);
}

// ---- Applicable controls ----

export async function getAssetApplicableControls(ctx: Instantiation, assetId: string): Promise<ApplicableControlsResult> {
  const asset = await ctx.repo.getAsset(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");
  const org = await getOrganizationBaseline(ctx);
  return applicableControlsForAsset(asset, org);
}

// ---- Asset governance (full trace) ----

export async function getAssetGovernance(ctx: Instantiation, assetId: string): Promise<GovernanceDecisionTrace> {
  const asset = await ctx.repo.getAsset(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");

  const evidence = await ctx.repo.evidenceForAsset(assetId);
  const evaluationResults = evaluateEvidenceForAsset(asset, evidence);

  const findings = evidence.length > 0 ? evidenceToFindings(asset, evaluationResults) : [];
  const exceptions = await ctx.repo.exceptionsForAsset(assetId);
  const org = await getOrganizationBaseline(ctx);

  return buildGovernanceTrace(
    asset,
    evaluationResults.map((r) => ({
      controlId: r.ruleId,
      status: r.evaluation.status,
      observedValue: r.evaluation.observedValue,
      expectedValue: r.evaluation.expectedValue,
    })),
    findings,
    exceptions,
    org,
  );
}

// ---- Exceptions ----

export async function listExceptions(ctx: Instantiation, assetId?: string): Promise<GovernanceException[]> {
  if (assetId) return ctx.repo.exceptionsForAsset(assetId);
  const all = await ctx.repo.allGovernanceExceptions();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function requestException(ctx: Instantiation, req: GovernanceExceptionRequest): Promise<GovernanceException> {
  const asset = await ctx.repo.getAsset(req.assetId);
  if (!asset) throw new ApiError(404, "Asset not found");

  const control = getAssetControls().find((c) => c.id === req.controlId);
  if (!control) throw new ApiError(404, "Control not found");

  const now = new Date().toISOString();
  const expiresInDays = req.expiresInDays ?? 90;
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  const exception: GovernanceException = {
    id: uniqueId("gov-exc"),
    controlId: req.controlId,
    controlName: control.name,
    assetId: req.assetId,
    assetName: asset.name,
    reason: req.reason,
    requestedBy: req.requestedBy,
    status: "REQUESTED",
    createdAt: now,
    expiresAt,
  };

  await ctx.repo.saveGovernanceException(exception);

  await logEnterpriseEvent({
    eventType: "GOVERNANCE_EXCEPTION_REQUESTED",
    entityType: "governance",
    entityId: exception.id,
    auditId: req.assetId,
    controlId: req.controlId,
    source: "human",
    detail: { assetId: req.assetId, controlId: req.controlId, reason: req.reason, requestedBy: req.requestedBy },
  });

  return exception;
}

export async function decideException(ctx: Instantiation, decision: GovernanceExceptionDecision): Promise<GovernanceException> {
  const exception = await ctx.repo.getGovernanceException(decision.exceptionId);
  if (!exception) throw new ApiError(404, "Exception not found");

  exception.status = decision.decision;
  exception.approvedBy = decision.decidedBy;
  if (decision.decision === "REJECTED") {
    exception.rejectionReason = decision.reason;
  } else if (decision.decision === "APPROVED" && decision.expiresInDays) {
    exception.expiresAt = new Date(Date.now() + decision.expiresInDays * 86400000).toISOString();
  }

  await ctx.repo.saveGovernanceException(exception);

  await logEnterpriseEvent({
    eventType: "GOVERNANCE_EXCEPTION_DECIDED",
    entityType: "governance",
    entityId: exception.id,
    auditId: exception.assetId,
    controlId: exception.controlId,
    source: "human",
    detail: { decision: decision.decision, decidedBy: decision.decidedBy, reason: decision.reason },
  });

  return exception;
}

// ---- Finding governance context ----

export async function buildFindingGovernanceContext(ctx: Instantiation, assetId: string, controlId: string) {
  const asset = await ctx.repo.getAsset(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");
  const exceptions = await ctx.repo.allGovernanceExceptions();
  return governanceContextForFinding(asset, controlId, exceptions);
}

// ---- Internal helpers ----

function evidenceToFindings(
  asset: Parameters<typeof evaluateEvidenceForAsset>[0],
  results: ReturnType<typeof evaluateEvidenceForAsset>,
): import("@nexus/shared-types").AssetFinding[] {
  return results.map((r) => ({
    id: uniqueId("af"),
    auditId: asset.id,
    controlId: r.ruleId,
    controlName: r.name,
    severity: r.severity,
    status: r.evaluation.status,
    what: r.evaluation.reason,
    why: r.evaluation.reason,
    where: `${asset.hostname} (${asset.ipAddress})`,
    risk: r.evaluation.status === "FAIL" ? 70 : 20,
    impact: "",
    recommendedFix: r.remediation,
    evidence: [],
    references: { controlId: r.ruleId },
    assetId: asset.id,
    evidenceIds: r.evidenceId ? [r.evidenceId] : [],
    assetType: asset.assetType,
    location: asset.location,
  }));
}

export type { Instantiation };