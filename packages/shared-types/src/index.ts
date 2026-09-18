export type VendorId = "cisco" | "fortinet" | "juniper" | "unknown";

export type VendorStatus = "known" | "unknown";

export interface VendorMetadata {
  vendor: VendorId;
  status: VendorStatus;
  detectedBy: string;
  confidence: number;
}

export type Action = "ALLOW" | "DENY" | "REQUIRE";

export interface IntentSource {
  type: "NETWORK" | "ANY" | "DEVICE" | "HOST" | "INTERFACE";
  value: string;
}

export interface IntentDestination {
  type: "DEVICE" | "NETWORK" | "ANY" | "INTERFACE";
  value: string;
}

export interface IntentEvidence {
  file: string;
  lineStart: number;
  lineEnd: number;
  snippet?: string;
  reason?: string;
}

export type SecurityIntentType =
  | "RESTRICT_ADMIN_ACCESS"
  | "DISABLE_INSECURE_PROTOCOL"
  | "REQUIRE_LOGGING"
  | "RESTRICT_SOURCE_NETWORK"
  | "DENY_UNAUTHORIZED_TRAFFIC"
  | "REQUIRE_STRONG_AUTHENTICATION"
  | "SECURE_MANAGEMENT_INTERFACE"
  | "DEFAULT_DENY"
  | "NETWORK_SEGMENTATION";

export interface SecurityIntent {
  id: string;
  intentType: SecurityIntentType;
  protocol?: string;
  source?: IntentSource;
  destination?: IntentDestination;
  action?: Action;
  loggingRequired?: boolean;
  authMethod?: string;
  enabled: boolean;
  vendor: VendorId;
  sourceConfigFile: string;
  evidence: IntentEvidence[];
  description?: string;
}

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type FindingStatus = "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE";

/**
 * Lifecycle of an evidence-sourced compliance finding. Every finding starts at
 * OPEN; remediation orchestration advances it PLANNED → REMEDIATED → VERIFIED,
 * while direct human action may ACKNOWLEDGE or EXCEPT it.
 */
export type FindingLifecycle = "OPEN" | "ACKNOWLEDGED" | "REMEDIATION_PLANNED" | "REMEDIATED" | "VERIFIED" | "EXCEPTED";

export type ControlFramework = "CIS" | "NIST" | "STIG" | "PROTOTYPE";

export interface ComplianceControl {
  id: string;
  name: string;
  description?: string;
  frameworks: ControlFramework[];
  severity: Severity;
  condition: Record<string, unknown>;
  failureMessage: string;
  remediation: string;
  prototypeLabel?: boolean;
}

export interface FindingEvidence {
  file: string;
  lineStart: number;
  lineEnd: number;
  snippet?: string;
  reason?: string;
}

export interface Finding {
  id: string;
  auditId: string;
  controlId: string;
  controlName: string;
  severity: Severity;
  status: FindingStatus;
  what: string;
  why: string;
  where: string;
  risk: number;
  impact: string;
  recommendedFix: string;
  evidence: FindingEvidence[];
  references: { controlId: string; intentType?: string };
}

export interface RiskAssessment {
  id: string;
  auditId: string;
  overallScore: number;
  severityFactor: number;
  exposureFactor: number;
  criticalityFactor: number;
  controlImportanceFactor: number;
  exploitabilityFactor: number;
  explanation: string;
  findings: string[];
}

export type AiProviderMode = "mock" | "live";

export interface AiInterpretation {
  id?: string;
  sourceConfigId: string;
  syntaxFingerprint?: string;
  detectedConcept: string;
  securityIntent: SecurityIntentType;
  protocol?: string;
  sourceRestriction: boolean;
  loggingEnabled: boolean;
  confidence: number;
  evidence: Array<{
    lineStart: number;
    lineEnd: number;
    reason: string;
    snippet?: string;
  }>;
  suggestedRemediation: string;
  provider: AiProviderMode;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EDITED";
  createdAt?: string;
}

export interface ApprovedMapping {
  id: string;
  syntaxFingerprint: string;
  aiInterpretationId: string;
  securityIntent: SecurityIntentType;
  protocol?: string;
  sourceRestriction: boolean;
  loggingEnabled: boolean;
  approvedAt: string;
  approvedBy: string;
}

export interface RemediationStep {
  controlId: string;
  findingId: string;
  action: string;
  newIntent?: Partial<SecurityIntent>;
  riskAfter: number;
  statusAfter: FindingStatus;
}

export interface RemediationSimulation {
  id: string;
  auditId: string;
  steps: RemediationStep[];
  complianceBefore: { passed: number; failed: number; score: number };
  complianceAfter: { passed: number; failed: number; score: number };
  highRiskBefore: number;
  highRiskAfter: number;
  postureBefore: number;
  postureAfter: number;
  simulatedAt: string;
}

export interface ConfigurationRecord {
  id: string;
  name: string;
  content: string;
  fileType: string;
  sizeBytes: number;
  vendor: VendorId;
  vendorStatus: VendorStatus;
  detectedBy: string;
  uploadedAt: string;
  redacted: boolean;
}

export type AuditStatus = "RUNNING" | "COMPLETED" | "ERROR";

export interface AuditRecord {
  id: string;
  configurationId: string;
  configurationName: string;
  vendor: VendorId;
  vendorStatus: VendorStatus;
  status: AuditStatus;
  startedAt: string;
  completedAt?: string;
  intents: SecurityIntent[];
  findings: Finding[];
  risk: RiskAssessment | null;
  compliance: { passed: number; failed: number; warnings: number; na: number; score: number } | null;
  aiInterpretations?: AiInterpretation[];
  remediation?: RemediationSimulation | null;
}

export interface DashboardStats {
  posture: number;
  compliance: { passed: number; failed: number; warnings: number; score: number };
  risk: Record<Severity, number>;
  vendorDistribution: Record<VendorId, number>;
  topRisks: Finding[];
  adaptive: {
    knownAnalyzed: number;
    unknownDetected: number;
    aiInterpretations: number;
    approvedMappings: number;
    rejectedMappings: number;
    totalAudits: number;
  };
  review: ReviewAggregate;
  assets?: {
    total: number;
    byType: Array<{ type: AssetType; count: number }>;
    byStatus: Array<{ status: AssetStatus; count: number }>;
    byTier: Array<{ tier: NetworkTier; count: number }>;
    byRegion: Array<{ region: string; label: string; count: number }>;
    discovered: number;
    monitored: number;
    scannable: number;
    nonCompliant: number;
    compliant: number;
  };
  connectors?: {
    total: number;
    online: number;
    offline: number;
    authFailed: number;
    networkBlocked: number;
    byType: Array<{ type: ConnectorType; count: number }>;
  };
  remediation?: {
    planned: number;
    pendingApproval: number;
    executed: number;
    completed: number;
    verifiedPass: number;
    verificationFail: number;
    rolledBack: number;
    verificationSuccessRate: number;
  };
  globalPosture?: AssetPostureSummary;
}

export interface DemoConfigInfo {
  vendor: VendorId;
  status: VendorStatus;
  label: string;
  fileName: string;
}

export interface ExposureNode {
  label: string;
  type: "external" | "network" | "service" | "device" | "asset";
  detail?: string;
}

export interface ExposurePath {
  findingId: string;
  controlId: string;
  title: string;
  warning: string;
  path: ExposureNode[];
  potential: boolean;
}

// ---------------------------------------------------------------------------
// Human-in-the-loop review workflow
// ---------------------------------------------------------------------------

export type ReviewStatus =
  | "AI_GENERATED"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "RESOLVED";

export type UserRole = "analyst" | "reviewer";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface AiRecommendationSnapshot {
  why: string;
  impact: string;
  recommendedFix: string;
  risk: number;
}

export interface HumanModifiedRecommendation {
  why?: string;
  impact?: string;
  recommendedFix?: string;
  risk?: number;
  recommendedBy: string;
  reviewerId: string;
  modifiedAt: string;
}

export interface FindingReviewRecord {
  findingId: string;
  auditId: string;
  auditConfigurationName: string;
  vendor: VendorId;
  controlId: string;
  controlName: string;
  controlDescription: string | null;
  frameworks: ControlFramework[];
  frameworkLabel: string;
  severity: Severity;
  risk: number;
  findingTitle: string;
  findingDescription: string;
  status: ReviewStatus;
  originalAiRecommendation: AiRecommendationSnapshot;
  humanModifiedRecommendation?: HumanModifiedRecommendation;
  reviewComment?: string;
  rejectionReason?: string;
  requestedChanges?: string;
  reviewerId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  generatedByAiAt: string;
  pendingSince: string;
  reopenedAt?: string;
  modifiedAt?: string;
  resolvedAt?: string;
}

export type AuditEventType =
  | "FINDING_AI_GENERATED"
  | "FINDING_ENTERED_REVIEW"
  | "FINDING_APPROVED"
  | "FINDING_REJECTED"
  | "FINDING_CHANGES_REQUESTED"
  | "FINDING_MODIFIED"
  | "FINDING_REOPENED"
  | "FINDING_RESOLVED"
  | "AUDIT_FINALIZED"
  | "AI_INTERPRETATION_APPROVED"
  | "AI_INTERPRETATION_REJECTED"
  | "AI_INTERPRETATION_EDITED"
  | "ASSET_DISCOVERED"
  | "ASSET_UPDATED"
  | "ASSET_SCANNED"
  | "EVIDENCE_COLLECTED"
  | "FINDING_ANALYZED"
  | "REMEDIATION_PLANNED"
  | "REMEDIATION_VALIDATED"
  | "REMEDIATION_APPROVED"
  | "REMEDIATION_REJECTED"
  | "REMEDIATION_EXECUTED"
  | "REMEDIATION_VERIFICATION_PASSED"
  | "REMEDIATION_VERIFICATION_FAILED"
  | "REMEDIATION_ROLLED_BACK"
  | "FINDING_LIFECYCLE_CHANGED"
  | "CONNECTOR_STATUS_CHANGED"
  | "GOVERNANCE_EXCEPTION_REQUESTED"
  | "GOVERNANCE_EXCEPTION_DECIDED";

export type AuditEventSource = "system" | "ai" | "human";

export interface AuditEventRecord {
  id: string;
  eventType: AuditEventType;
  entityType: "finding" | "audit" | "ai_interpretation" | "asset" | "evidence" | "remediation" | "connector" | "governance";
  entityId: string;
  findingId?: string;
  auditId: string;
  vendor?: VendorId;
  frameworkLabel?: string;
  controlId?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: UserRole;
  source: AuditEventSource;
  at: string;
  detail: Record<string, unknown>;
}

export interface ComplianceFinalization {
  id: string;
  auditId: string;
  auditConfigurationName: string;
  vendor: VendorId;
  totalControls: number;
  aiAssessed: number;
  humanVerified: number;
  pending: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  criticalUnresolved: number;
  finalizerId: string;
  finalizerName: string;
  finalizedAt: string;
  comment?: string;
}

export interface ReviewAggregate {
  aiScore: number;
  humanVerifiedScore: number;
  humanVerifiedCoverage: number;
  aiGenerated: number;
  pending: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  resolved: number;
  finalizedAudits: number;
  accessibleToReview: number;
}

export interface ReviewQueueItem {
  findingId: string;
  auditId: string;
  vendor: VendorId;
  configurationName: string;
  frameworkLabel: string;
  controlId: string;
  controlName: string;
  severity: Severity;
  risk: number;
  status: ReviewStatus;
  aiRecommendation: string;
  generatedByAiAt: string;
  ageDays: number;
  reviewerId?: string;
  reviewedBy?: string;
  auditFinalized: boolean;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  counts: Record<ReviewStatus, number>;
  filtered: number;
}

export interface ReviewDetail {
  finding: Finding;
  audit: AuditRecord;
  review: FindingReviewRecord;
  control: {
    id: string;
    name: string;
    description: string | null;
    frameworks: ControlFramework[];
    severity: Severity;
    remediation: string;
  } | null;
  auditTrail: AuditEventRecord[];
  canReview: boolean;
  viewerRole: UserRole;
  auditFinalization: ComplianceFinalization | null;
  reviewable: boolean;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export interface FinalizeReviewInput {
  acknowledgePendingCritical?: boolean;
  comment?: string;
}

export interface ReviewQueueParams {
  vendor?: string;
  framework?: string;
  severity?: string;
  status?: string;
  reviewer?: string;
  sortBy?: "risk" | "oldest" | "newest";
  search?: string;
}

// ---------------------------------------------------------------------------
// Global Compliance Intelligence — governance domain
// ---------------------------------------------------------------------------

export type RegionCode = string;
export type IndustryId = string;
export type ComplianceFrameworkId = string;
export type GovernanceControlId = string;
export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Industry-standard network exposure class, derived deterministically from the
 * asset's observed zone, tier and tags (never hard-coded). INTERNET_FACING and
 * DMZ assets sit on the edge; PARTNER reachable across an extranet; RESTRICTED
 * is management-only; INTERNAL is the default private-network posture.
 */
export type NetworkExposure = "INTERNAL" | "RESTRICTED" | "PARTNER" | "DMZ" | "INTERNET_FACING";

export type DeploymentModel = "ON_PREM" | "CLOUD" | "HYBRID" | "MULTI_CLOUD" | "EDGE";
export type OrgSize = "SME" | "MID" | "ENTERPRISE" | "GOVERNMENT";

export interface RegionInfo {
  code: RegionCode;
  label: string;
  flag: string;
  bloc: "GLOBAL" | "EU" | "US" | "INDIA" | "APAC" | "MENA" | "OTHER";
}

export interface IndustryInfo {
  id: IndustryId;
  label: string;
  sector: "TECH" | "FINANCE" | "HEALTH" | "PUBLIC" | "TELECOM" | "ENERGY" | "MANUFACTURING" | "RETAIL" | "EDUCATION" | "TRANSPORT" | "DEFENSE" | "CLOUD" | "CRITICAL_INFRA";
  criticalityBaseline: RiskBand;
}

export interface DataTypeFlag {
  id: string;
  label: string;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  regions: RegionCode[];
  industries: IndustryId[];
  size: OrgSize;
  criticality: RiskBand;
  dataTypes: string[];
  cloud: DeploymentModel;
  cloudProviders: string[];
  customerRegions: RegionCode[];
  businessSectors: string[];
  dataResidency: string[];
  description?: string;
  /**
   * Governance policy engine: the jurisdiction the organization domiciles in.
   * When absent the engine derives it from `regions[0]`.
   */
  primaryRegion?: RegionCode;
  /** Governance policy engine: human-readable organization type. */
  orgType?: string;
}

export interface FrameworkTrigger {
  field: "regions" | "industries" | "dataTypes" | "size" | "criticality" | "cloud" | "customerRegions" | "businessSectors" | "dataResidency";
  operator: "in" | "any" | "none" | "gte" | "always";
  value: string | string[];
}

export interface ComplianceFrameworkDef {
  id: ComplianceFrameworkId;
  code: string;
  name: string;
  region: "GLOBAL" | RegionCode;
  bloc: "GLOBAL" | "EU" | "US" | "INDIA" | "APAC" | "OTHER";
  authority: string;
  status: "active" | "draft" | "under_review";
  version: string;
  description: string;
  intent: string;
  whyApplies: string;
  triggers: FrameworkTrigger[];
  controlIds: GovernanceControlId[];
  baselineScore: number;
  baselineControls: { passed: number; total: number };
  icon?: string;
}

export interface FrameworkControlRef {
  frameworkId: ComplianceFrameworkId;
  refs: string[];
}

export interface GovernanceControl {
  id: GovernanceControlId;
  name: string;
  category: string;
  description: string;
  coreRequirement: string;
  severity: Severity;
  intentTypes?: SecurityIntentType[];
  mappedTo: FrameworkControlRef[];
}

export interface ControlMappingEntry {
  controlId: GovernanceControlId;
  controlName: string;
  category: string;
  coreRequirement: string;
  frameworks: Array<{ id: ComplianceFrameworkId; code: string; refs: string[] }>;
}

export interface FrameworkCoverage {
  frameworkId: ComplianceFrameworkId;
  code: string;
  name: string;
  region: "GLOBAL" | RegionCode;
  score: number;
  passedControls: number;
  totalControls: number;
  status: "COMPLIANT" | "PARTIAL" | "AT_RISK" | "NOT_ASSESSED";
  notes: string[];
  applicable: boolean;
}

export interface CompliancePassport {
  organization: OrganizationProfile;
  globalScore: number;
  posture: RiskBand;
  openCritical: number;
  openHigh: number;
  activeExceptions: number;
  pendingApprovals: number;
  highRiskChanges: number;
  driftCount: number;
  vendorRiskAvg: number;
  regions: RegionInfo[];
  industries: IndustryInfo[];
  frameworks: FrameworkCoverage[];
  applicableReasons: Array<{ frameworkId: ComplianceFrameworkId; code: string; reason: string }>;
  generatedAt: string;
}

// ---- Change governance ----

export type ChangeStatus =
  | "DRAFT"
  | "AI_ANALYZED"
  | "PENDING_REVIEW"
  | "SIMULATION_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "EXECUTING"
  | "VERIFICATION"
  | "SUCCESS"
  | "FAILED"
  | "ROLLBACK_RECOMMENDED"
  | "ROLLED_BACK";

export type ApprovalDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export interface ConfigSetting {
  key: string;
  label: string;
  value: string;
  category: string;
}

export interface AiRemediationStep {
  order: number;
  action: string;
  reason: string;
  expectedBenefit: string;
  dependencies: string[];
  risk: RiskBand;
  estimatedImpact: string;
  requiredApprovals: string[];
  rollbackStrategy: string;
}

export interface AiRemediationPlan {
  findingRef: string;
  findingTitle: string;
  recommendation: string;
  aiConfidence: number;
  evidenceQuality: "HIGH" | "MEDIUM" | "LOW";
  uncertainty: "LOW" | "MEDIUM" | "HIGH";
  steps: AiRemediationStep[];
  explanation: string[];
  mappedFrameworks: string[];
}

export interface ChangeImpactSummary {
  changeId: string;
  changeTitle: string;
  affectedAssets: string[];
  affectedServices: string[];
  affectedApps: string[];
  affectedVendors: string[];
  criticalAssets: string[];
  dependencies: string[];
  dependencyCount: number;
  downstreamCount: number;
  servicesCount: number;
  appsCount: number;
  vendorsCount: number;
  criticalAssetsCount: number;
  securityImpact: string;
  complianceImpact: string;
  availabilityImpact: string;
  authenticationImpact: string;
  dataImpact: string;
  networkImpact: string;
  potentialEffects: string[];
  risk: RiskBand;
  blastRadius: number;
  recommendation: string;
  simulateFirst: boolean;
}

export interface ConfigDiffItem {
  key: string;
  label: string;
  category: string;
  current: string;
  proposed: string;
  change: "ADDED" | "REMOVED" | "CHANGED";
}

export interface ChangeSimulation {
  id: string;
  changeId: string;
  diff: ConfigDiffItem[];
  complianceDelta: number; // percentage points
  securityDelta: number;
  compatibilityRisk: RiskBand;
  affectedSystems: string[];
  failureModes: string[];
  blastRadius: number;
  riskScore: number;
  recommendation: string;
  status: "PASSED" | "CONDITIONAL" | "FAILED";
  simulatedAt: string;
}

export type ExceptionType =
  | "UNSUPPORTED_CONFIGURATION"
  | "CONFLICTING_CONTROLS"
  | "LEGACY_SYSTEM"
  | "INSUFFICIENT_EVIDENCE"
  | "LOW_AI_CONFIDENCE"
  | "DESTRUCTIVE_REMEDIATION"
  | "REGULATORY_AMBIGUITY"
  | "CRITICAL_DEPENDENCY"
  | "REGIONAL_CONFLICT";

export type ExceptionStatus = "OPEN" | "UNDER_REVIEW" | "ACCEPTED" | "REMEDIATION_REQUESTED" | "ESCALATED" | "COMPENSATED" | "CLOSED";

export interface ComplianceException {
  id: string;
  code: string;
  controlId: GovernanceControlId;
  controlName: string;
  title: string;
  observed: string;
  issueType: ExceptionType;
  aiConfidence: number;
  risk: RiskBand;
  reasons: string[];
  autoRemediationBlocked: boolean;
  requiredReview: boolean;
  affectedSystems: string[];
  status: ExceptionStatus;
  action?: string;
  compensatingControls: string[];
  createdAt: string;
  updatedAt?: string;
  changeId?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface ApprovalRecord {
  id: string;
  changeId: string;
  approverId: string;
  approverName: string;
  approverRole: string;
  decision: ApprovalDecision;
  comment: string;
  at: string;
  isEmergency?: boolean;
}

export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  status: ChangeStatus;
  risk: RiskBand;
  targetSystems: string[];
  configBefore: ConfigSetting[];
  configAfter: ConfigSetting[];
  organizationId: string;
  reason: string;
  expectedBenefit: string;
  aiConfidence: number;
  aiSummary: string;
  remediationPlan?: AiRemediationPlan;
  impacts?: ChangeImpactSummary[];
  simulations?: ChangeSimulation[];
  exceptions?: ComplianceException[];
  requiredApprovers: string[];
  approvals: ApprovalRecord[];
  fourEyesRequired: boolean;
  fourEyesCompleted: boolean;
  emergency?: boolean;
  emergencyReason?: string;
  rollbackPlan: string;
  evidence?: string;
  createdAt: string;
  updatedAt?: string;
  sourceFindingId?: string;
  executedBy?: string;
  executedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface TelemetryPoint {
  t: string;
  metric: string;
  label: string;
  value: number;
  expected: number;
  unit: string;
}

export interface RollbackRecord {
  id: string;
  changeId: string;
  reason: string;
  metrics: Array<{ label: string; current: number; expected: number; unit: string }>;
  status: "ROLLBACK_RECOMMENDED" | "INVESTIGATING" | "KEEP_CHANGE" | "ROLLING_BACK" | "ROLLED_BACK";
  initiatedAt: string;
  initiatedBy: string;
  completedAt?: string;
}

export interface VerificationResult {
  id: string;
  changeId: string;
  compliance: "PASS" | "FAIL";
  security: "PASS" | "FAIL";
  availability: "PASS" | "FAIL";
  dependencies: "PASS" | "FAIL";
  evidenceCaptured: boolean;
  evidenceNote: string;
  overall: "PASS" | "FAIL";
  finalStatus: string;
  verifiedBy: string;
  verifiedAt: string;
}

export interface ComplianceDriftItem {
  id: string;
  title: string;
  expected: string;
  observed: string;
  controlId: GovernanceControlId;
  controlName: string;
  system: string;
  affectedSystems: string[];
  risk: RiskBand;
  severity: Severity;
  detectedAt: string;
  status: "OPEN" | "SUPPRESSED" | "VERIFIED";
  findingCreated: boolean;
  frameworkIds: string[];
}

export interface RegulatoryUpdate {
  id: string;
  frameworkId: ComplianceFrameworkId;
  frameworkCode: string;
  title: string;
  type: string;
  summary: string;
  effective: string;
  affectedControls: string[];
  affectedVendors: string[];
  affectedSystems: string[];
  affectedRegions: string[];
  status: "NEW" | "ASSESSING" | "REVIEW_REQUIRED" | "IMPLEMENTED";
  impact: RiskBand;
  publishedAt: string;
}

export interface RegionRequirement {
  region: RegionCode;
  label: string;
  requirement: string;
  frameworks: string[];
}

export interface RegionPolicyConflict {
  id: string;
  topic: string;
  description: string;
  currentPolicy: string;
  regionRequirements: RegionRequirement[];
  risk: RiskBand;
  status: "DETECTED" | "REVIEWING" | "REVIEW_COMPLETE";
  detectedAt: string;
  recommendation: string;
}

export interface OutcomeReport {
  id: string;
  changeId: string;
  title: string;
  results: Array<{ label: string; value: string; status: "PASS" | "FAIL" | "PENDING" }>;
  finalStatus: string;
  at: string;
  verifiedBy: string;
}

// ---- Vendor / dependency graph ----

export type GraphNodeType = "organization" | "application" | "service" | "api" | "identity" | "database" | "vendor" | "subvendor" | "asset" | "cloud" | "legacy";

export interface DependencyNode {
  id: string;
  label: string;
  type: GraphNodeType;
  criticality: RiskBand;
  risk: RiskBand;
  findings: number;
  vendorId?: string;
  description?: string;
  edges: Array<{ to: string; relation: "deploys" | "depends" | "hosts" | "provides" | "vendor_of" }>;
}

export interface VendorRiskSummary {
  id: string;
  name: string;
  tier: string;
  risk: RiskBand;
  complianceScore: number;
  criticality: RiskBand;
  openFindings: number;
  provideServices: string[];
  subvendors: string[];
  affectedSystems: number;
  concentrationRisk: RiskBand;
  changeIncoming: boolean;
}

export interface VendorChangeImpact extends ChangeImpactSummary {
  vendorId: string;
  vendorName: string;
  changeType: string;
  affectedControls: string[];
  affectedFrameworks: string[];
  requiredApproval: boolean;
}

// ---- Governance audit ----

export type GovernanceActorType = "ai" | "human" | "system";
export type GovernanceEventType =
  | "ORG_PROFILE_UPDATED"
  | "ASSESSMENT_STARTED"
  | "FRAMEWORK_MAPPED"
  | "FINDING_CREATED"
  | "REMEDIATION_PLANNED"
  | "CHANGE_DRAFTED"
  | "CHANGE_AI_ANALYZED"
  | "IMPACT_ANALYZED"
  | "SIMULATION_STARTED"
  | "SIMULATION_COMPLETED"
  | "EXCEPTION_DETECTED"
  | "APPROVAL_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "EMERGENCY_OVERRIDE"
  | "CHANGE_FREEZE_ACTIVATED"
  | "CHANGE_FREEZE_DEACTIVATED"
  | "CHANGE_EXECUTED"
  | "VERIFICATION_STARTED"
  | "VERIFICATION_PASSED"
  | "VERIFICATION_FAILED"
  | "ROLLBACK_RECOMMENDED"
  | "ROLLBACK_EXECUTED"
  | "DRIFT_DETECTED"
  | "REGULATORY_UPDATE_DETECTED"
  | "REGION_CONFLICT_DETECTED"
  | "VENDOR_CHANGE_DETECTED"
  | "HUMAN_VERIFIED"
  | "GOVERNANCE_CONTEXT_CHANGED"
  | "FRAMEWORK_ACTIVATED"
  | "FRAMEWORK_DEACTIVATED"
  | "APPLICABILITY_EVALUATED"
  | "CONTROL_MAPPING_UPDATED"
  | "POLICY_CONFLICT_DETECTED"
  | "COMPLIANCE_RECALCULATED";

export interface GovernanceAuditEvent {
  id: string;
  eventType: GovernanceEventType;
  actor: string;
  actorType: GovernanceActorType;
  action: string;
  target: string;
  targetType: string;
  reason?: string;
  previousState?: string;
  newState?: string;
  at: string;
  detail: Record<string, unknown>;
}

export interface GovernanceDashboardStats {
  passport: CompliancePassport;
  openExceptions: number;
  pendingApprovals: number;
  highRiskChanges: number;
  activeDrift: number;
  avgVendorRisk: number;
  regionConflicts: number;
  regulatoryUpdates: number;
  freezeActive: boolean;
  recentEvents: GovernanceAuditEvent[];
  changes: ChangeRequest[];
  exceptions: ComplianceException[];
}

export interface DemoSintPilotScenario {
  id: string;
  name: string;
  industry: string;
  icon: string;
  description: string;
  orgProfile: OrganizationProfile;
  change: {
    title: string;
    description: string;
    configBefore: ConfigSetting[];
    configAfter: ConfigSetting[];
    targetSystems: string[];
    expectedStory: string[];
    flagsException: boolean;
    exceptionType?: ExceptionType;
    fourEyes: boolean;
    expectedResult: string;
  };
}

// ---------------------------------------------------------------------------
// Global Governance & Compliance Policy Engine
// ---------------------------------------------------------------------------

export type FrameworkCategory = "GLOBAL_BASELINE" | "REGIONAL" | "INDUSTRY" | "SECURITY_BASELINE";

export type ApplicabilityStatus = "ACTIVE" | "CONDITIONAL" | "NOT_APPLICABLE";

export interface FrameworkApplicabilityReason {
  /** Stable machine key, e.g. "region:EU". */
  key: string;
  /** Human-readable criterion sentence. */
  text: string;
  /** Whether this criterion matched the organizational context. */
  matched: boolean;
}

export interface FrameworkApplicability {
  frameworkId: ComplianceFrameworkId;
  code: string;
  name: string;
  shortName: string;
  version: string;
  category: FrameworkCategory;
  /** Gestalt region the framework governs: GLOBAL, EU, US, INDIA, APAC… */
  region: string;
  regionLabel: string;
  status: ApplicabilityStatus;
  applicabilityLabel: "Applicable framework" | "Conditional" | "Not applicable";
  /** Conditions that would turn a CONDITIONAL framework into ACTIVE. */
  condition?: string;
  /** Structured criteria — matched lines are the "WHY ACTIVE" panel. */
  reasons: FrameworkApplicabilityReason[];
  controlIds: GovernanceControlId[];
  baselineScore: number;
}

export interface GovernanceContext {
  organization: {
    id: string;
    name: string;
    descriptions?: string[];
  };
  primaryRegion: string;
  primaryRegionLabel: string;
  operatingRegions: RegionCode[];
  operatingRegionLabels: string[];
  industryIds: IndustryId[];
  industryLabels: string[];
  orgType: string;
  dataTypes: string[];
  criticality: RiskBand;
  cloud: string;
}

export interface RegionGovernanceScore {
  /** Gestalt region code: GLOBAL | EU | US | INDIA | APAC. */
  region: string;
  label: string;
  flag: string;
  activeFrameworks: number;
  conditionalFrameworks: number;
  score: number;
}

export interface GovernanceScores {
  overall: number;
  globalBaseline: number;
  regional: number;
  industry: number;
  byRegion: RegionGovernanceScore[];
  /** Transparent description of the weighting model. */
  method: string;
}

export interface PolicyConflictFrameworkRef {
  region: string;
  label: string;
  frameworks: string[];
}

export interface PolicyConflict {
  id: string;
  topic: string;
  description: string;
  requirementA: string;
  requirementAFrom: string;
  requirementB: string;
  requirementBFrom: string;
  affectedControlId: GovernanceControlId;
  affectedControl: string;
  affectedRegions: string[];
  potentialImpact: string;
  recommendedReview: string;
  frameworks: PolicyConflictFrameworkRef[];
  status: "DETECTED" | "REVIEWING" | "REVIEW_COMPLETE";
  detectedAt: string;
}

export interface GovernanceEvaluation {
  context: GovernanceContext;
  frameworks: FrameworkApplicability[];
  activeFrameworks: FrameworkApplicability[];
  activeCount: number;
  conditionalCount: number;
  notApplicableCount: number;
  globalBaselines: FrameworkApplicability[];
  regional: FrameworkApplicability[];
  industryDriven: FrameworkApplicability[];
  securityBaselines: FrameworkApplicability[];
  scores: GovernanceScores;
  conflicts: PolicyConflict[];
  openGaps: number;
  disclaimer: string;
  evaluatedAt: string;
}

export interface FrameworkControlMapping {
  controlId: string;
  controlName: string;
  category: string;
  severity: string;
  coreRequirement: string;
  refs: string[];
}

export interface FrameworkMappings {
  framework: ComplianceFrameworkDef;
  applicable: FrameworkApplicability;
  controlCount: number;
  controls: FrameworkControlMapping[];
}

// ---------------------------------------------------------------------------
// Enterprise Asset Management — unified multi-vendor asset model
// ---------------------------------------------------------------------------

export type AssetType =
  | "NETWORK_DEVICE"
  | "ROUTER"
  | "SWITCH"
  | "FIREWALL"
  | "PROXY"
  | "SERVER"
  | "VIRTUAL_MACHINE"
  | "DATABASE"
  | "APPLICATION"
  | "API"
  | "MESSAGE_QUEUE"
  | "CLOUD_RESOURCE"
  | "LOAD_BALANCER"
  | "CERTIFICATE"
  | "OTHER";

export type AssetEnvironment = "PROD_SIM" | "PRODUCTION" | "STAGING" | "DEVELOPMENT" | "DR";

export type AssetStatus =
  | "DISCOVERED"
  | "IDENTIFIED"
  | "CONNECTABLE"
  | "SCANNABLE"
  | "MONITORED"
  | "NON_COMPLIANT"
  | "COMPLIANT";

export type AssetCriticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type NetworkTier = "TIER_1" | "TIER_2" | "TIER_3";

export type ConnectionStatus = "ALLOWED" | "BLOCKED" | "MONITORED";

export interface AssetLocationRef {
  region: string;
  site: string;
  networkZone: string;
  tier: NetworkTier;
}

export interface AssetRelationship {
  id: string;
  fromAssetId: string;
  toAssetId: string;
  relation: "serves" | "dependsOn" | "hosts" | "fronts" | "connectsTo";
  source?: string;
  destination?: string;
  protocol?: string;
  port?: number;
  networkZone?: string;
  status: ConnectionStatus;
  encrypted?: boolean;
}

export interface AssetEvent {
  at: string;
  action: string;
  actor: string;
  detail?: string;
}

export interface AssetStateHistoryEntry {
  at: string;
  label: string;
  state: Record<string, unknown>;
}

export type ConnectorType =
  | "NETWORK"
  | "SERVER"
  | "DATABASE"
  | "APPLICATION"
  | "FIREWALL"
  | "MESSAGE_QUEUE"
  | "CLOUD";

export type ConnectorStatus = "ONLINE" | "OFFLINE" | "AUTHENTICATION_FAILED" | "NETWORK_BLOCKED";

export interface AssetRecord {
  id: string;
  name: string;
  assetType: AssetType;
  vendor: string;
  technology: string;
  environment: AssetEnvironment;
  location: AssetLocationRef;
  siteLabel: string;
  regionLabel: string;
  hostname: string;
  ipAddress: string;
  status: AssetStatus;
  discoveryStatus: AssetStatus;
  criticality: AssetCriticality;
  connectorType: ConnectorType;
  lastDiscoveredAt?: string;
  lastScannedAt?: string;
  complianceStatus?: FindingStatus;
  complianceScore?: number;
  riskScore?: number;
  riskBand?: RiskBand;
  observedState: Record<string, unknown>;
  stateHistory: AssetStateHistoryEntry[];
  relationships: AssetRelationship[];
  history: AssetEvent[];
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export type RemediationActionType =
  | "SET_TLS_MIN_VERSION"
  | "REVOKE_AND_RENEW_CERTIFICATE"
  | "DISABLE_INSECURE_PROTOCOL"
  | "ENFORCE_STRONG_CIPHERS"
  | "ENABLE_DB_ENCRYPTION"
  | "RESTRICT_DB_BIND"
  | "CONSOLIDATE_FIREWALL_RULE"
  | "ENFORCE_STRONG_AUTH"
  | "ENABLE_INTEGRITY_VALIDATION"
  | "ENABLE_XML_SIGNATURE_VALIDATION"
  | "SECURE_API_CONFIG"
  | "ROTATE_AND_SCREEN_SECRETS"
  | "RESTRICT_PRIVILEGED_ACCESS"
  | "UPGRADE_SERVICE_VERSION"
  | "RESTORE_BASELINE_HASH"
  | "SECURE_MESSAGE_QUEUE";

export interface ConnectorRecord {
  id: string;
  type: ConnectorType;
  name: string;
  vendor: string;
  version: string;
  status: ConnectorStatus;
  lastContactAt?: string;
  simulated: boolean;
  authorizedActions: RemediationActionType[];
  supportedAssetTypes: AssetType[];
  connectError?: string;
  /** Transport the adapter uses to reach the managed system (SSH/SNMP/HTTPS/...). */
  transportType?: string;
  /** Wire protocol spoken by the connector (HTTPS, SNMP, postgresql, AMQP, ...). */
  protocol?: string;
  /** Declared inspection capabilities — the connector must not claim unsupported ones. */
  capabilities?: string[];
  /** Last measured replica round-trip latency in milliseconds. */
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Connector test results (PHASE 2 — connector + evidence architecture)
// ---------------------------------------------------------------------------

export interface ConnectorTestResult {
  ok: boolean;
  connectorId: string;
  connector: string;
  vendor: string;
  protocol?: string;
  transportType?: string;
  status: ConnectorStatus;
  latencyMs: number;
  connectorVersion: string;
  capabilities: string[];
  at: string;
}

export interface AssetConnectorProfile {
  assetId: string;
  assetName: string;
  online: boolean;
  connector?: ConnectorRecord;
  latencyMs: number;
  fromCapabilities: string[];
}

// ---------------------------------------------------------------------------
// Normalized evidence
// ---------------------------------------------------------------------------

export type EvidenceType =
  | "CONFIGURATION"
  | "API_RESPONSE"
  | "HANDSHAKE"
  | "CERTIFICATE"
  | "PORT_SCAN"
  | "SYSTEM_OUTPUT"
  | "SCHEMA_METADATA"
  | "HTTP_HEADER"
  | "PACKAGE_METADATA"
  | "NETWORK"
  | "TLS"
  | "FIREWALL"
  | "ACL"
  | "AUTHENTICATION"
  | "CRYPTOGRAPHY"
  | "INTEGRITY"
  | "LOG"
  | "SYSTEM";

/**
 * Re-computed SHA-256 integrity check. `verified` is derived by re-hashing the
 * canonical evidence payload stored on the record — never fabricated.
 */
export interface EvidenceVerification {
  hash: string;
  verified: boolean;
  canonical: string;
  verifiedAt: string;
}

export type EvidenceWithVerification = EvidenceRecord & { verification: EvidenceVerification };

export interface EvidenceRecord {
  id: string;
  evidenceId: string;
  assetId: string;
  controlId: string;
  findingId?: string;
  scanId?: string;
  source: string;
  observedValue: string;
  expectedValue: string;
  evidenceType: EvidenceType;
  timestamp: string;
  status: FindingStatus;
  rawReference: string;
  confidence: number;
  integrityHash: string;
  collector: string;
  simulated: true;
  detail: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Asset scans, findings, risk explanation
// ---------------------------------------------------------------------------

export interface RiskFactorDetail {
  factor: "severity" | "exposure" | "criticality" | "importance" | "exploitability";
  label: string;
  weight: number;
  value: number;
  contribution: number;
  reason: string;
}

export interface RiskExplanation {
  score: number;
  band: RiskBand;
  factors: RiskFactorDetail[];
  summary: string;
}

export interface AssetFinding extends Finding {
  assetId: string;
  evidenceIds: string[];
  assetType: AssetType;
  location?: AssetLocationRef;
  riskExplanation?: RiskExplanation;
  /** Deterministic lifecycle state (evidence-driven, tracked across scans). */
  lifecycle?: FindingLifecycle;
  /** Observed value the rule evaluated (evidence-grounded). */
  observedValue?: string;
  /** Expected/baseline value the rule compared against. */
  expectedValue?: string;
  /** Structured remediation guidance emitted by the rule engine. */
  remediationGuidance?: string;
  /** PHASE 4: Governance context for this finding (region, policy, frameworks, exception status). */
  governanceContext?: GovernanceFindingContext;
}

export interface AssetScanRecord {
  id: string;
  assetId: string;
  assetName: string;
  connectorType: ConnectorType;
  environment: AssetEnvironment;
  status: "RUNNING" | "COMPLETED" | "ERROR";
  startedAt: string;
  completedAt?: string;
  findings: AssetFinding[];
  risk?: RiskAssessment | null;
  compliance?: { passed: number; failed: number; warnings: number; na: number; score: number } | null;
  evidenceIds: string[];
  trigger?: "manual" | "auto_verify" | "scheduled";
  error?: string;
}

// ---------------------------------------------------------------------------
// Remediation orchestration
// ---------------------------------------------------------------------------

export interface RemediationActionProposal {
  actionType: RemediationActionType;
  displayName: string;
  parameters: Record<string, unknown>;
  reason: string;
  expectedResult: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  rollbackAvailable: boolean;
}

export type ValidationStatus = "PENDING" | "PASS" | "FAIL";

export type RemediationStatus =
  | "PLANNED"
  | "VALIDATED"
  | "VALIDATION_FAILED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "VERIFYING"
  | "VERIFIED"
  | "ROLLING_BACK"
  | "ROLLED_BACK";

export type ExecStatus = "STARTED" | "VALIDATING" | "EXECUTING" | "COMPLETED" | "FAILED";

export interface RemediationValidationResult {
  status: ValidationStatus;
  beforeState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  expectedResult: string;
  simulatedOutput: string;
  message: string;
  at: string;
}

export interface RemediationApprovalRecord {
  status: "APPROVED" | "REJECTED";
  approverName: string;
  approverRole: string;
  comment?: string;
  at: string;
}

export interface RemediationExecutionLogEntry {
  at: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}

export interface RemediationExecutionResult {
  status: ExecStatus;
  startedAt: string;
  completedAt?: string;
  logs: RemediationExecutionLogEntry[];
  action: RemediationActionType;
  appliedTo: string;
  message?: string;
}

export interface RemediationVerificationResult {
  status: "PASS" | "FAIL";
  environment: AssetEnvironment;
  before: { findingStatus: FindingStatus; riskScore: number; riskBand: RiskBand; compliance: string };
  after: { findingStatus: FindingStatus; riskScore: number; riskBand: RiskBand; compliance: string };
  evidenceBeforeIds: string[];
  evidenceAfterIds: string[];
  triggeredBy: string;
  at: string;
}

export interface RemediationRollbackResult {
  available: boolean;
  triggered: boolean;
  status: "NOT_NEEDED" | "ROLLING_BACK" | "ROLLED_BACK" | "SKIPPED";
  reason?: string;
  restoredState?: Record<string, unknown>;
  at?: string;
}

export interface RemediationRecord {
  id: string;
  findingId: string;
  assetId: string;
  assetName: string;
  controlId: string;
  controlName: string;
  title: string;
  reason: string;
  riskScore: number;
  riskBand: RiskBand;
  proposedAction: RemediationActionProposal;
  status: RemediationStatus;
  environment: AssetEnvironment;
  validation?: RemediationValidationResult;
  approval?: RemediationApprovalRecord;
  execution?: RemediationExecutionResult;
  verification?: RemediationVerificationResult;
  rollback?: RemediationRollbackResult;
  auditEventIds: string[];
  createdAt: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Findings AI analysis (grounded in available evidence)
// ---------------------------------------------------------------------------

export interface FindingAnalysis {
  findingId: string;
  findingTitle: string;
  controlId: string;
  severity: Severity;
  riskScore: number;
  riskBand: RiskBand;
  assetName: string;
  assetType: AssetType;
  environment: AssetEnvironment;
  provider: AiProviderMode;
  model?: string;
  analysis: {
    explanation: string;
    whyItMatters: string;
    potentialImpact: string;
    rootCauseHypothesis: string;
    recommendedRemediation: string;
    validationSteps: string[];
    rollbackConsiderations: string;
    executiveSummary: string;
  };
  evidenceSummary: {
    evidenceAvailable: boolean;
    count: number;
    notes: string;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Enterprise topology + discovery + impact + posture
// ---------------------------------------------------------------------------

export interface EnterpriseSite {
  id: string;
  label: string;
  region: string;
  timezone: string;
  zones: string[];
}

export interface EnterpriseRegion {
  code: string;
  label: string;
  flag: string;
  sites: EnterpriseSite[];
}

export interface TierInfo {
  id: NetworkTier;
  label: string;
  description: string;
}

export interface TopologyConnection {
  id: string;
  source: string;
  destination: string;
  protocol: string;
  port: number;
  networkZone: string;
  tier: NetworkTier;
  status: ConnectionStatus;
  connectorStatus: ConnectorStatus;
  purpose: string;
}

export interface EnterpriseTopology {
  regions: EnterpriseRegion[];
  tiers: TierInfo[];
  connections: TopologyConnection[];
  generatedAt: string;
}

export interface DiscoveryResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  discovered: number;
  updated: number;
  unchanged: number;
  assets: AssetRecord[];
  notes: string[];
}

export interface ImpactNode {
  id: string;
  label: string;
  kind: "asset" | "service" | "application" | "database" | "business" | "data" | "internet";
  detail?: string;
  criticality?: AssetCriticality;
  reachedFrom?: string;
  assetType?: AssetType;
  region?: string;
  tier?: NetworkTier;
  environment?: AssetEnvironment;
  riskScore?: number;
  riskBand?: RiskBand;
  complianceStatus?: FindingStatus;
}

export interface ImpactEdge {
  from: string;
  to: string;
  relation: string;
}

export interface AssetImpactGraph {
  rootAssetId: string;
  rootLabel: string;
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  summary: string[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// PHASE 5 — finding risk context, blast radius and potential exposure path.
// Every value below is computed deterministically from the asset graph and the
// explainable risk model — never hard-coded. Terminology stays precautionary:
// "potential impact" / "blast radius" / "exposure path", never confirmed attack.
// ---------------------------------------------------------------------------

export interface FindingBlastRadius {
  /** Downstream asset ids reachable from the finding's asset (bounded traversal). */
  affectedAssetIds: string[];
  affectedAssetCount: number;
  /** Distinct downstream assets carrying CRITICAL or HIGH criticality. */
  criticalAssetsAffected: number;
  /** Distinct downstream service labels (e.g. Database, Message queue). */
  affectedServices: string[];
  servicesAffected: number;
  /** Distinct region codes across the affected sub-graph (incl. the root asset). */
  regionsAffected: string[];
  /** True when the blast radius spans more than one region. */
  crossRegion: boolean;
}

export interface FindingRiskContext {
  findingId: string;
  assetId: string;
  assetName: string;
  /** Deterministic 0–100 contextual risk (matche finding.risk for FAIL findings). */
  riskScore: number;
  riskLevel: RiskBand;
  severity: Severity;
  assetType: AssetType;
  assetCriticality: AssetCriticality;
  /** Industry-standard exposure class derived from zone/tier/tags. */
  exposure: NetworkExposure;
  /** Deterministic 0–100 potential-impact score from the blast radius. */
  impactScore: number;
  blastRadius: FindingBlastRadius;
  evidenceConfidence: number;
  contributors: {
    assetCriticality: string;
    exposure: NetworkExposure;
    severityContribution: number;
    exposureContribution: number;
    criticalityContribution: number;
    importanceContribution: number;
    exploitabilityContribution: number;
    complianceImpact: string;
    evidenceConfidence: number;
    dependencyImpact: string;
  };
  /** "Why this risk score?" prose assembled from actual contributor values. */
  explanation: string;
}

export interface ExposurePathHop {
  id: string;
  name: string;
  kind: "internet" | "edge" | "asset";
  assetType?: AssetType;
  criticality?: AssetCriticality;
  exposure?: NetworkExposure;
  relation?: string;
  protocol?: string;
  port?: number;
}

export interface AssetExposurePath {
  rootAssetId: string;
  rootName: string;
  /** Ordered "potential exposure path" from the internet/edge boundary inward (bounded). */
  path: ExposurePathHop[];
  depth: number;
  potential: true;
  label: "Potential exposure path";
  disclaimer: string;
  generatedAt: string;
}

export interface AssetPostureSummary {
  globalCompliance: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  remediationRate: number;
  verificationRate: number;
  byRegion: Array<{ region: string; label: string; score: number; assets: number }>;
  byType: Array<{ type: AssetType; count: number; nonCompliant?: number }>;
}

// ---------------------------------------------------------------------------
// Asset-aware compliance controls
// ---------------------------------------------------------------------------

export type AssetControlFramework = "ISO27001" | "NIST" | "CIS" | "PCI_DSS" | "OWASP" | "PROTOTYPE";

export interface AssetComplianceControl {
  id: string;
  name: string;
  description: string;
  requirement: string;
  frameworks: AssetControlFramework[];
  severity: Severity;
  appliesTo: AssetType[];
  evidenceSource: string;
  evalKind:
    | "min_version"
    | "enabled"
    | "disabled"
    | "exact"
    | "port_exposed"
    | "hash_match"
    | "unexpired"
    | "nonEmpty"
    | "rule_scan"
    | "range"
    | "legacy_protocols"
    | "cert_crypto"
    | "mgmt_access"
    | "acl";
  evalField: string;
  expected?: unknown;
  failureMessage: string;
  remediation: string;
  remediationActions: RemediationActionType[];
}

export interface AssetFrameworkCoverage {
  framework: AssetControlFramework;
  label: string;
  totalControls: number;
  passed: number;
  failed: number;
  score: number;
  status: "COMPLIANT" | "PARTIAL" | "AT_RISK" | "NOT_ASSESSED";
}

export interface AssetControlCatalogue {
  controls: AssetComplianceControl[];
  frameworks: AssetFrameworkCoverage[];
  disclaimer: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Compliance summary (evidence-driven, deterministic)
// ---------------------------------------------------------------------------

export interface ComplianceSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  na: number;
  score: number;
  byCategory: Array<{ category: string; passed: number; failed: number; warnings: number }>;
  bySeverity: Array<{ severity: Severity; count: number }>;
  lifecycleBreakdown: Array<{ lifecycle: FindingLifecycle; count: number }>;
  /** PHASE 4: Regional posture breakdown. */
  byRegion?: RegionalPosture[];
  /** PHASE 4: Framework coverage breakdown. */
  byFramework?: FrameworkPosture[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Finding lifecycle update input
// ---------------------------------------------------------------------------

export interface FindingLifecycleUpdate {
  lifecycle: Extract<FindingLifecycle, "ACKNOWLEDGED" | "EXCEPTED" | "OPEN">;
  reason?: string;
}

// ---------------------------------------------------------------------------
// PHASE 4 — Global Adaptive Governance + Multi-Framework Compliance
// ---------------------------------------------------------------------------

export type MappingStatus = "MAPPED" | "REVIEW_REQUIRED";

export type FrameworkScope = "TECHNICAL" | "REGULATORY" | "INDUSTRY";

export type FrameworkStatus = "ACTIVE" | "CONDITIONAL" | "NOT_APPLICABLE";

/**
 * Multi-framework compliance definition for the adaptive governance engine.
 * Each framework covers technical security controls at the asset level.
 */
export interface ComplianceFramework2 {
  id: AssetControlFramework;
  name: string;
  version: string;
  description: string;
  scope: FrameworkScope;
  status: FrameworkStatus;
  applicability: "Applicable" | "Optional" | "Organization-selected" | "Not applicable";
  disclaimer: string;
}

/**
 * Mapping between an asset-level compliance control and a framework control.
 * mappingStatus indicates whether the mapping is verified or needs review.
 */
export interface FrameworkControlMapping2 {
  framework: AssetControlFramework;
  mappingStatus: MappingStatus;
  mappingRef?: string;
  note: string;
}

export type RegionKey = "GLOBAL" | "IND" | "USA" | "SGP" | "EU" | "UK";

/**
 * Regional policy profile: determines which frameworks and controls
 * apply to assets in a given region, considering production/production-like
 * environments vs. development.
 */
export interface PolicyProfile {
  profileId: string;
  name: string;
  region: RegionKey;
  regionLabel: string;
  description: string;
  enabledFrameworks: AssetControlFramework[];
  severityOverrides: Partial<Record<string, Severity>>;
  exceptions: GovernanceExceptionRef[];
  version: string;
  status: "ACTIVE" | "DRAFT";
}

/**
 * Organization-level baseline configuration.
 * Defines the global minimum security posture that applies to all assets.
 */
export interface OrganizationBaseline {
  id: string;
  name: string;
  version: string;
  minTls: string;
  requireLogging: boolean;
  dbEncryption: boolean;
  privilegedAccessRestricted: boolean;
  enabledControls: string[];
  enabledFrameworks: AssetControlFramework[];
  updatedBy?: string;
  updatedAt?: string;
}

/**
 * Result of automatic policy selection for an asset.
 * Deterministic: same asset context always produces the same selection.
 */
export interface PolicySelection {
  assetId: string;
  region: RegionKey;
  regionLabel: string;
  environment: AssetEnvironment;
  criticality: AssetCriticality;
  assetType: AssetType;
  policyProfileId: string;
  policyProfileName: string;
  organizationPolicy: string;
  frameworks: Array<{ id: AssetControlFramework; name: string; version: string; status: FrameworkStatus }>;
  applicableControls: string[];
  explanation: string[];
  disclaimer: string;
  selectedAt: string;
}

export interface ApplicableControl {
  controlId: string;
  controlName: string;
  severity: Severity;
  whyApplicable: string;
  frameworkMembership: AssetControlFramework[];
}

/**
 * List of controls applicable to an asset, derived from its type, region,
 * environment, criticality, and the selected policy profile.
 */
export interface ApplicableControlsResult {
  assetId: string;
  region: RegionKey;
  environment: AssetEnvironment;
  criticality: AssetCriticality;
  assetType: AssetType;
  total: number;
  applicable: ApplicableControl[];
  excluded: Array<{ controlId: string; controlName: string; reason: string }>;
  disclaimer: string;
  generatedAt: string;
}

export type GovernanceExceptionStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED";

/**
 * Runtime exception against a specific control finding.
 * Approved exceptions suppress FAIL status; expired exceptions stop suppressing.
 */
export interface GovernanceException {
  id: string;
  controlId: string;
  controlName: string;
  assetId: string;
  assetName: string;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  status: GovernanceExceptionStatus;
  createdAt: string;
  expiresAt: string;
  rejectionReason?: string;
}

export interface GovernanceExceptionRef {
  id: string;
  status: GovernanceExceptionStatus;
  reason: string;
  expiresAt: string;
}

/**
 * Governance context attached to each finding.
 * Shows why the control is applicable and whether an exception is active.
 */
export interface GovernanceFindingContext {
  region: RegionKey;
  regionLabel: string;
  policyProfileId: string;
  policyProfileName: string;
  frameworks: AssetControlFramework[];
  whyApplicable: string;
  exception?: GovernanceExceptionRef;
}

/**
 * Full decision trace for an asset: shows the organization policy,
 * selected regional policy, applicable frameworks and controls,
 * evidence-grounded findings, and active exceptions.
 */
export interface GovernanceDecisionTrace {
  assetId: string;
  assetName: string;
  assetType: AssetType;
  region: RegionKey;
  regionLabel: string;
  environment: AssetEnvironment;
  criticality: AssetCriticality;
  organizationPolicy: { id: string; name: string; version: string };
  regionalPolicy: { profileId: string; name: string; region: RegionKey; regionLabel: string };
  frameworks: Array<{ id: AssetControlFramework; name: string; version: string; status: FrameworkStatus; disclaimer: string }>;
  applicableControls: Array<{ controlId: string; controlName: string; severity: Severity; whyApplicable: string }>;
  evidence: Array<{ controlId: string; status: FindingStatus; observedValue: string; expectedValue: string }>;
  findings: Array<{ controlId: string; controlName: string; status: FindingStatus; severity: Severity; risk: number }>;
  exceptions: GovernanceException[];
  disclaimer: string;
  generatedAt: string;
}

/**
 * Regional posture: aggregate compliance scores per geographic region.
 */
export interface RegionalPosture {
  region: RegionKey;
  regionLabel: string;
  assetCount: number;
  score: number;
  passed: number;
  failed: number;
  warnings: number;
  findings: number;
}

/**
 * Framework posture: aggregate compliance scores per framework.
 */
export interface FrameworkPosture {
  framework: AssetControlFramework;
  label: string;
  totalControls: number;
  passed: number;
  failed: number;
  score: number;
  status: "COMPLIANT" | "PARTIAL" | "AT_RISK" | "NOT_ASSESSED";
}

/**
 * Request body for creating a governance exception.
 */
export interface GovernanceExceptionRequest {
  controlId: string;
  assetId: string;
  reason: string;
  requestedBy: string;
  expiresInDays?: number;
}

/**
 * Request body for approving/rejecting a governance exception.
 */
export interface GovernanceExceptionDecision {
  exceptionId: string;
  decision: "APPROVED" | "REJECTED";
  decidedBy: string;
  reason?: string;
  expiresInDays?: number;
}
