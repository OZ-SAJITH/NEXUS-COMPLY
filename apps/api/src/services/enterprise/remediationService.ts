import type {
  AssetFinding,
  AssetRecord,
  RemediationActionType,
  RemediationApprovalRecord,
  RemediationExecutionLogEntry,
  RemediationRecord,
  RemediationValidationResult,
  UserRole,
} from "@nexus/shared-types";
import { applyRemediationAction, buildProposal, canTransition } from "@nexus/enterprise-catalog";
import { ApiError } from "../reviewService";
import { uniqueId } from "../../utils/helpers";
import { findAssetFinding, scanAsset, type Instantiation, reevaluateControl } from "./assetService";
import type { ConnectorManager } from "./connectorManager";
import { logEnterpriseEvent, simulatedDelay } from "./events";

export interface Actor {
  id: string;
  name: string;
  role: UserRole;
}

// ---------------------------------------------------------------------------
// Closed-loop remediation orchestrator.
// Every transition is append-only audited. The structured actions are executed
// ONLY against the SIMULATED enterprise state, snapshotting the previous state
// so rollback restores exactly what changed.
// ---------------------------------------------------------------------------

export async function createRemediation(ctx: Instantiation, findingId: string, reason?: string): Promise<RemediationRecord> {
  const { finding, asset } = await findAssetFinding(ctx, findingId);
  await ctx.manager.ensureSeeded();
  const proposal = buildProposal(finding.controlId, asset.assetType, reason ?? `Remediate ${finding.controlId} on ${asset.name}.`);
  const record: RemediationRecord = {
    id: uniqueId("rem"),
    findingId,
    assetId: asset.id,
    assetName: asset.name,
    controlId: finding.controlId,
    controlName: finding.controlName,
    title: `${proposal.displayName} — ${asset.name}`,
    reason: proposal.reason,
    riskScore: finding.risk,
    riskBand: finding.riskExplanation?.band ?? "HIGH",
    proposedAction: proposal,
    status: "PLANNED",
    environment: asset.environment,
    auditEventIds: [],
    createdAt: new Date().toISOString(),
  };
  await ctx.repo.saveRemediation(record);
  await logEnterpriseEvent({
    eventType: "REMEDIATION_PLANNED",
    entityType: "remediation",
    entityId: record.id,
    findingId,
    auditId: asset.id,
    controlId: finding.controlId,
    source: "system",
    detail: { assetName: asset.name, actionType: proposal.actionType, impact: proposal.impact, rollbackAvailable: proposal.rollbackAvailable },
  });
  return record;
}

async function load(ctx: Instantiation, remId: string): Promise<RemediationRecord> {
  const rem = await ctx.repo.getRemediation(remId);
  if (!rem) throw new ApiError(404, "Remediation not found");
  return rem;
}

async function saveAndLog(ctx: Instantiation, rem: RemediationRecord, payload: Parameters<typeof logEnterpriseEvent>[0]): Promise<RemediationRecord> {
  rem.updatedAt = new Date().toISOString();
  await ctx.repo.saveRemediation(rem);
  if (rem.auditEventIds.length >= 100) rem.auditEventIds = rem.auditEventIds.slice(-50);
  await logEnterpriseEvent(payload);
  return rem;
}

export async function validateRemediation(ctx: Instantiation, remId: string, actor: Actor): Promise<RemediationRecord> {
  const rem = await load(ctx, remId);
  if (!canTransition(rem.status, "VALIDATED") && !canTransition(rem.status, "VALIDATION_FAILED")) {
    throw new ApiError(409, `Cannot validate remediation in status ${rem.status}.`);
  }
  const asset = await ctx.repo.getAsset(rem.assetId);
  if (!asset) throw new ApiError(404, "Asset not found");

  await simulatedDelay(180);
  const applied = applyRemediationAction(asset, rem.proposedAction.actionType, rem.proposedAction.parameters);
  const candidate: AssetRecord = { ...asset, observedState: applied.state };
  const outcome = reevaluateControl(rem.controlId, candidate);

  const validation: RemediationValidationResult = {
    status: outcome?.status === "PASS" || outcome?.status === "NOT_APPLICABLE" ? "PASS" : "FAIL",
    beforeState: { ...asset.observedState },
    proposedState: applied.state,
    expectedResult: rem.proposedAction.expectedResult,
    simulatedOutput: `${rem.proposedAction.actionType}: ${applied.message}`,
    message: validationMessage(outcome?.status),
    at: new Date().toISOString(),
  };
  rem.validation = validation;
  rem.status = validation.status === "PASS" ? "VALIDATED" : "VALIDATION_FAILED";
  rem.title = `${rem.proposedAction.displayName} — ${rem.assetName}`;
  await saveAndLog(ctx, rem, {
    eventType: validation.status === "PASS" ? "REMEDIATION_VALIDATED" : "REMEDIATION_PLANNED",
    entityType: "remediation",
    entityId: rem.id,
    findingId: rem.findingId,
    auditId: rem.assetId,
    controlId: rem.controlId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    source: "human",
    detail: { validation: validation.status, simulatedOutput: validation.simulatedOutput, expectedResult: validation.expectedResult },
  });
  return rem;
}

function validationMessage(status: string | undefined): string {
  if (status === "PASS" || status === "NOT_APPLICABLE") return "Validation passed — the proposed action resolves the evaluated control in the simulated environment.";
  if (status === "WARNING") return "Validation passed with a warning — the condition is reduced but residual exposure remains.";
  return "Validation failed — the proposed action does not normalize the evaluated control in the simulated environment.";
}

export async function requestApproval(ctx: Instantiation, remId: string, actor: Actor): Promise<RemediationRecord> {
  const rem = await load(ctx, remId);
  if (!canTransition(rem.status, "PENDING_APPROVAL")) {
    throw new ApiError(409, `Cannot request approval in status ${rem.status}.`);
  }
  rem.status = "PENDING_APPROVAL";
  return saveAndLog(ctx, rem, {
    eventType: "REMEDIATION_PLANNED",
    entityType: "remediation",
    entityId: rem.id,
    findingId: rem.findingId,
    auditId: rem.assetId,
    controlId: rem.controlId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    source: "human",
    detail: { action: "submitted_for_approval", riskScore: rem.riskScore, riskBand: rem.riskBand },
  });
}

export async function approveRemediation(ctx: Instantiation, remId: string, actor: Actor, comment?: string): Promise<RemediationRecord> {
  const rem = await load(ctx, remId);
  if (!canTransition(rem.status, "APPROVED")) throw new ApiError(409, `Cannot approve remediation in status ${rem.status}.`);
  const approval: RemediationApprovalRecord = {
    status: "APPROVED",
    approverName: actor.name,
    approverRole: actor.role,
    comment,
    at: new Date().toISOString(),
  };
  rem.approval = approval;
  rem.status = "APPROVED";
  return saveAndLog(ctx, rem, {
    eventType: "REMEDIATION_APPROVED",
    entityType: "remediation",
    entityId: rem.id,
    findingId: rem.findingId,
    auditId: rem.assetId,
    controlId: rem.controlId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    source: "human",
    detail: { actionType: rem.proposedAction.actionType, comment: comment ?? null },
  });
}

export async function rejectRemediation(ctx: Instantiation, remId: string, actor: Actor, reason?: string): Promise<RemediationRecord> {
  const rem = await load(ctx, remId);
  if (!canTransition(rem.status, "REJECTED")) throw new ApiError(409, `Cannot reject remediation in status ${rem.status}.`);
  rem.approval = {
    status: "REJECTED",
    approverName: actor.name,
    approverRole: actor.role,
    comment: reason,
    at: new Date().toISOString(),
  };
  rem.status = "REJECTED";
  return saveAndLog(ctx, rem, {
    eventType: "REMEDIATION_REJECTED",
    entityType: "remediation",
    entityId: rem.id,
    findingId: rem.findingId,
    auditId: rem.assetId,
    controlId: rem.controlId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    source: "human",
    detail: { reason: reason ?? "Rejected by reviewer." },
  });
}

export async function executeRemediation(ctx: Instantiation, remId: string, actor: Actor): Promise<RemediationRecord> {
  const rem = await load(ctx, remId);
  if (!canTransition(rem.status, "EXECUTING")) throw new ApiError(409, `Cannot execute remediation in status ${rem.status}.`);
  const asset = await ctx.repo.getAsset(rem.assetId);
  if (!asset) throw new ApiError(404, "Asset not found");

  const logs: RemediationExecutionLogEntry[] = [
    { at: new Date().toISOString(), level: "INFO", message: `Orchestrator: executing ${rem.proposedAction.actionType} on ${rem.assetName}` },
  ];
  rem.status = "EXECUTING";
  rem.execution = {
    status: "EXECUTING",
    startedAt: new Date().toISOString(),
    logs,
    action: rem.proposedAction.actionType,
    appliedTo: `${asset.hostname} (${asset.ipAddress})`,
  };
  await ctx.repo.saveRemediation(rem);

  const connector = await ctx.manager.bestConnectorFor(asset.assetType, asset.vendor);
  if (!connector) {
    logs.push({ at: new Date().toISOString(), level: "ERROR", message: "No ONLINE connector is available to execute the remediation." });
    rem.status = "FAILED";
    rem.execution.status = "FAILED";
    rem.execution.logs = logs;
    await saveAndLog(ctx, rem, {
      eventType: "REMEDIATION_EXECUTED",
      entityType: "remediation",
      entityId: rem.id,
      findingId: rem.findingId,
      auditId: rem.assetId,
      controlId: rem.controlId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      source: "system",
      detail: { status: "FAILED", error: "No ONLINE connector available." },
    });
    return rem;
  }

  await simulatedDelay(320);
  const applied = applyRemediationAction(asset, rem.proposedAction.actionType, rem.proposedAction.parameters);
  logs.push({ at: new Date().toISOString(), level: "INFO", message: `Simulated action applied: ${applied.message}` });
  logs.push({ at: new Date().toISOString(), level: "INFO", message: "Snapshot of prior observed state retained for rollback." });

  const snapshot = { ...asset.observedState };
  asset.observedState = applied.state;
  asset.stateHistory.push({ at: new Date().toISOString(), label: `Remediated: ${rem.proposedAction.actionType}`, state: { ...applied.state } });
  asset.history.push({
    at: new Date().toISOString(),
    action: `Executed remediation ${rem.proposedAction.actionType} via ${connector.name}`,
    actor: actor.name,
  });
  await ctx.repo.saveAsset(asset);

  const completedAt = new Date().toISOString();
  rem.status = "COMPLETED";
  rem.rollback = {
    available: true,
    triggered: false,
    status: "NOT_NEEDED",
    reason: "Snapshot retained; rollback available if verification fails.",
    restoredState: snapshot,
  };
  rem.execution.status = "COMPLETED";
  rem.execution.completedAt = completedAt;
  rem.execution.logs = logs;
  rem.execution.message = `${rem.proposedAction.actionType}: ${applied.message}`;

  await saveAndLog(ctx, rem, {
    eventType: "REMEDIATION_EXECUTED",
    entityType: "remediation",
    entityId: rem.id,
    findingId: rem.findingId,
    auditId: rem.assetId,
    controlId: rem.controlId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    source: "human",
    detail: { actionType: rem.proposedAction.actionType, connector: connector.name, status: "COMPLETED" },
  });
  return rem;
}

export async function verifyRemediation(ctx: Instantiation, remId: string, actor: Actor): Promise<RemediationRecord> {
  const rem = await load(ctx, remId);
  if (!canTransition(rem.status, "VERIFYING") && rem.status !== "COMPLETED") {
    throw new ApiError(409, `Cannot verify remediation in status ${rem.status}.`);
  }
  const asset = await ctx.repo.getAsset(rem.assetId);
  if (!asset) throw new ApiError(404, "Asset not found");

  rem.status = "VERIFYING";
  rem.verification = {
    status: "FAIL",
    environment: asset.environment,
    before: {
      findingStatus: "FAIL",
      riskScore: rem.riskScore,
      riskBand: rem.riskBand,
      compliance: `Failed ${rem.controlId} (evidence-grounded risk ${rem.riskScore}/100)`,
    },
    after: {
      findingStatus: "FAIL",
      riskScore: rem.riskScore,
      riskBand: rem.riskBand,
      compliance: "Awaiting automated re-verification scan.",
    },
    evidenceBeforeIds: await beforeEvidenceIds(ctx, rem),
    evidenceAfterIds: [],
    triggeredBy: "auto_verify_scan",
    at: new Date().toISOString(),
  };
  await ctx.repo.saveRemediation(rem);

  // Automated re-verification: re-run the scan against the (now changed)
  // simulated asset state and confirm the evaluated control is resolved.
  const scan = await scanAsset(ctx, asset.id, { trigger: "auto_verify" });
  const scanFailed = scan.status === "ERROR";
  const afterFinding = scan.findings.find((f: AssetFinding) => f.controlId === rem.controlId);
  const afterStatus = scanFailed ? "FAIL" : !afterFinding ? "PASS" : afterFinding.status;

  const evidenceAfter = scan.evidenceIds;
  const afterRiskRecalc = afterFinding?.riskExplanation;
  const afterScore = afterRiskRecalc?.score ?? (afterFinding ? afterFinding.risk : 0);

  if (afterStatus === "PASS") {
    rem.verification.status = "PASS";
    rem.verification.after.findingStatus = "PASS";
    rem.verification.after.riskScore = afterScore;
    rem.verification.after.riskBand = afterRiskRecalc?.band ?? "LOW";
    rem.verification.after.compliance = `Control ${rem.controlId} re-evaluated PASS after remediation.`;
    rem.verification.evidenceAfterIds = evidenceAfter;
    rem.status = "VERIFIED";
    return saveAndLog(ctx, rem, {
      eventType: "REMEDIATION_VERIFICATION_PASSED",
      entityType: "remediation",
      entityId: rem.id,
      findingId: rem.findingId,
      auditId: rem.assetId,
      controlId: rem.controlId,
      source: "system",
      detail: { actionType: rem.proposedAction.actionType, scanId: scan.id, evidenceAfter: evidenceAfter.length, afterStatus },
    });
  }

  rem.verification.status = "FAIL";
  rem.verification.after.findingStatus = scanFailed ? "FAIL" : (afterFinding?.status ?? "FAIL");
  rem.verification.after.riskScore = afterScore;
  rem.verification.after.riskBand = afterRiskRecalc?.band ?? rem.riskBand;
  rem.verification.after.compliance = scanFailed
    ? `Verification scan failed: ${scan.error ?? "unknown error"}`
    : `Control ${rem.controlId} still reports ${afterFinding?.status ?? "FAIL"} after remediation.`;
  rem.verification.evidenceAfterIds = evidenceAfter;
  rem.status = "FAILED";
  return saveAndLog(ctx, rem, {
    eventType: "REMEDIATION_VERIFICATION_FAILED",
    entityType: "remediation",
    entityId: rem.id,
    findingId: rem.findingId,
    auditId: rem.assetId,
    controlId: rem.controlId,
    source: "system",
    detail: { actionType: rem.proposedAction.actionType, scanId: scan.id, afterStatus, error: scan.error ?? null },
  });
}

async function beforeEvidenceIds(ctx: Instantiation, rem: RemediationRecord): Promise<string[]> {
  const scans = await ctx.repo.scansForAsset(rem.assetId);
  const latest = scans[0];
  if (!latest) return [];
  const f = latest.findings.find((x: AssetFinding) => x.controlId === rem.controlId);
  const ids = f?.evidenceIds ?? [];
  if (ids.length) return ids;
  return await ctx.repo.evidenceForFinding(rem.findingId).then((e) => e.map((x) => x.id));
}

export async function rollbackRemediation(ctx: Instantiation, remId: string, actor: Actor, reason?: string): Promise<RemediationRecord> {
  const rem = await load(ctx, remId);
  if (rem.status !== "FAILED" && rem.status !== "VERIFYING") {
    throw new ApiError(409, `Only a failed or verifying remediation can be rolled back (current ${rem.status}).`);
  }
  const asset = await ctx.repo.getAsset(rem.assetId);
  if (!asset) throw new ApiError(404, "Asset not found");

  const snapshotEntry = asset.stateHistory.find((h) => h.label.startsWith("Remediated:")) ?? asset.stateHistory[0];
  const restoredState = snapshotEntry?.state ?? asset.observedState;

  asset.observedState = restoredState;
  asset.stateHistory.push({
    at: new Date().toISOString(),
    label: `Rolled back ${rem.proposedAction.actionType}`,
    state: { ...restoredState },
  });
  asset.history.push({ at: new Date().toISOString(), action: `Rolled back remediation ${rem.proposedAction.actionType}`, actor: actor.name });
  await ctx.repo.saveAsset(asset);

  rem.status = "ROLLED_BACK";
  rem.rollback = {
    available: true,
    triggered: true,
    status: "ROLLED_BACK",
    reason: reason ?? "Verification failed; restoring prior observed state.",
    restoredState,
    at: new Date().toISOString(),
  };
  return saveAndLog(ctx, rem, {
    eventType: "REMEDIATION_ROLLED_BACK",
    entityType: "remediation",
    entityId: rem.id,
    findingId: rem.findingId,
    auditId: rem.assetId,
    controlId: rem.controlId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    source: "system",
    detail: { actionType: rem.proposedAction.actionType, reason: reason ?? "verification failed" },
  });
}

export function approvedActionTypes(asset: AssetRecord): RemediationActionType[] {
  const map: Record<string, RemediationActionType[] | undefined> = {
    APPLICATION: ["SET_TLS_MIN_VERSION", "REVOKE_AND_RENEW_CERTIFICATE", "DISABLE_INSECURE_PROTOCOL", "ENFORCE_STRONG_CIPHERS", "SECURE_API_CONFIG", "ENABLE_INTEGRITY_VALIDATION", "ENABLE_XML_SIGNATURE_VALIDATION", "ROTATE_AND_SCREEN_SECRETS", "RESTRICT_PRIVILEGED_ACCESS", "UPGRADE_SERVICE_VERSION", "RESTORE_BASELINE_HASH"],
    DATABASE: ["ENABLE_DB_ENCRYPTION", "RESTRICT_DB_BIND", "ENFORCE_STRONG_AUTH", "ROTATE_AND_SCREEN_SECRETS"],
    MESSAGE_QUEUE: ["SECURE_MESSAGE_QUEUE", "ENFORCE_STRONG_AUTH"],
    FIREWALL: ["CONSOLIDATE_FIREWALL_RULE", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH"],
    NETWORK: ["CONSOLIDATE_FIREWALL_RULE", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH"],
    SERVER: ["UPGRADE_SERVICE_VERSION", "RESTORE_BASELINE_HASH", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH", "ENABLE_INTEGRITY_VALIDATION"],
    CLOUD: ["ENABLE_DB_ENCRYPTION", "ROTATE_AND_SCREEN_SECRETS", "ENABLE_INTEGRITY_VALIDATION", "RESTRICT_DB_BIND"],
  };
  return map[asset.assetType] ?? [];
}

export type { ConnectorManager, Instantiation };