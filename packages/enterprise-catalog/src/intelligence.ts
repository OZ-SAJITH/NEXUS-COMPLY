import type {
  AiProviderMode,
  AiRemediationIntelligence,
  AiRemediationPreCheck,
  AiRemediationRollbackStep,
  AiRemediationValidationStep,
  AssetEnvironment,
  AssetFinding,
  AssetRecord,
  ChangeRisk,
  ConnectorRecord,
  EvidenceWithVerification,
  FindingBlastRadius,
  FindingRiskContext,
  GovernanceFindingContext,
  NetworkExposure,
  RemediationActionProposal,
  RemediationActionType,
  RemediationEvidenceUsed,
  RemediationIntelligenceAction,
  RemediationIntelligenceSource,
} from "@nexus/shared-types";
import {
  actionDefFor,
  applyRemediationAction,
  buildProposal,
  defaultActionForControl,
  isActionAllowedForAsset,
  REMEDIATION_ACTIONS,
} from "./remediation";
import { EXPOSURE_LABEL } from "./risk";
import { connectorModeFor } from "./connectors";
import { getAssetControlById } from "./controls";

// ---------------------------------------------------------------------------
// PHASE 6 — AI remediation intelligence engine.
//
// Fully deterministic, evidence-grounded plan builder. The model (when a live
// AI provider is reachable) may only enrich prose fields after the structured
// plan passes `validateAiRemediationPlanShape`; it can never invent evidence,
// bypass approval, or change the risk classification. When AI is unreachable
// the engine still produces this baseline guidance so the product stays
// usable, clearly labeled "Baseline remediation guidance".
// ---------------------------------------------------------------------------

export const BASELINE_REMEDIATION_LABEL = "Baseline remediation guidance";

const CHANGE_RISK_SET: ChangeRisk[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "REVIEW_REQUIRED"];

export interface IntelligenceEvidenceInput extends Pick<EvidenceWithVerification, "id" | "evidenceId" | "controlId" | "evidenceType" | "observedValue" | "expectedValue" | "source" | "integrityHash"> {
  confidence?: number;
  verification?: { verified: boolean };
}

export interface RemediationIntelligenceInput {
  finding: AssetFinding;
  asset: AssetRecord;
  allAssets: AssetRecord[];
  evidence: IntelligenceEvidenceInput[];
  riskContext: FindingRiskContext;
  governanceContext?: GovernanceFindingContext;
  connector?: ConnectorRecord;
  /** Structured action from the existing remediation catalogue. */
  actionType: RemediationActionType;
  id: string;
  version: number;
  createdBy: string;
  provider: AiProviderMode;
  model?: string;
  // Live-AI prose enrichment — applied only onto the validated deterministic plan.
  summaryOverride?: string;
  rootCauseOverride?: string;
  potentialImpactOverride?: string;
  changeRiskReasonOverride?: string;
  confidenceOverride?: number;
}

// ---------------------------------------------------------------------------
// Change-risk classification (change blast radius ≠ finding severity).
// ---------------------------------------------------------------------------

const ACTION_IMPACT_WEIGHT: Record<"LOW" | "MEDIUM" | "HIGH", number> = { LOW: 10, MEDIUM: 22, HIGH: 40 };
const EXPOSURE_WEIGHT: Record<NetworkExposure, number> = { INTERNET_FACING: 16, DMZ: 12, PARTNER: 8, RESTRICTED: 4, INTERNAL: 0 };
const ENV_WEIGHT: Record<AssetEnvironment, number> = { PROD_SIM: 14, PRODUCTION: 20, DR: 7, STAGING: 3, DEVELOPMENT: 0 };

export function changeRiskFor(input: {
  actionImpact: "LOW" | "MEDIUM" | "HIGH";
  exposure: NetworkExposure;
  environment: AssetEnvironment;
  blast: FindingBlastRadius;
  rollbackAvailable: boolean;
  destructiveInProd: boolean;
  connectorAuthorized: boolean;
}): { risk: ChangeRisk; reason: string } {
  const weight =
    ACTION_IMPACT_WEIGHT[input.actionImpact] +
    EXPOSURE_WEIGHT[input.exposure] +
    ENV_WEIGHT[input.environment] +
    Math.min(10, input.blast.criticalAssetsAffected * 3) +
    (input.blast.crossRegion ? 6 : 0) +
    Math.min(6, input.blast.servicesAffected * 2);

  let risk: ChangeRisk = weight >= 70 ? "CRITICAL" : weight >= 48 ? "HIGH" : weight >= 28 ? "MEDIUM" : "LOW";
  if (!input.rollbackAvailable) risk = "REVIEW_REQUIRED";
  if (input.destructiveInProd) risk = "REVIEW_REQUIRED";
  if (!input.connectorAuthorized) risk = risk === "LOW" || risk === "MEDIUM" ? "REVIEW_REQUIRED" : risk;

  const parts = [
    `action ${input.actionImpact.toLowerCase()} impact (${weight >= 70 ? "cr" : ""}${risk})`,
    `${EXPOSURE_LABEL[input.exposure].toLowerCase()} exposure`,
    `${input.environment} environment`,
    `${input.blast.criticalAssetsAffected} critical/high downstream`,
    `${input.blast.servicesAffected} service type(s)`,
    input.blast.crossRegion ? "cross-region blast radius" : null,
    input.rollbackAvailable ? "rollback available" : "rollback NOT available",
  ].filter(Boolean);
  const reason = `Classified ${risk} — ${parts.join(", ")}.`;

  return { risk, reason };
}

// ---------------------------------------------------------------------------
// Evidence grounding
// ---------------------------------------------------------------------------

export function evidenceUsedFor(evidence: IntelligenceEvidenceInput[]): RemediationEvidenceUsed[] {
  const seen = new Set<string>();
  const out: RemediationEvidenceUsed[] = [];
  for (const e of evidence) {
    if (seen.has(e.evidenceId)) continue;
    seen.add(e.evidenceId);
    out.push({
      evidenceId: e.evidenceId,
      controlId: e.controlId,
      evidenceType: e.evidenceType,
      observedValue: e.observedValue,
      expectedValue: e.expectedValue,
      source: e.source,
      verified: Boolean(e.verification?.verified),
      hash: e.integrityHash,
    });
  }
  return out;
}

/** 0–1 confidence derived purely from the available evidence quality. */
export function confidenceFromEvidence(evidence: IntelligenceEvidenceInput[]): number {
  if (evidence.length === 0) return 0.3;
  const verified = evidence.filter((e) => e.verification?.verified).length;
  const avgConf = evidence.reduce((s, e) => s + (e.confidence ?? 0.8), 0) / evidence.length;
  let c = 0.4 + 0.3 * (verified / evidence.length) + 0.3 * avgConf;
  if (verified === 0) c = Math.min(c, 0.65);
  return Math.round(Math.min(0.98, Math.max(0.3, c)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Root cause — grounded in evidence or explicitly "cannot determine".
// ---------------------------------------------------------------------------

function rootCauseStatement(finding: AssetFinding, asset: AssetRecord): string {
  const v = asset.observedState;
  if (finding.controlId === "TLS-001" && v.tlsMinVersion) return `Observed minimum TLS ${String(v.tlsMinVersion)} is below the required TLS 1.2 — legacy cipher policy from an older hardening baseline.`;
  if (finding.controlId === "DB-001") return "Database encryption at rest is not enabled for this deployment.";
  if (finding.controlId === "DB-002" && v.dbBindAddress === "0.0.0.0") return "Database listener bound to 0.0.0.0 — outside the data zone binding policy.";
  if (v.plaintextSecrets === true) return "Secrets stored in plaintext configuration — no vault integration for this deployment.";
  if (v.mqAuthRequired === false) return "Broker allows anonymous connections — authentication not enabled on the vhost.";
  if (v.certDaysToExpiry != null && Number(v.certDaysToExpiry) < 30) return "Certificate near expiry — not rotated within the renewal window.";
  if (v.firewallAnyRules && Number(v.firewallAnyRules) > 5) return "Firewall policy contains excessive broad allow rules replacing least-privilege entries.";
  if (v.configChecksum && v.configChecksum !== v.expectedChecksum) return "Deployed configuration checksum differs from the approved baseline — drift detected.";
  const rooted = finding.observedValue
    ? `Observed "${finding.observedValue}" for ${finding.controlId} while the baseline expects "${finding.expectedValue ?? "a compliant value"}", per evidence.`
    : `Configuration evidence for ${finding.controlId} on ${asset.name} is inconsistent with the required baseline.`;
  return rooted;
}

export function rootCauseFor(finding: AssetFinding, asset: AssetRecord, evidence: IntelligenceEvidenceInput[]): { statement: string; certainty: "EVIDENCE_GROUNDED" | "INSUFFICIENT_EVIDENCE" } {
  if (evidence.length === 0) {
    return { statement: "Root cause cannot be determined from the available evidence.", certainty: "INSUFFICIENT_EVIDENCE" };
  }
  const statement = evidence.every((e) => !e.verification?.verified)
    ? `${rootCauseStatement(finding, asset)} (based on unverified evidence — treat as provisional).`
    : rootCauseStatement(finding, asset);
  return { statement, certainty: "EVIDENCE_GROUNDED" };
}

// ---------------------------------------------------------------------------
// Structured recommended actions
// ---------------------------------------------------------------------------

const CONFIG_AREA: Partial<Record<RemediationActionType, string>> = {
  SET_TLS_MIN_VERSION: "TLS configuration",
  ENFORCE_STRONG_CIPHERS: "Cipher suites",
  ENABLE_DB_ENCRYPTION: "Database encryption at rest",
  RESTRICT_DB_BIND: "Database listener binding",
  REVOKE_AND_RENEW_CERTIFICATE: "Certificate lifecycle",
  DISABLE_INSECURE_PROTOCOL: "Protocol listeners",
  CONSOLIDATE_FIREWALL_RULE: "Firewall policy",
};

const EXPECTED_STATE: Partial<Record<RemediationActionType, string>> = {
  SET_TLS_MIN_VERSION: "minimum TLS ≥ 1.2",
  ENFORCE_STRONG_CIPHERS: "strong cipher profile",
  ENABLE_DB_ENCRYPTION: "encryption at rest enabled (TDE)",
  RESTRICT_DB_BIND: "listener bound to internal zone",
  REVOKE_AND_RENEW_CERTIFICATE: "certificate renewed (days-to-expiry ≥ 330)",
  DISABLE_INSECURE_PROTOCOL: "insecure protocols disabled",
  CONSOLIDATE_FIREWALL_RULE: "least-privilege rules, default-deny",
};

const COMPLEMENTARY_ACTIONS: Record<string, RemediationActionType> = {
  "TLS-001": "ENFORCE_STRONG_CIPHERS",
  "DB-001": "RESTRICT_DB_BIND",
};

export function structuredActionsFor(input: RemediationIntelligenceInput): RemediationIntelligenceAction[] {
  const { finding, asset, actionType } = input;
  const proposal = buildProposal(finding.controlId, asset.assetType, "");
  const primary = actionFromDef(input, actionDefFor(actionType), proposal);

  const complementaryType = COMPLEMENTARY_ACTIONS[finding.controlId];
  if (complementaryType && complementaryType !== actionType && isActionAllowedForAsset(complementaryType, asset.assetType)) {
    const secProposal = buildProposal(finding.controlId, asset.assetType, "");
    return [primary, actionFromDef(input, actionDefFor(complementaryType), secProposal)];
  }
  return [primary];
}

function actionFromDef(input: RemediationIntelligenceInput, def: (typeof REMEDIATION_ACTIONS)[RemediationActionType], proposal: RemediationActionProposal): RemediationIntelligenceAction {
  const { finding, asset, riskContext, connector } = input;
  const risk = changeRiskFor({
    actionImpact: def.impact,
    exposure: riskContext.exposure,
    environment: asset.environment,
    blast: riskContext.blastRadius,
    rollbackAvailable: def.rollbackAvailable,
    destructiveInProd: isDestructiveInProd(def.actionType, asset.environment),
    connectorAuthorized: connector ? (connector.authorizedActions ?? []).includes(def.actionType) : false,
  });
  return {
    action: def.describe(def.proposal ?? proposal.parameters),
    actionType: def.actionType,
    target: asset.name,
    configArea: CONFIG_AREA[def.actionType] ?? def.displayName,
    expectedState: EXPECTED_STATE[def.actionType] ?? def.describe(def.proposal ?? proposal.parameters),
    reason: `Matches the evaluated control ${finding.controlId} (observed "${finding.observedValue ?? "from evidence"}" vs expected "${finding.expectedValue ?? "baseline"}") on ${asset.name}.`,
    changeRisk: risk.risk,
    requiresApproval: true,
  };
}

function isDestructiveInProd(actionType: RemediationActionType, environment: AssetEnvironment): boolean {
  if (environment !== "PRODUCTION") return false;
  return actionType === "ROTATE_AND_SCREEN_SECRETS" || actionType === "UPGRADE_SERVICE_VERSION" || actionType === "CONSOLIDATE_FIREWALL_RULE";
}

// ---------------------------------------------------------------------------
// Pre-checks, validation plan, rollback plan, expected result, impact
// ---------------------------------------------------------------------------

export function preChecksFor(input: RemediationIntelligenceInput): AiRemediationPreCheck[] {
  const { asset, actionType } = input;
  const blast = input.riskContext.blastRadius;
  const checks: Array<{ check: string; rationale: string }> = [
    {
      check: `Confirm the current state of ${asset.name} matches the evidence before making any change.`,
      rationale: "Guards against drift between evidence capture and change execution.",
    },
    {
      check: `Confirm the ${blast.affectedAssetCount} downstream dependent(s) of ${asset.name} are accounted for in the change window.`,
      rationale: `Blast radius awareness — ${blast.servicesAffected} service type(s) may be affected.`,
    },
    {
      check: `Confirm a full snapshot of ${asset.name} is retained so the change can be rolled back.`,
      rationale: "Rollback restores exactly the pre-change observed state.",
    },
  ];
  const specific: Partial<Record<RemediationActionType, { check: string; rationale: string }>> = {
    SET_TLS_MIN_VERSION: {
      check: `Confirm all clients that connect to ${asset.name} negotiate TLS 1.2+ before legacy versions are disabled.`,
      rationale: "Disabling TLS 1.0/1.1 without client confirmation can break legacy clients.",
    },
    ENABLE_DB_ENCRYPTION: {
      check: `Confirm a maintenance window is available on ${asset.name} for encryption enablement.`,
      rationale: "Encryption at rest enablement requires a coordinated service window.",
    },
  };
  const s = specific[actionType];
  if (s) checks.push(s);
  return checks.map((c, i) => ({ id: `pre-${i + 1}`, check: c.check, rationale: c.rationale }));
}

export function validationStepsFor(input: RemediationIntelligenceInput): AiRemediationValidationStep[] {
  const { finding, asset, actionType } = input;
  const blast = input.riskContext.blastRadius;
  const def = actionDefFor(actionType);
  const steps: AiRemediationValidationStep[] = [
    {
      phase: "BEFORE",
      step: `Confirm ${finding.controlId} currently evaluates FAIL on ${asset.name} (evidence observed "${finding.observedValue ?? "from scan"}").`,
      expectedControl: `${finding.controlId} → FAIL`,
    },
    {
      phase: "CHANGE",
      step: `Apply ${def.displayName} in the controlled environment — ${def.describe(def.proposal)}.`,
    },
    {
      phase: "AFTER",
      step: `Re-scan ${asset.name} and require control ${finding.controlId} to evaluate PASS.`,
      expectedControl: `${finding.controlId} → PASS`,
    },
  ];
  if (blast.affectedAssetCount > 0) {
    steps.push({
      phase: "AFTER",
      step: `Confirm no unexpected new findings appear among downstream services (${blast.affectedServices.length ? blast.affectedServices.join(", ") : `${blast.affectedAssetCount} asset(s)`}).`,
      expectedEvidence: "post-change scan clean",
    });
  }
  return steps;
}

export function rollbackStepsFor(input: RemediationIntelligenceInput): { steps: AiRemediationRollbackStep[]; status: "AVAILABLE" | "ROLLBACK_REVIEW_REQUIRED" } {
  const { asset, actionType } = input;
  const def = actionDefFor(actionType);
  if (!def.rollbackAvailable) {
    return {
      steps: [{ step: `Rollback is NOT available for ${actionType} — restoration requires specialist review and manual configuration of ${asset.name}.` }],
      status: "ROLLBACK_REVIEW_REQUIRED",
    };
  }
  const steps: AiRemediationRollbackStep[] = [
    { step: `Restore the retained snapshot of ${asset.name} to its pre-change observed state.` },
  ];
  const specific: Partial<Record<RemediationActionType, string>> = {
    SET_TLS_MIN_VERSION: "If a dependent client fails after legacy TLS is disabled, restore the prior TLS configuration from the snapshot before resuming.",
    ENABLE_DB_ENCRYPTION: "Disable encryption through the connector rollback path and confirm the listener returns to its prior binding.",
    REVOKE_AND_RENEW_CERTIFICATE: "Re-serve the previous certificate from the trust chain backup.",
  };
  const s = specific[actionType];
  if (s) steps.push({ step: s });
  steps.push({ step: `Re-scan ${asset.name} and confirm the finding returns to its prior status (rollback verified).` });
  return { steps, status: "AVAILABLE" };
}

export function expectedResultFor(input: RemediationIntelligenceInput): string {
  return `${actionDefFor(input.actionType).displayName} applied to ${input.asset.name}; re-scan confirms ${input.finding.controlId} → PASS with no new findings in the downstream blast radius.`;
}

// ---------------------------------------------------------------------------
// Connector awareness (vendor-aware; never invents commands)
// ---------------------------------------------------------------------------

export function connectorNotesFor(input: RemediationIntelligenceInput): { capabilities: string[]; unavailable: string[] } {
  const { connector, actionType, asset } = input;
  if (!connector) {
    return {
      capabilities: [],
      unavailable: [`No ONLINE connector is available for ${asset.assetType} — automated execution is not possible until a connector is authorized.`],
    };
  }
  const cap = `${connector.name} (${connector.transportType}/${connector.protocol}) — capabilities: ${(connector.capabilities ?? []).join(", ")}.`;
  if (!(connector.authorizedActions ?? []).includes(actionType)) {
    return {
      capabilities: [cap, `Connector does not currently authorize the ${actionType} action.`],
      unavailable: [`${actionType} is not in ${connector.id} authorizedActions — a human must enable it in the connector policy before execution.`],
    };
  }
  return {
    capabilities: [cap, `Authorized to apply ${actionType} via a ${connectorModeFor(connector).toLowerCase()} adapter.`],
    unavailable: [],
  };
}

// ---------------------------------------------------------------------------
// Reasoning chain ("Why this remediation?")
// ---------------------------------------------------------------------------

export function whyThisRemediationFor(input: RemediationIntelligenceInput): string[] {
  const { finding, asset, riskContext, evidence, actionType, connector } = input;
  const control = getAssetControlById(finding.controlId);
  const def = actionDefFor(actionType);
  const chain: string[] = [];
  const top = evidence[0];
  if (top) {
    chain.push(`Evidence: ${top.controlId} observed "${top.observedValue}" where "${top.expectedValue}" is expected (source ${top.source}, ${top.verification?.verified ? "verified" : "unverified"}).`);
  } else {
    chain.push("Evidence: no machine evidence was collected for this finding, so guidance is provisional.");
  }
  chain.push(`Control: ${finding.controlId} (${control?.name ?? finding.controlName}) reports ${finding.status.toLowerCase()} on ${asset.name}: ${finding.why}`);
  chain.push(`Risk: ${riskContext.riskScore}/100 (${riskContext.riskLevel}) with ${EXPOSURE_LABEL[riskContext.exposure].toLowerCase()} exposure on ${asset.name}.`);
  chain.push(
    `Impact: blast radius spans ${riskContext.blastRadius.affectedAssetCount} downstream asset(s), ${riskContext.blastRadius.criticalAssetsAffected} critical/high, ${riskContext.blastRadius.regionsAffected.length} region(s) — potential-impact score ${riskContext.impactScore}/100.`
  );
  chain.push(`Action: ${def.displayName} on ${asset.name} — ${def.describe(def.proposal)}, change risk ${changeRiskFor({ actionImpact: def.impact, exposure: riskContext.exposure, environment: asset.environment, blast: riskContext.blastRadius, rollbackAvailable: def.rollbackAvailable, destructiveInProd: isDestructiveInProd(def.actionType, asset.environment), connectorAuthorized: connector ? (connector.authorizedActions ?? []).includes(def.actionType) : false }).risk}.`);
  chain.push("Approval: this change requires a human approval before it can be executed — the AI never executes changes itself.");
  return chain;
}

// ---------------------------------------------------------------------------
// Baseline guidance content (label used when AI is unavailable)
// ---------------------------------------------------------------------------

export function baselineGuidanceFor(input: RemediationIntelligenceInput): { summary: string; steps: string[] } {
  const { finding, asset, actionType, riskContext } = input;
  const def = actionDefFor(actionType);
  const based = defaultActionForControl(finding.controlId);
  const steps = [
    `Apply ${def.displayName} to ${asset.name} in a controlled change window.`,
    `Pre-check: confirm the ${riskContext.blastRadius.affectedAssetCount} downstream dependent(s) support the change before execution.`,
    `Validate the change in the sandbox, then submit for human approval.`,
    `Re-scan ${asset.name} to confirm ${finding.controlId} → PASS.`,
    `If verification fails, roll back to the retained pre-change snapshot.`,
  ];
  const summary = based
    ? `Baseline remediation guidance for ${finding.controlId} on ${asset.name}: ${def.displayName} addresses the observed finding.`
    : `Baseline remediation guidance for ${finding.controlId} on ${asset.name}: apply the catalogue-approved structured action (${def.displayName}) within the normal validate → approve → execute → verify → rollback workflow.`;
  return { summary, steps };
}

// ---------------------------------------------------------------------------
// Build the structured intelligence object (deterministic engine)
// ---------------------------------------------------------------------------

export function buildRemediationIntelligence(input: RemediationIntelligenceInput): AiRemediationIntelligence {
  const { finding, asset, riskContext, evidence, connector, actionType, id, version, createdBy, provider, model } = input;
  const def = actionDefFor(actionType);
  const hasLiveProse = Boolean(input.summaryOverride || input.rootCauseOverride || input.potentialImpactOverride);
  const source: RemediationIntelligenceSource = provider === "live" && hasLiveProse ? "ai" : "deterministic";

  const rootCause = input.rootCauseOverride
    ? { statement: input.rootCauseOverride, certainty: "EVIDENCE_GROUNDED" as const }
    : rootCauseFor(finding, asset, evidence);

  const primaryRisk = changeRiskFor({
    actionImpact: def.impact,
    exposure: riskContext.exposure,
    environment: asset.environment,
    blast: riskContext.blastRadius,
    rollbackAvailable: def.rollbackAvailable,
    destructiveInProd: isDestructiveInProd(def.actionType, asset.environment),
    connectorAuthorized: connector ? (connector.authorizedActions ?? []).includes(def.actionType) : false,
  });

  const evidenceUsed = evidenceUsedFor(evidence);
  const verifiedCount = evidenceUsed.filter((e) => e.verified).length;
  const blast = riskContext.blastRadius;
  const unavailable: string[] = [];
  if (evidence.length === 0) unavailable.push("No evidence records for this finding were collected by the connector.");
  if (evidence.length > 0 && verifiedCount === 0) unavailable.push("None of the referenced evidence is integrity-verified — values are provisional.");
  if (!finding.expectedValue) unavailable.push(`Expected/baseline value for ${finding.controlId} is unavailable — treat comparison as provisional.`);
  if (connector && !(connector.authorizedActions ?? []).includes(actionType)) unavailable.push(`${actionType} is not authorized on ${connector.name} — execution requires human policy change.`);
  if (!connector) unavailable.push("No ONLINE connector is available for automated execution.");
  if (asset.environment === "PRODUCTION") unavailable.push("Environment is real production — the change risk requires a specialist change review.");

  const baseline = baselineGuidanceFor(input);
  const connectorNotes = connectorNotesFor(input);
  const rollback = rollbackStepsFor(input);

  const disclaimer =
    provider === "live" && source === "ai"
      ? "AI-assisted remediation intelligence grounded in the supplied evidence; a human approves and executes every change."
      : `${BASELINE_REMEDIATION_LABEL} — deterministic guidance derived from the control catalogue and available evidence. For live AI remediation intelligence, connect an AI provider; meanwhile the approval workflow remains fully operational.`;

  const potentialImpact = input.potentialImpactOverride ?? impactSentence(input);

  return {
    id,
    findingId: finding.id,
    assetId: asset.id,
    assetName: asset.name,
    controlId: finding.controlId,
    version,
    summary: input.summaryOverride ?? baseline.summary,
    rootCause: rootCause.statement,
    rootCauseCertainty: rootCause.certainty,
    evidenceUsed,
    recommendedActions: structuredActionsFor(input),
    preChecks: preChecksFor(input),
    changeRisk: primaryRisk.risk,
    changeRiskReason: input.changeRiskReasonOverride ?? primaryRisk.reason,
    potentialImpact,
    blastRadius: blast,
    validationSteps: validationStepsFor(input),
    rollbackSteps: rollback.steps,
    rollbackStatus: rollback.status,
    expectedResult: expectedResultFor(input),
    confidence: input.confidenceOverride ?? confidenceFromEvidence(evidence),
    requiresApproval: true,
    connectorCapabilities: connectorNotes.capabilities,
    unavailable: [...unavailable, ...connectorNotes.unavailable],
    source,
    provider,
    model: model ?? (provider === "live" ? "nexus-remediation-live-v1" : "nexus-remediation-intelligence-v1"),
    disclaimer,
    whyThisRemediation: whyThisRemediationFor(input),
    createdAt: new Date().toISOString(),
    createdBy,
  };
}

function impactSentence(input: RemediationIntelligenceInput): string {
  const { asset, riskContext } = input;
  const blast = riskContext.blastRadius;
  const exposure = EXPOSURE_LABEL[riskContext.exposure].toLowerCase();
  const regions = blast.regionsAffected.join(", ");
  return `Change applies to ${asset.name} (${exposure}), a ${asset.criticality.toLowerCase()} criticality asset. Blast radius spans ${blast.affectedAssetCount} downstream asset(s) across ${regions}: ${blast.criticalAssetsAffected} critical/high, ${blast.servicesAffected} service type(s)${blast.crossRegion ? "; cross-region propagation" : ""}. Potential-impact score ${riskContext.impactScore}/100. Potential impact only — never a confirmed compromise.`;
}

// ---------------------------------------------------------------------------
// Structural validation — reject malformed AI output BEFORE it is saved
// ---------------------------------------------------------------------------

export interface ShapeValidation {
  ok: boolean;
  errors: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateAiRemediationPlanShape(raw: unknown): ShapeValidation {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ["plan must be an object"] };

  const str = (key: string): string | undefined => (typeof raw[key] === "string" && (raw[key] as string).trim().length > 0 ? (raw[key] as string) : undefined);
  if (!str("summary")) errors.push("summary is required and must be a non-empty string");
  if (!str("rootCause")) errors.push("rootCause is required and must be a non-empty string");
  if (raw["rootCauseCertainty"] !== "EVIDENCE_GROUNDED" && raw["rootCauseCertainty"] !== "INSUFFICIENT_EVIDENCE") errors.push("rootCauseCertainty must be EVIDENCE_GROUNDED or INSUFFICIENT_EVIDENCE");

  if (!Array.isArray(raw["evidenceUsed"])) errors.push("evidenceUsed must be an array");
  else {
    const estr = (e: unknown, key: string): string | undefined => {
      const rec = e as Record<string, unknown>;
      return typeof rec[key] === "string" ? String(rec[key]) : undefined;
    };
    raw["evidenceUsed"].forEach((e, i) => {
      if (!isRecord(e)) return errors.push(`evidenceUsed[${i}] must be an object`);
      if (!estr(e, "evidenceId")) errors.push(`evidenceUsed[${i}].evidenceId is required`);
      if (!estr(e, "controlId")) errors.push(`evidenceUsed[${i}].controlId is required`);
      if (!estr(e, "observedValue")) errors.push(`evidenceUsed[${i}].observedValue is required`);
    });
  }

  if (!Array.isArray(raw["recommendedActions"]) || raw["recommendedActions"].length === 0) errors.push("recommendedActions must be a non-empty array");
  else {
    raw["recommendedActions"].forEach((a, i) => {
      if (!isRecord(a)) return errors.push(`recommendedActions[${i}] must be an object`);
      if (typeof a["actionType"] !== "string") errors.push(`recommendedActions[${i}].actionType is required`);
      if (a["requiresApproval"] !== true) errors.push(`recommendedActions[${i}].requiresApproval must be true (AI never bypasses approval)`);
      if (typeof a["action"] !== "string" || (a["action"] as string).trim().length === 0) errors.push(`recommendedActions[${i}].action is required`);
    });
  }

  if (!Array.isArray(raw["preChecks"])) errors.push("preChecks must be an array");
  else if (raw["preChecks"].some((p) => !isRecord(p) || typeof p["check"] !== "string" || (p["check"] as string).trim().length === 0)) errors.push("preChecks entries require a non-empty check string");

  if (!CHANGE_RISK_SET.includes(raw["changeRisk"] as ChangeRisk)) errors.push(`changeRisk must be one of ${CHANGE_RISK_SET.join(", ")}`);

  if (!Array.isArray(raw["validationSteps"]) || raw["validationSteps"].length === 0) errors.push("validationSteps must be a non-empty array");
  else {
    raw["validationSteps"].forEach((v, i) => {
      if (!isRecord(v)) return errors.push(`validationSteps[${i}] must be an object`);
      const phase = v["phase"];
      if (phase !== "BEFORE" && phase !== "CHANGE" && phase !== "AFTER") errors.push(`validationSteps[${i}].phase must be BEFORE, CHANGE or AFTER`);
      if (typeof v["step"] !== "string" || (v["step"] as string).trim().length === 0) errors.push(`validationSteps[${i}].step is required`);
    });
  }

  if (!Array.isArray(raw["rollbackSteps"])) errors.push("rollbackSteps must be an array");
  else if (raw["rollbackSteps"].some((r) => !isRecord(r) || typeof r["step"] !== "string" || (r["step"] as string).trim().length === 0)) errors.push("rollbackSteps entries require a non-empty step string");

  if (raw["rollbackStatus"] !== "AVAILABLE" && raw["rollbackStatus"] !== "ROLLBACK_REVIEW_REQUIRED") errors.push("rollbackStatus must be AVAILABLE or ROLLBACK_REVIEW_REQUIRED");

  if (typeof raw["confidence"] !== "number" || raw["confidence"] < 0 || raw["confidence"] > 1) errors.push("confidence must be a number between 0 and 1");
  if (raw["requiresApproval"] !== true) errors.push("requiresApproval must be true (AI never executes changes and never short-circuits approval)");
  if (!isRecord(raw["blastRadius"])) errors.push("blastRadius must be an object");
  if (!Array.isArray(raw["connectorCapabilities"])) errors.push("connectorCapabilities must be an array");
  if (!Array.isArray(raw["unavailable"])) errors.push("unavailable must be an array");

  const source = raw["source"];
  if (source !== "ai" && source !== "deterministic" && source !== "baseline") errors.push("source must be ai, deterministic or baseline");

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Safe live-provider mapping — prose fields only, structure is never trusted
// ---------------------------------------------------------------------------

export interface LiveRemediationOverrides {
  summary?: string;
  rootCause?: string;
  potentialImpact?: string;
  changeRiskReason?: string;
  confidence?: number;
}

export function liveRemediationOverrides(raw: unknown): LiveRemediationOverrides | null {
  if (!isRecord(raw)) return null;
  const out: LiveRemediationOverrides = {};
  for (const key of ["summary", "rootCause", "potentialImpact", "changeRiskReason"] as const) {
    const s = raw[key];
    if (typeof s === "string" && s.trim().length > 0) out[key] = s.trim();
  }
  const conf = raw["confidence"];
  if (typeof conf === "number" && conf >= 0 && conf <= 1) out.confidence = Math.round(conf * 100) / 100;
  return Object.keys(out).length > 0 ? out : null;
}

export { actionDefFor, applyRemediationAction };