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
  | "AI_INTERPRETATION_EDITED";

export type AuditEventSource = "system" | "ai" | "human";

export interface AuditEventRecord {
  id: string;
  eventType: AuditEventType;
  entityType: "finding" | "audit" | "ai_interpretation";
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
