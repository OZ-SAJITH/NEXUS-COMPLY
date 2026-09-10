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
