export type {
  SecurityIntent,
  SecurityIntentType,
  Finding,
  FindingStatus,
  Severity,
  ComplianceControl,
  RiskAssessment,
  RemediationSimulation,
  RemediationStep,
  ExposurePath,
  ExposureNode,
  AiInterpretation,
  ApprovedMapping,
  AuditRecord,
  ConfigurationRecord,
  DashboardStats,
  VendorId,
  VendorStatus,
  ReviewStatus,
  UserRole,
  PublicUser,
  FindingReviewRecord,
  AuditEventRecord,
  AuditEventType,
  ComplianceFinalization,
  ReviewAggregate,
  ReviewQueueItem,
  ReviewQueueResponse,
  ReviewQueueParams,
  ReviewDetail,
  FinalizeReviewInput,
} from "@nexus/shared-types";

export interface DemoConfig {
  id: string;
  vendor: string;
  status: string;
  label: string;
  file: string;
  content: string;
  exists: boolean;
}

export interface UploadResult {
  id: string;
  name: string;
  vendor: string;
  vendorStatus: string;
  detectedBy: string;
  confidence: number;
  redacted: boolean;
  redactedPreview: string;
}