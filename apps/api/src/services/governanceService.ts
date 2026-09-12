import { promises as fs } from "fs";
import { join } from "path";
import type {
  ApprovalDecision,
  ApprovalRecord,
  CompliancePassport,
  GovernanceAuditEvent,
  GovernanceDashboardStats,
  OrganizationProfile,
  RollbackRecord,
  TelemetryPoint,
  VerificationResult,
} from "@nexus/shared-types";
import { ApiError } from "./reviewService";
import {
  DEFAULT_ORG,
  SEED_ORG_PROFILES,
  computePassport,
  computeChangeImpact,
  runSimulation,
  detectExceptions,
  computeDrift,
  computeRegionConflicts,
  regulatoryUpdates,
  averageVendorRisk,
  blastRadiusOf,
  PRESET_CONFIGS,
  GRAPH_NODES,
  demoSintenarioById,
  evaluateGovernance,
  evaluateFramework,
  governanceContext,
  type PassportStateInput,
} from "@nexus/governance-core";
import { getRepository } from "../storage/jsonRepo";

type ChangeRequestWide = import("@nexus/shared-types").ChangeRequest & {
  __scenarioId?: string;
  rollbacks?: RollbackRecord[];
  verifications?: VerificationResult[];
};
type FreezeState = { active: boolean; reason?: string; until?: string; triggeredAt?: string };

export interface GovState {
  org: OrganizationProfile;
  changes: ChangeRequestWide[];
  exceptions: import("@nexus/shared-types").ComplianceException[];
  approvals: ApprovalRecord[];
  events: GovernanceAuditEvent[];
  freeze: FreezeState;
  suppressedDrift: string[];
}

const REVIEWER = { id: "usr-reviewer", displayName: "Security Review Lead", role: "reviewer" };
const SYSTEM_OWNER = { id: "usr-owner", displayName: "System Owner", role: "reviewer" };
const AUDITOR = { id: "usr-auditor", displayName: "CISO (Auditor)", role: "reviewer" };
const fsPath = join(process.cwd(), "data", "governance.json");

let state: GovState | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function daysAgo(d: number, hours = 0): string {
  return new Date(Date.now() - (d * 24 + hours) * 3600_000).toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function event(
  type: GovernanceAuditEvent["eventType"],
  actorType: "ai" | "human" | "system",
  action: string,
  target: string,
  targetType: string,
  opts: Partial<GovernanceAuditEvent> = {}
): GovernanceAuditEvent {
  return {
    id: uid("evt"),
    eventType: type,
    actor: opts.actor ?? (actorType === "ai" ? "NEXUS AI" : actorType === "system" ? "System" : REVIEWER.displayName),
    actorType,
    action,
    target,
    targetType,
    reason: opts.reason,
    previousState: opts.previousState,
    newState: opts.newState,
    at: opts.at ?? nowIso(),
    detail: opts.detail ?? {},
  };
}

const MFA_BEFORE = [
  { key: "auth.mfa.privileged", label: "MFA for privileged access", value: "disabled", category: "Identity" },
  { key: "auth.local.enabled", label: "Local account login", value: "enabled", category: "Identity" },
  { key: "auth.radius.legacy", label: "Legacy RADIUS fallback", value: "enabled", category: "Identity" },
];
const MFA_AFTER = [
  { key: "auth.mfa.privileged", label: "MFA for privileged access", value: "enabled", category: "Identity" },
  { key: "auth.local.enabled", label: "Local account login", value: "disabled", category: "Identity" },
  { key: "auth.radius.legacy", label: "Legacy RADIUS fallback", value: "disabled", category: "Identity" },
];
const TLS_BEFORE = [
  { key: "tls.version.min", label: "TLS minimum version", value: "1.2", category: "Crypto" },
  { key: "tls.cipher.legacy", label: "Legacy cipher allowance", value: "enabled", category: "Crypto" },
];
const TLS_AFTER = [
  { key: "tls.version.min", label: "TLS minimum version", value: "1.3", category: "Crypto" },
  { key: "tls.cipher.legacy", label: "Legacy cipher allowance", value: "disabled", category: "Crypto" },
];
const LOG_BEFORE = [
  { key: "log.enabled", label: "Logging enabled", value: "true", category: "Monitoring" },
  { key: "log.siem.stream", label: "SIEM streaming", value: "enabled", category: "Monitoring" },
  { key: "log.retention", label: "Log retention (days)", value: "30", category: "Monitoring" },
];
const LOG_AFTER = [
  { key: "log.enabled", label: "Logging enabled", value: "true", category: "Monitoring" },
  { key: "log.siem.stream", label: "SIEM streaming", value: "enabled", category: "Monitoring" },
  { key: "log.retention", label: "Log retention (days)", value: "180", category: "Monitoring" },
];

function seedState(): GovState {
  const s: GovState = {
    org: { ...DEFAULT_ORG },
    changes: [],
    exceptions: [],
    approvals: [],
    events: [],
    freeze: { active: false },
    suppressedDrift: [],
  };
  const pushEvent = (e: GovernanceAuditEvent) => {
    s.events.unshift(e);
  };

  const mfa: ChangeRequestWide = {
    id: "chg-mfa",
    title: "Enforce MFA for privileged access",
    description: "Enable MFA on privileged accounts and remove legacy fallback authentication.",
    status: "APPROVAL_REQUIRED",
    risk: "HIGH",
    targetSystems: ["identity", "admin", "api-gw", "idp-legacy"],
    configBefore: MFA_BEFORE,
    configAfter: MFA_AFTER,
    organizationId: DEFAULT_ORG.id,
    reason: "Privileged access lacks multi-factor authentication.",
    expectedBenefit: "Prevent credential-based compromise of privileged accounts.",
    aiConfidence: 82,
    aiSummary: "AI analysis: MFA not enforced for privileged access. 5 affected controls across 8 frameworks.",
    remediationPlan: {
      findingRef: "MFA-PRIV-001",
      findingTitle: "MFA not enforced for privileged access",
      recommendation: "Enable MFA policy and remove legacy authentication fallback.",
      aiConfidence: 82,
      evidenceQuality: "HIGH",
      uncertainty: "LOW",
      steps: [
        { order: 1, action: "Enable MFA policy on identity provider", reason: "Block password-only privileged login", expectedBenefit: "Closes credential-theft vector", dependencies: ["Identity Service"], risk: "MEDIUM", estimatedImpact: "Admin + privileged users", requiredApprovals: ["Security Engineer"], rollbackStrategy: "Policy rollback via configuration backup" },
        { order: 2, action: "Remove legacy RADIUS fallback", reason: "Legacy fallback bypasses MFA", expectedBenefit: "No MFA bypass path", dependencies: ["Identity Service", "API Gateway"], risk: "HIGH", estimatedImpact: "Legacy clients", requiredApprovals: ["Security Engineer", "System Owner"], rollbackStrategy: "Re-enable fallback within 15 minutes" },
        { order: 3, action: "Test privileged authentication flows", reason: "Validate before production", expectedBenefit: "Confidence in change", dependencies: ["Staging"], risk: "LOW", estimatedImpact: "Staging only", requiredApprovals: [], rollbackStrategy: "N/A — test only" },
      ],
      explanation: [
        "MFA for privileged access is required by 8 applicable frameworks.",
        "Legacy fallback authentication can bypass MFA and must be removed.",
        "Legacy IdP components cannot support MFA — an exception applies.",
      ],
      mappedFrameworks: ["ISO/IEC 27001", "NIST CSF", "CIS Controls", "NIS2", "CERT-In"],
    },
    requiredApprovers: ["Security Engineer"],
    approvals: [],
    fourEyesRequired: false,
    fourEyesCompleted: false,
    rollbackPlan: "Restore identity configuration from backup; re-enable fallback for 15 minutes if auth outage occurs.",
    sourceFindingId: "find-mfa-001",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
  };
  mfa.impacts = [computeChangeImpact({ changeId: mfa.id, title: mfa.title, targetSystems: mfa.targetSystems, org: s.org, aiConfidence: mfa.aiConfidence })];
  mfa.simulations = [runSimulation({ ...mfa })];
  s.changes.push(mfa);
  s.exceptions.push({
    id: "exc-mfa-legacy",
    code: "NC-2841",
    controlId: "AUTH-001",
    controlName: "Strong Authentication",
    title: "Legacy system cannot support MFA enforcement",
    observed: "Legacy IdP and legacy auth server do not implement MFA.",
    issueType: "LEGACY_SYSTEM",
    aiConfidence: 68,
    risk: "HIGH",
    reasons: ["Automatic remediation blocked.", "Changing authentication configuration may affect a business-critical dependency."],
    autoRemediationBlocked: true,
    requiredReview: true,
    affectedSystems: ["Identity Service", "Legacy Local IdP", "Legacy Auth Server"],
    status: "OPEN",
    compensatingControls: ["Network isolation for legacy segment", "Rate limiting at the gateway", "Enhanced monitoring"],
    createdAt: daysAgo(1),
    changeId: mfa.id,
  });
  pushEvent(event("FINDING_CREATED", "ai", "Finding mapped to MFA-PRIV-001", "MFA-PRIV-001", "control", { at: daysAgo(2) }));
  pushEvent(event("REMEDIATION_PLANNED", "ai", "AI remediation plan generated", mfa.id, "change", { at: daysAgo(2) }));
  pushEvent(event("CHANGE_DRAFTED", "system", "Change request drafted from remediation plan", mfa.id, "change", { at: daysAgo(2) }));
  pushEvent(event("CHANGE_AI_ANALYZED", "ai", "AI impact analysis completed", mfa.id, "change", { at: daysAgo(2, 2) }));
  pushEvent(event("IMPACT_ANALYZED", "ai", "Blast radius computed — 8 dependent components", mfa.id, "change", { at: daysAgo(2, 3) }));
  pushEvent(event("SIMULATION_COMPLETED", "ai", "Simulation completed — conditional", mfa.id, "change", { at: daysAgo(1, 20) }));
  pushEvent(event("EXCEPTION_DETECTED", "ai", "Legacy compatibility exception raised", "NC-2841", "exception", { at: daysAgo(1, 4) }));
  pushEvent(event("APPROVAL_REQUESTED", "system", "Approval requested from Security Engineer", mfa.id, "change", { at: daysAgo(1) }));

  const tls: ChangeRequestWide = {
    id: "chg-tls",
    title: "Enforce TLS 1.3 only on API Gateway",
    description: "Disable legacy ciphers and raise the minimum TLS version to 1.3.",
    status: "SUCCESS",
    risk: "MEDIUM",
    targetSystems: ["api-gw", "portal", "mobile"],
    configBefore: TLS_BEFORE,
    configAfter: TLS_AFTER,
    organizationId: DEFAULT_ORG.id,
    reason: "Legacy TLS configurations weaken transport security.",
    expectedBenefit: "Modern cryptographic transport for all API traffic.",
    aiConfidence: 91,
    aiSummary: "AI analysis: 3 affected services, low blast radius, no legacy incompatibility detected.",
    requiredApprovers: ["Security Engineer"],
    approvals: [
      { id: "appr-tls-1", changeId: "chg-tls", approverId: REVIEWER.id, approverName: REVIEWER.displayName, approverRole: "Security Engineer", decision: "APPROVED", comment: "Approved — verified client support for TLS 1.3.", at: daysAgo(5) },
    ],
    fourEyesRequired: false,
    fourEyesCompleted: false,
    rollbackPlan: "Revert TLS policy to minimum 1.2.",
    sourceFindingId: "find-tls-001",
    createdAt: daysAgo(8),
    updatedAt: daysAgo(4),
    executedBy: REVIEWER.displayName,
    executedAt: daysAgo(4, 4),
    verifiedBy: REVIEWER.displayName,
    verifiedAt: daysAgo(4),
  };
  tls.impacts = [computeChangeImpact({ changeId: tls.id, title: tls.title, targetSystems: tls.targetSystems, org: s.org, aiConfidence: tls.aiConfidence })];
  tls.simulations = [runSimulation({ ...tls })];
  tls.verifications = [
    {
      id: "ver-tls",
      changeId: "chg-tls",
      compliance: "PASS",
      security: "PASS",
      availability: "PASS",
      dependencies: "PASS",
      evidenceCaptured: true,
      evidenceNote: "Gateway configuration exported, TLS handshake captured, health checks green for 24h.",
      overall: "PASS",
      finalStatus: "HUMAN-VERIFIED CHANGE",
      verifiedBy: REVIEWER.displayName,
      verifiedAt: daysAgo(4),
    },
  ];
  s.changes.push(tls);
  pushEvent(event("CHANGE_EXECUTED", "human", "TLS policy applied to API Gateway", tls.id, "change", { at: daysAgo(4, 4), detail: { mode: "SIMULATED" } }));
  pushEvent(event("VERIFICATION_STARTED", "system", "Post-change verification started", tls.id, "change", { at: daysAgo(4, 3) }));
  pushEvent(event("VERIFICATION_PASSED", "human", "All verification checks passed", tls.id, "change", { at: daysAgo(4), detail: { result: "HUMAN-VERIFIED CHANGE" } }));
  pushEvent(event("HUMAN_VERIFIED", "human", "Change verified and closed", tls.id, "change", { at: daysAgo(4) }));
  s.approvals.push(tls.approvals[0]);

  const logging: ChangeRequestWide = {
    id: "chg-logging",
    title: "Extend log retention and enable SIEM streaming",
    description: "Raise log retention to 180 days and stream to SIEM. Post-change telemetry shows auth failure spike.",
    status: "ROLLBACK_RECOMMENDED",
    risk: "MEDIUM",
    targetSystems: ["files", "notify", "cloud-aws"],
    configBefore: LOG_BEFORE,
    configAfter: LOG_AFTER,
    organizationId: DEFAULT_ORG.id,
    reason: "CERT-In and NIS2 require adequate log retention.",
    expectedBenefit: "Compliance with retention obligations.",
    aiConfidence: 88,
    aiSummary: "AI analysis: configuration-only change, low blast radius.",
    requiredApprovers: ["System Owner"],
    approvals: [
      { id: "appr-log-1", changeId: "chg-logging", approverId: SYSTEM_OWNER.id, approverName: SYSTEM_OWNER.displayName, approverRole: "System Owner", decision: "APPROVED", comment: "Approved.", at: daysAgo(3) },
    ],
    fourEyesRequired: false,
    fourEyesCompleted: false,
    rollbackPlan: "Revert retention to 30 days and disconnect SIEM stream.",
    sourceFindingId: "find-log-001",
    createdAt: daysAgo(6),
    updatedAt: daysAgo(1),
    executedBy: SYSTEM_OWNER.displayName,
    executedAt: daysAgo(1, 8),
  };
  logging.impacts = [computeChangeImpact({ changeId: logging.id, title: logging.title, targetSystems: logging.targetSystems, org: s.org, aiConfidence: logging.aiConfidence })];
  logging.simulations = [runSimulation({ ...logging })];
  logging.rollbacks = [
    {
      id: "rollback-logging",
      changeId: "chg-logging",
      reason: "Authentication failures +41% after change (expected <2%).",
      metrics: [
        { label: "Authentication failures", current: 41, expected: 2, unit: "%" },
        { label: "Error rate", current: 6.8, expected: 0.5, unit: "%" },
        { label: "Availability", current: 91.0, expected: 99.9, unit: "%" },
        { label: "Latency p95", current: 640, expected: 180, unit: "ms" },
      ],
      status: "ROLLED_BACK",
      initiatedAt: daysAgo(1),
      initiatedBy: REVIEWER.displayName,
      completedAt: daysAgo(1, -1),
    },
  ];
  s.changes.push(logging);
  pushEvent(event("CHANGE_EXECUTED", "human", "Retention change applied", logging.id, "change", { at: daysAgo(1, 8), detail: { mode: "SIMULATED" } }));
  pushEvent(event("ROLLBACK_RECOMMENDED", "ai", "Telemetry anomaly — authentication failures +41%", logging.id, "change", { at: daysAgo(1, 2), detail: { metric: "authentication failures" } }));
  pushEvent(event("ROLLBACK_EXECUTED", "human", "Rollback executed — retention reverted", logging.id, "change", { at: daysAgo(1) }));

  return s;
}

function persistState(s: GovState): void {
  void (async () => {
    try {
      await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
      await fs.writeFile(fsPath, JSON.stringify(s, null, 2), "utf-8");
    } catch {
      /* state stays in memory */
    }
  })();
}

async function loadState(): Promise<GovState> {
  if (state) return state;
  try {
    const raw = await fs.readFile(fsPath, "utf-8");
    const parsed = JSON.parse(raw) as GovState;
    if (parsed && Array.isArray(parsed.changes) && parsed.org) {
      state = parsed;
      return state;
    }
  } catch {
    /* fall through to seed */
  }
  state = seedState();
  void persistState(state);
  return state;
}

function commitState(s: GovState): GovState {
  persistState(s);
  state = s;
  return s;
}

export function getGovError(status: number, message: string): Error {
  return new ApiError(status, message);
}

function decorate(c: ChangeRequestWide, s: GovState): ChangeRequestWide {
  return {
    ...c,
    exceptions: s.exceptions.filter((e) => e.changeId === c.id),
    approvals: s.approvals.filter((a) => a.changeId === c.id),
  };
}

function passportInputs(s: GovState): PassportStateInput {
  return {
    openCritical: 1,
    openHigh: s.exceptions.filter((e) => e.status === "OPEN" && e.risk === "HIGH").length + s.changes.filter((c) => c.risk === "CRITICAL" && c.status === "APPROVAL_REQUIRED").length,
    activeExceptions: s.exceptions.filter((e) => e.status === "OPEN" || e.status === "UNDER_REVIEW").length,
    pendingApprovals: s.changes.filter((c) => c.status === "APPROVAL_REQUIRED").length,
    highRiskChanges: s.changes.filter((c) => (c.risk === "HIGH" || c.risk === "CRITICAL") && !["SUCCESS", "REJECTED", "ROLLED_BACK"].includes(c.status)).length,
    driftCount: computeDrift().filter((d) => d.status === "OPEN").length,
    vendorRiskAvg: averageVendorRisk(),
  };
}

export async function getPassport(): Promise<CompliancePassport> {
  const s = await loadState();
  return computePassport(s.org, passportInputs(s));
}

export async function getGovernanceDashboard(): Promise<GovernanceDashboardStats> {
  const s = await loadState();
  const changes = s.changes.map((c) => decorate(c, s));
  return {
    passport: computePassport(s.org, passportInputs(s)),
    openExceptions: s.exceptions.filter((e) => e.status === "OPEN" || e.status === "UNDER_REVIEW").length,
    pendingApprovals: changes.filter((c) => c.status === "APPROVAL_REQUIRED").length,
    highRiskChanges: changes.filter((c) => (c.risk === "HIGH" || c.risk === "CRITICAL") && !["SUCCESS", "REJECTED", "ROLLED_BACK"].includes(c.status)).length,
    activeDrift: computeDrift().filter((d) => d.status === "OPEN").length,
    avgVendorRisk: averageVendorRisk(),
    regionConflicts: computeRegionConflicts(s.org).length,
    regulatoryUpdates: regulatoryUpdates().filter((u) => u.status !== "IMPLEMENTED").length,
    freezeActive: s.freeze.active,
    recentEvents: s.events.slice(0, 12),
    changes,
    exceptions: s.exceptions,
  };
}

export function listOrgProfiles(): OrganizationProfile[] {
  return SEED_ORG_PROFILES;
}

export async function getActiveOrg(): Promise<OrganizationProfile> {
  const s = await loadState();
  return s.org;
}

export async function setActiveOrg(profile: OrganizationProfile): Promise<OrganizationProfile> {
  const s = await loadState();
  s.org = profile;
  commitState(s);
  return s.org;
}

export async function resetOrg(): Promise<CompliancePassport> {
  const s = await loadState();
  s.org = { ...DEFAULT_ORG };
  commitState(s);
  return computePassport(s.org, passportInputs(s));
}

// ---------------------------------------------------------------------------
// Deterministic policy engine (region/industry-driven framework selection)
// ---------------------------------------------------------------------------

export async function getGovernanceEvaluation() {
  const s = await loadState();
  return evaluateGovernance(s.org, passportInputs(s));
}

export async function getGovernanceContext() {
  const s = await loadState();
  return governanceContext(s.org);
}

export async function getActiveFrameworks() {
  const ev = await getGovernanceEvaluation();
  return ev.activeFrameworks;
}

export async function getFrameworkEvaluation(id: string) {
  const s = await loadState();
  const { FRAMEWORKS } = await import("@nexus/governance-core");
  const fw = FRAMEWORKS.find((f) => f.id === id);
  if (!fw) throw getGovError(404, `Framework ${id} not found`);
  return evaluateFramework(s.org, fw);
}

export async function getFrameworkMappings(id: string) {
  const { GOVERNANCE_CONTROLS, FRAMEWORKS } = await import("@nexus/governance-core");
  const s = await loadState();
  const fw = FRAMEWORKS.find((f) => f.id === id);
  if (!fw) throw getGovError(404, `Framework ${id} not found`);
  const evalResult = evaluateFramework(s.org, fw);
  const controls = GOVERNANCE_CONTROLS.filter((c) => c.mappedTo.some((m) => m.frameworkId === id) || fw.controlIds.includes(c.id)).map((c) => {
    const refs = c.mappedTo.filter((m) => m.frameworkId === id).map((m) => m.refs).flat();
    return {
      controlId: c.id,
      controlName: c.name,
      category: c.category,
      severity: c.severity,
      coreRequirement: c.coreRequirement,
      refs,
    };
  });
  return { framework: fw, applicable: evalResult, controlCount: controls.length, controls };
}

export async function listGovernanceConflicts() {
  const s = await loadState();
  return evaluateGovernance(s.org, passportInputs(s)).conflicts;
}

export async function requestConflictReview(conflictId: string) {
  const s = await loadState();
  const conflict = evaluateGovernance(s.org, passportInputs(s)).conflicts.find((c) => c.id === conflictId);
  if (!conflict) throw getGovError(404, "Conflict not found in current evaluation");
  const ev = event("APPROVAL_REQUESTED", "human", `Human review requested for policy conflict: ${conflict.topic}`, conflict.affectedControlId, "conflict", { detail: { conflictId, topic: conflict.topic }, actor: REVIEWER.displayName });
  s.events.unshift(ev);
  commitState(s);
  return { message: `Review request recorded for "${conflict.topic}". An auditor will be notified.`, event: ev };
}

export async function updateGovernanceContext(profile: OrganizationProfile) {
  const { FRAMEWORKS } = await import("@nexus/governance-core");
  const s = await loadState();
  const nameOf = (id: string) => FRAMEWORKS.find((f) => f.id === id)?.code ?? id;
  const before = evaluateGovernance(s.org, passportInputs(s)).activeFrameworks.map((f) => f.frameworkId);
  s.org = profile;
  const after = evaluateGovernance(s.org, passportInputs(s)).activeFrameworks.map((f) => f.frameworkId);
  const activated = after.filter((id) => !before.includes(id));
  const deactivated = before.filter((id) => !after.includes(id));
  s.events.unshift(event("GOVERNANCE_CONTEXT_CHANGED", "human", "Governance context updated", profile.name, "organization", { previousState: "" , newState: profile.id, actor: REVIEWER.displayName }));
  for (const id of deactivated) {
    s.events.unshift(event("FRAMEWORK_DEACTIVATED", "system", `Framework no longer applicable: ${nameOf(id)}`, id, "framework", { previousState: "ACTIVE", newState: "NOT_APPLICABLE" }));
  }
  for (const id of activated) {
    s.events.unshift(event("FRAMEWORK_ACTIVATED", "system", `Framework became applicable: ${nameOf(id)}`, id, "framework", { previousState: "NOT_APPLICABLE", newState: "ACTIVE" }));
  }
  s.events.unshift(event("COMPLIANCE_RECALCULATED", "system", "Compliance scores recalculated from updated context", profile.name, "organization", { detail: { activeCount: after.length } }));
  commitState(s);
  return { evaluation: evaluateGovernance(s.org, passportInputs(s)) };
}

export function listFrameworks() {
  return import("@nexus/governance-core").then((m) => m.FRAMEWORKS);
}

export function controlMappingsView() {
  return import("@nexus/governance-core").then((m) => m.controlMappings());
}

export async function listDrift() {
  const s = await loadState();
  const items = computeDrift();
  return items.map((d) => (s.suppressedDrift.includes(d.id) ? { ...d, status: "SUPPRESSED" as const } : d));
}

export function suppressDrift(id: string) {
  return loadState().then((s) => {
    if (!s.suppressedDrift.includes(id)) s.suppressedDrift.push(id);
    commitState(s);
    return { ok: true };
  });
}

export async function listRegionConflicts() {
  const s = await loadState();
  return computeRegionConflicts(s.org);
}

export async function listRegulatoryUpdates() {
  return regulatoryUpdates();
}

export function listScenarios() {
  return import("@nexus/governance-core").then((m) => m.DEMO_SCENARIOS);
}

export async function dependencyGraph() {
  return GRAPH_NODES;
}

export async function vendorRiskSummaries() {
  return import("@nexus/governance-core").then((m) => m.VENDORS);
}

export interface CreateChangeInput {
  title: string;
  description: string;
  targetSystems: string[];
  configBefore: ChangeRequestWide["configBefore"];
  configAfter: ChangeRequestWide["configAfter"];
  reason?: string;
  expectedBenefit?: string;
  aiConfidence?: number;
  aiSummary?: string;
  risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sourceFindingId?: string;
  fourEyes?: boolean;
  requiredApprovers?: string[];
  rollbackPlan?: string;
  scenarioId?: string;
}

export async function createChange(input: CreateChangeInput): Promise<ChangeRequestWide> {
  const s = await loadState();
  const risk = input.risk ?? (input.fourEyes || s.org.criticality === "CRITICAL" ? "CRITICAL" : "HIGH");
  const targets = input.targetSystems.length ? input.targetSystems : ["identity", "admin"];
  const fourEyes = input.fourEyes !== undefined ? input.fourEyes : risk === "CRITICAL" || s.org.criticality === "CRITICAL";
  const requiredApprovers = input.requiredApprovers?.length
    ? input.requiredApprovers
    : fourEyes
      ? ["Security Engineer", "System Owner"]
      : risk === "HIGH" || risk === "CRITICAL"
        ? ["Security Engineer"]
        : ["System Owner"];
  const change: ChangeRequestWide = {
    id: uid("chg"),
    title: input.title,
    description: input.description,
    status: "DRAFT",
    risk,
    targetSystems: targets,
    configBefore: input.configBefore,
    configAfter: input.configAfter,
    organizationId: s.org.id,
    reason: input.reason ?? "Remediation recommended by AI assessment.",
    expectedBenefit: input.expectedBenefit ?? "Improved security posture.",
    aiConfidence: input.aiConfidence ?? 84,
    aiSummary: input.aiSummary ?? "AI analysis pending — run impact analysis to continue.",
    requiredApprovers,
    approvals: [],
    fourEyesRequired: fourEyes,
    fourEyesCompleted: false,
    rollbackPlan: input.rollbackPlan ?? "Restore configuration from backup and re-run verification.",
    sourceFindingId: input.sourceFindingId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...(input.scenarioId ? { __scenarioId: input.scenarioId } : {}),
  };
  s.changes.unshift(change);
  s.events.unshift(event("CHANGE_DRAFTED", "system", "Change request created", change.id, "change", { previousState: "—", newState: "DRAFT" }));
  commitState(s);
  return decorate(change, s);
}

export async function listChanges(): Promise<ChangeRequestWide[]> {
  const s = await loadState();
  return s.changes.map((c) => decorate(c, s));
}

export async function getChange(id: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  return decorate(c, s);
}

export async function analyzeChange(id: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.status !== "DRAFT") throw getGovError(409, "Only DRAFT changes can be analyzed.");

  const impact = computeChangeImpact({ changeId: c.id, title: c.title, targetSystems: c.targetSystems, org: s.org, aiConfidence: c.aiConfidence });
  const prev = c.status;
  c.status = impact.simulateFirst ? "SIMULATION_REQUIRED" : "PENDING_REVIEW";
  c.impacts = [impact];
  c.aiSummary = `AI analysis: ${impact.dependencyCount} dependencies, ${impact.servicesCount} services, blast radius ${impact.blastRadius}. Risk ${impact.risk}.`;
  c.updatedAt = nowIso();
  s.events.unshift(event("CHANGE_AI_ANALYZED", "ai", "AI impact analysis completed", id, "change", { previousState: prev, newState: c.status, detail: { risk: impact.risk } }));
  s.events.unshift(event("IMPACT_ANALYZED", "ai", `Blast radius computed — ${impact.dependencyCount} components`, id, "change", { detail: { impact } }));
  commitState(s);
  return decorate(c, s);
}

export async function runChangeSimulation(id: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  const sim = runSimulation({ ...c });
  const prev = c.status;
  c.simulations = [sim, ...(c.simulations ?? [])];
  if (prev === "SIMULATION_REQUIRED" || prev === "DRAFT") {
    c.status = sim.status === "PASSED" ? "PENDING_REVIEW" : "SIMULATION_REQUIRED";
  }
  c.updatedAt = nowIso();
  s.events.unshift(event("SIMULATION_STARTED", "ai", "Change simulation started", id, "change", { at: nowIso() }));
  s.events.unshift(event("SIMULATION_COMPLETED", "ai", `Simulation ${sim.status} — compliance +${sim.complianceDelta}`, id, "change", { newState: sim.status, detail: { sim } }));

  const conflicts = computeRegionConflicts(s.org);
  const detected = detectExceptions({ change: c, org: s.org, simulation: sim, conflictTopics: conflicts.map((x) => x.topic) });
  for (const exc of detected) {
    const existing = s.exceptions.some((e) => e.changeId === id && e.issueType === exc.issueType);
    if (!existing) {
      s.exceptions.unshift(exc);
      s.events.unshift(event("EXCEPTION_DETECTED", "ai", `${exc.title} (${exc.issueType})`, exc.code, "exception", { detail: { risk: exc.risk, confidence: exc.aiConfidence } }));
    }
  }
  commitState(s);
  return decorate(c, s);
}

export async function requestApproval(id: string, comment?: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.status !== "PENDING_REVIEW" && c.status !== "SIMULATION_REQUIRED") {
    throw getGovError(409, "Approval can only be requested after simulation.");
  }
  const prev = c.status;
  c.status = "APPROVAL_REQUIRED";
  c.updatedAt = nowIso();
  s.events.unshift(event("APPROVAL_REQUESTED", "system", `Approval requested from ${c.requiredApprovers.join(", ")}`, id, "change", { previousState: prev, newState: "APPROVAL_REQUIRED", reason: comment }));
  commitState(s);
  return decorate(c, s);
}

export async function decideApproval(
  id: string,
  approverName: string,
  approverRole: string,
  decision: ApprovalDecision,
  comment: string,
  opts: { emergency?: boolean; emergencyReason?: string } = {}
): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.status !== "APPROVAL_REQUIRED") throw getGovError(409, `Change is in status ${c.status}.`);

  const isRequired = c.requiredApprovers.some((r) => r.toLowerCase() === approverRole.toLowerCase() || r.toLowerCase() === approverName.toLowerCase());
  if (!isRequired && decision === "APPROVED") {
    throw getGovError(403, `${approverRole} is not an authorised approver for this change.`);
  }
  if (s.freeze.active && !opts.emergency) {
    throw getGovError(409, "A change freeze is active. Non-essential changes are blocked. An emergency justification is required.");
  }

  const record: ApprovalRecord = {
    id: uid("appr"),
    changeId: id,
    approverId: uid("usr"),
    approverName,
    approverRole,
    decision,
    comment,
    at: nowIso(),
    isEmergency: opts.emergency,
  };
  s.approvals = s.approvals.filter((a) => !(a.changeId === id && a.approverRole === approverRole));
  s.approvals.push(record);

  const approvals = s.approvals.filter((a) => a.changeId === id);
  const prev = c.status;
  let next: ChangeRequestWide["status"] = "APPROVAL_REQUIRED";

  if (decision === "REJECTED") {
    c.status = "REJECTED";
    next = "REJECTED";
  } else if (decision === "CHANGES_REQUESTED") {
    c.status = "CHANGES_REQUESTED";
    next = "CHANGES_REQUESTED";
  } else {
    const decidedRequiredRoles = c.requiredApprovers.filter((r) =>
      approvals.some((a) => a.decision === "APPROVED" && (a.approverRole === r || a.approverName === r))
    );
    const allApproved = c.requiredApprovers.every((r) => decidedRequiredRoles.includes(r));
    if (allApproved) {
      c.status = "APPROVED";
      next = "APPROVED";
      c.fourEyesCompleted = approvals.filter((a) => a.decision === "APPROVED").length >= 2;
    }
  }

  c.updatedAt = nowIso();
  s.events.unshift(
    event(
      decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "CHANGES_REQUESTED",
      "human",
      `${approverRole} ${decision} the change`,
      id,
      "change",
      { previousState: prev, newState: next, actor: approverName, reason: comment }
    )
  );
  if (opts.emergency) {
    s.events.unshift(event("EMERGENCY_OVERRIDE", "human", "Emergency override authorised during freeze", id, "change", { actor: approverName, reason: `Emergency justification: ${opts.emergencyReason || "not provided"}` }));
  }
  commitState(s);
  return decorate(c, s);
}

export async function executeChange(id: string, executor?: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.fourEyesRequired && c.fourEyesCompleted !== true) {
    throw getGovError(409, "Four-eyes approval not completed. Deployment is gated.");
  }
  if (c.status === "CHANGES_REQUESTED" && c.requiredApprovers.length) {
    throw getGovError(409, "Changes were requested — approval must be re-obtained.");
  }
  if (c.status !== "APPROVED") throw getGovError(409, `Change must be APPROVED before execution (current: ${c.status}).`);

  const blocking = s.exceptions.find((e) => e.changeId === id && e.autoRemediationBlocked && ["OPEN", "UNDER_REVIEW"].includes(e.status));
  if (blocking) {
    throw getGovError(
      409,
      `Automatic remediation is BLOCKED by open exception ${blocking.code}.\nActions required: accept the exception, request remediation, escalate, or add a compensating control before execution.`
    );
  }

  const prev = c.status;
  c.status = "EXECUTING";
  c.executedBy = executor ?? REVIEWER.displayName;
  c.executedAt = nowIso();
  s.events.unshift(event("CHANGE_EXECUTED", "human", "Change executed in SIMULATED mode", id, "change", { previousState: prev, newState: "EXECUTING", detail: { mode: "SIMULATED", actor: c.executedBy } }));

  const scenario = c.__scenarioId ? demoSintenarioById(c.__scenarioId) : null;
  const sim = c.simulations?.[0];
  const shouldFail = scenario?.id === "scenario-telecom" || (sim?.compatibilityRisk === "HIGH" && scenario?.id !== "scenario-manufacturing");
  if (shouldFail) {
    c.status = "ROLLBACK_RECOMMENDED";
    const rb: RollbackRecord = {
      id: uid("rollback"),
      changeId: id,
      reason: "Change failure detected: authentication failures +41% (expected <2%).",
      metrics: [
        { label: "Authentication failures", current: 41, expected: 2, unit: "%" },
        { label: "Error rate", current: 6.8, expected: 0.5, unit: "%" },
        { label: "Availability", current: 91.0, expected: 99.9, unit: "%" },
        { label: "Latency p95", current: 640, expected: 180, unit: "ms" },
      ],
      status: "ROLLBACK_RECOMMENDED",
      initiatedAt: nowIso(),
      initiatedBy: "NEXUS AI",
    };
    s.events.unshift(event("ROLLBACK_RECOMMENDED", "ai", "Telemetry anomaly — authentication failures +41%", id, "change", { previousState: "EXECUTING", newState: "ROLLBACK_RECOMMENDED", detail: { metrics: rb.metrics } }));
    c.rollbacks = [rb];
  } else {
    c.status = "VERIFICATION";
    s.events.unshift(event("VERIFICATION_STARTED", "system", "Post-change verification started", id, "change", { previousState: prev, newState: "VERIFICATION" }));
  }
  c.updatedAt = nowIso();
  commitState(s);
  return decorate(c, s);
}

export async function verifyChange(id: string, verifier?: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.status !== "VERIFICATION") throw getGovError(409, `Change is not in VERIFICATION (current: ${c.status}).`);

  const prev = c.status;
  c.status = "SUCCESS";
  c.verifiedBy = verifier ?? REVIEWER.displayName;
  c.verifiedAt = nowIso();
  const v: VerificationResult = {
    id: uid("ver"),
    changeId: id,
    compliance: "PASS",
    security: "PASS",
    availability: "PASS",
    dependencies: "PASS",
    evidenceCaptured: true,
    evidenceNote: "Post-change telemetry healthy, control state verified, evidence captured in audit trail.",
    overall: "PASS",
    finalStatus: "HUMAN-VERIFIED CHANGE",
    verifiedBy: c.verifiedBy,
    verifiedAt: c.verifiedAt,
  };
  c.verifications = [v, ...(c.verifications ?? [])];
  s.events.unshift(event("VERIFICATION_PASSED", "human", "All verification checks passed", id, "change", { previousState: prev, newState: "SUCCESS", actor: c.verifiedBy, detail: { result: "HUMAN-VERIFIED CHANGE" } }));
  s.events.unshift(event("HUMAN_VERIFIED", "human", "Change is human-verified", id, "change", { actor: c.verifiedBy }));
  c.updatedAt = nowIso();
  commitState(s);
  return decorate(c, s);
}

export async function rollbackChange(id: string, reason?: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.status !== "ROLLBACK_RECOMMENDED") throw getGovError(409, `Rollback only available for ROLLBACK_RECOMMENDED changes.`);

  const prev = c.status;
  c.status = "ROLLED_BACK";
  const rb: RollbackRecord = {
    id: uid("rollback"),
    changeId: id,
    reason: reason ?? "Rollback executed after anomaly detection.",
    metrics: c.rollbacks?.[0]?.metrics ?? [{ label: "Authentication failures", current: 41, expected: 2, unit: "%" }],
    status: "ROLLED_BACK",
    initiatedAt: nowIso(),
    initiatedBy: REVIEWER.displayName,
    completedAt: nowIso(),
  };
  c.rollbacks = [rb];
  s.events.unshift(event("ROLLBACK_EXECUTED", "human", "Rollback executed", id, "change", { previousState: prev, newState: "ROLLED_BACK", reason, actor: REVIEWER.displayName }));
  c.updatedAt = nowIso();
  commitState(s);
  return decorate(c, s);
}

export async function investigateRollback(id: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.status !== "ROLLBACK_RECOMMENDED") throw getGovError(409, "Not in rollback-recommended state.");
  s.events.unshift(event("ROLLBACK_RECOMMENDED", "human", "Investigation started", id, "change", { actor: REVIEWER.displayName, reason: "Manual investigation initiated." }));
  commitState(s);
  return decorate(c, s);
}

export async function keepChange(id: string): Promise<ChangeRequestWide> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) throw getGovError(404, `Change ${id} not found`);
  if (c.status !== "ROLLBACK_RECOMMENDED") throw getGovError(409, "Not in rollback-recommended state.");
  const prev = c.status;
  c.status = "VERIFICATION";
  c.updatedAt = nowIso();
  s.events.unshift(event("VERIFICATION_STARTED", "human", "Change retained after investigation — proceeding to verification", id, "change", { previousState: prev, newState: "VERIFICATION", actor: REVIEWER.displayName }));
  commitState(s);
  return decorate(c, s);
}

export async function createChangeFromScenario(scenarioId: string): Promise<ChangeRequestWide> {
  const scenario = demoSintenarioById(scenarioId);
  if (!scenario) throw getGovError(404, `Scenario ${scenarioId} not found`);
  const s = await loadState();
  s.org = scenario.orgProfile;
  const change = await createChange({
    title: scenario.change.title,
    description: scenario.change.description,
    targetSystems: scenario.change.targetSystems,
    configBefore: scenario.change.configBefore,
    configAfter: scenario.change.configAfter,
    reason: "Scenario: " + scenario.name,
    expectedBenefit: "Improved security posture for the scenario organization.",
    aiConfidence: scenario.change.flagsException ? 68 : 88,
    risk: scenario.orgProfile.criticality === "CRITICAL" ? "CRITICAL" : scenario.change.fourEyes ? "CRITICAL" : "HIGH",
    fourEyes: scenario.change.fourEyes,
    requiredApprovers: scenario.change.fourEyes ? ["Security Engineer", "System Owner"] : undefined,
    scenarioId,
  });
  const s2 = await loadState();
  s2.events.unshift(event("ASSESSMENT_STARTED", "system", `Demo scenario started: ${scenario.name}`, change.id, "change", { detail: { scenarioId } }));
  commitState(s2);
  return decorate(change, s2);
}

async function findAuditFinding(findingId: string) {
  const repo = getRepository();
  const audits = await repo.allAudits();
  for (const a of audits) {
    const f = a.findings.find((x) => x.id === findingId);
    if (f) return { finding: { ...f, auditId: a.id } };
  }
  return null;
}

function presetForControl(controlId: string): string {
  if (controlId === "NET-AUTH-007") return "MFA enforcement";
  if (controlId === "NET-TELNET-001" || controlId === "NET-INSEC-005" || controlId === "NET-HTTP" || controlId.startsWith("NET-INSEC")) return "TLS 1.3 only";
  if (controlId === "NET-MGMT-002" || controlId === "NET-ADMEX-008") return "Management exposure restricted";
  if (controlId === "NET-LOG-003") return "Logging enabled";
  if (controlId === "NET-SEG-010") return "Segmentation enforced";
  return "Encryption hardening";
}

function targetsForControl(controlId: string): string[] {
  if (controlId === "NET-AUTH-007") return ["identity", "admin", "api-gw"];
  if (controlId === "NET-TELNET-001" || controlId === "NET-INSEC-005") return ["api-gw", "portal", "mobile"];
  if (controlId === "NET-MGMT-002" || controlId === "NET-ADMEX-008") return ["admin", "identity"];
  if (controlId === "NET-LOG-003") return ["files", "cloud-aws"];
  if (controlId === "NET-SEG-010") return ["api-gw", "identity"];
  return ["identity", "admin"];
}

export async function createChangeFromFinding(findingId: string): Promise<ChangeRequestWide> {
  const found = await findAuditFinding(findingId);
  if (!found) throw getGovError(404, `Finding ${findingId} not found`);
  const finding = found.finding as { id: string; controlId: string; controlName: string; what?: string; why?: string; severity: string };
  const presetKey = presetForControl(finding.controlId);
  const preset = PRESET_CONFIGS[presetKey] ?? PRESET_CONFIGS["MFA enforcement"];
  const targets = targetsForControl(finding.controlId);
  const impact = blastRadiusOf(targets);
  return createChange({
    title: `Remediation: ${finding.controlName}`,
    description: finding.what || `Address ${finding.controlName} failing control.`,
    targetSystems: targets,
    configBefore: [{ key: "current.state", label: "Current configuration", value: "observed vulnerability", category: "Assessment" }],
    configAfter: preset,
    reason: finding.why || "Control failure detected during assessment.",
    expectedBenefit: "Resolve control failure and reduce exposure.",
    aiConfidence: 81,
    risk: finding.severity === "CRITICAL" ? "CRITICAL" : finding.severity === "HIGH" ? "HIGH" : "MEDIUM",
    sourceFindingId: findingId,
    aiSummary: `Created from finding ${findingId}. Estimated blast radius: ${impact.ids.length} components.`,
  });
}

export async function listExceptions() {
  const s = await loadState();
  return s.exceptions;
}

export async function resolveException(
  id: string,
  action: "ACCEPT_OVERRIDE" | "REQUEST_REMEDIATION" | "ESCALATE" | "COMPENSATING_CONTROL",
  compensatingControls?: string[]
) {
  const s = await loadState();
  const exc = s.exceptions.find((e) => e.id === id);
  if (!exc) throw getGovError(404, `Exception ${id} not found`);

  const statusMap: Record<string, import("@nexus/shared-types").ExceptionStatus> = {
    ACCEPT_OVERRIDE: "ACCEPTED",
    REQUEST_REMEDIATION: "REMEDIATION_REQUESTED",
    ESCALATE: "ESCALATED",
    COMPENSATING_CONTROL: "COMPENSATED",
  };
  const prev = exc.status;
  exc.status = statusMap[action] ?? exc.status;
  exc.action = action;
  exc.compensatingControls = action === "COMPENSATING_CONTROL" && compensatingControls?.length ? compensatingControls : exc.compensatingControls;
  exc.resolvedBy = REVIEWER.displayName;
  exc.resolvedAt = nowIso();
  exc.updatedAt = nowIso();
  s.events.unshift(event("HUMAN_VERIFIED", "human", `Exception resolution recorded: ${action}`, exc.code, "exception", { previousState: prev, newState: exc.status, actor: REVIEWER.displayName }));
  commitState(s);
  return exc;
}

export async function setChangeFreeze(active: boolean, reason?: string): Promise<FreezeState> {
  const s = await loadState();
  s.freeze = active
    ? { active, reason: reason ?? "Scheduled maintenance freeze", until: new Date(Date.now() + 24 * 3600_000).toISOString(), triggeredAt: nowIso() }
    : { active: false };
  s.events.unshift(
    event(active ? "CHANGE_FREEZE_ACTIVATED" : "CHANGE_FREEZE_DEACTIVATED", "human", active ? "Change freeze activated" : "Change freeze deactivated", "freeze", "freeze", { reason, actor: AUDITOR.displayName })
  );
  commitState(s);
  return s.freeze;
}

export async function getFreeze(): Promise<FreezeState> {
  const s = await loadState();
  return s.freeze;
}

export async function getTelemetryForChange(id: string): Promise<TelemetryPoint[]> {
  const s = await loadState();
  const c = s.changes.find((x) => x.id === id);
  if (!c) return [];
  const failed = c.status === "ROLLBACK_RECOMMENDED" || c.status === "ROLLED_BACK";
  const base = [
    { metric: "auth_failures", label: "Authentication failures", unit: "%", ok: 2, bad: 41 },
    { metric: "error_rate", label: "Error rate", unit: "%", ok: 0.5, bad: 6.8 },
    { metric: "availability", label: "Availability", unit: "%", ok: 99.9, bad: 91 },
    { metric: "p95", label: "Latency p95", unit: "ms", ok: 180, bad: 640 },
  ];
  const t0 = (c.executedAt ? new Date(c.executedAt).getTime() : Date.now()) - 6 * 3600_000;
  const out: TelemetryPoint[] = [];
  for (let i = 0; i < 6; i++) {
    const t = new Date(t0 + i * 3600_000).toISOString();
    for (const m of base) {
      const dip = failed && i >= 3 ? m.bad : m.ok;
      const wobble = Math.round(dip * (0.92 + ((i * 13) % 10) / 100) * 100) / 100;
      out.push({ t, metric: m.metric, label: m.label, value: wobble, expected: m.ok, unit: m.unit });
    }
  }
  return out;
}

export async function getAuditTrail(): Promise<GovernanceAuditEvent[]> {
  const s = await loadState();
  return s.events;
}

export async function changeEvents(id: string): Promise<GovernanceAuditEvent[]> {
  const s = await loadState();
  return s.events.filter((e) => e.target === id || (e.detail && typeof e.detail === "object" && (e.detail as Record<string, unknown>).changeId === id)).slice(0, 40);
}

export async function resetGovernance(): Promise<void> {
  state = null;
  try {
    await fs.rm(fsPath, { force: true });
  } catch {
    /* ignore */
  }
  const fresh = seedState();
  state = fresh;
  commitState(fresh);
}