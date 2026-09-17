import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  ConfigurationRecord,
  AuditRecord,
  ApprovedMapping,
  UserRecord,
  FindingReviewRecord,
  AuditEventRecord,
  ComplianceFinalization,
  AssetRecord,
  ConnectorRecord,
  EvidenceRecord,
  AssetScanRecord,
  RemediationRecord,
  GovernanceException,
  OrganizationBaseline,
} from "@nexus/shared-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, "../../../../data");

export interface DbShape {
  configurations: ConfigurationRecord[];
  audits: AuditRecord[];
  approvedMappings: ApprovedMapping[];
  users: UserRecord[];
  findingReviews: FindingReviewRecord[];
  auditEvents: AuditEventRecord[];
  finalizations: ComplianceFinalization[];
  assets: AssetRecord[];
  connectors: ConnectorRecord[];
  evidence: EvidenceRecord[];
  assetScans: AssetScanRecord[];
  remediations: RemediationRecord[];
  governanceExceptions: GovernanceException[];
  organizationBaseline: OrganizationBaseline[];
}

/**
 * Minimal JSON-file repository.
 * Deterministic, zero-infrastructure, ideal for a demo.
 * Swap this adapter for a PostgreSQL-backed implementation for production.
 */
export class JsonRepository {
  private file: string;
  private cache: DbShape | null = null;

  constructor(dataDir: string = process.env.DATA_DIR ?? DEFAULT_DATA_DIR) {
    this.file = join(dataDir, "db.json");
  }

  private async load(): Promise<DbShape> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DbShape>;
      this.cache = {
        configurations: parsed.configurations ?? [],
        audits: parsed.audits ?? [],
        approvedMappings: parsed.approvedMappings ?? [],
        users: parsed.users ?? [],
        findingReviews: parsed.findingReviews ?? [],
        auditEvents: parsed.auditEvents ?? [],
        finalizations: parsed.finalizations ?? [],
        assets: parsed.assets ?? [],
        connectors: parsed.connectors ?? [],
        evidence: parsed.evidence ?? [],
        assetScans: parsed.assetScans ?? [],
        remediations: parsed.remediations ?? [],
        governanceExceptions: (parsed as any).governanceExceptions ?? [],
        organizationBaseline: (parsed as any).organizationBaseline ?? [],
      };
    } catch {
      this.cache = { configurations: [], audits: [], approvedMappings: [], users: [], findingReviews: [], auditEvents: [], finalizations: [], assets: [], connectors: [], evidence: [], assetScans: [], remediations: [], governanceExceptions: [], organizationBaseline: [] };
    }
    return this.cache;
  }

  private async save(db: DbShape): Promise<void> {
    await fs.mkdir(dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(db, null, 2), "utf-8");
  }

  async flush(): Promise<void> {
    if (this.cache) await this.save(this.cache);
  }

  // ---- Configurations ----
  async allConfigurations(): Promise<ConfigurationRecord[]> {
    const db = await this.load();
    return db.configurations;
  }

  async getConfiguration(id: string): Promise<ConfigurationRecord | undefined> {
    const db = await this.load();
    return db.configurations.find((c) => c.id === id);
  }

  async saveConfiguration(config: ConfigurationRecord): Promise<ConfigurationRecord> {
    const db = await this.load();
    const idx = db.configurations.findIndex((c) => c.id === config.id);
    if (idx >= 0) db.configurations[idx] = config;
    else db.configurations.unshift(config);
    await this.save(db);
    return config;
  }

  // ---- Audits ----
  async allAudits(): Promise<AuditRecord[]> {
    const db = await this.load();
    return db.audits;
  }

  async getAudit(id: string): Promise<AuditRecord | undefined> {
    const db = await this.load();
    return db.audits.find((a) => a.id === id);
  }

  async saveAudit(audit: AuditRecord): Promise<AuditRecord> {
    const db = await this.load();
    const idx = db.audits.findIndex((a) => a.id === audit.id);
    if (idx >= 0) db.audits[idx] = audit;
    else db.audits.unshift(audit);
    await this.save(db);
    return audit;
  }

  // ---- Approved mappings ----
  async allApprovedMappings(): Promise<ApprovedMapping[]> {
    const db = await this.load();
    return db.approvedMappings;
  }

  async getMappingByFingerprint(fingerprint: string): Promise<ApprovedMapping | undefined> {
    const db = await this.load();
    return db.approvedMappings.find((m) => m.syntaxFingerprint === fingerprint);
  }

  async saveMapping(mapping: ApprovedMapping): Promise<ApprovedMapping> {
    const db = await this.load();
    db.approvedMappings.unshift(mapping);
    await this.save(db);
    return mapping;
  }

  async deleteMapping(fingerprint: string): Promise<void> {
    const db = await this.load();
    db.approvedMappings = db.approvedMappings.filter((m) => m.syntaxFingerprint !== fingerprint);
    await this.save(db);
  }

  async reset(): Promise<void> {
    this.cache = { configurations: [], audits: [], approvedMappings: [], users: [], findingReviews: [], auditEvents: [], finalizations: [], assets: [], connectors: [], evidence: [], assetScans: [], remediations: [], governanceExceptions: [], organizationBaseline: [] };
    await this.save(this.cache);
  }

  // ---- Users ----
  async allUsers(): Promise<UserRecord[]> {
    const db = await this.load();
    return db.users;
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    const db = await this.load();
    return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  async getUserById(id: string): Promise<UserRecord | undefined> {
    const db = await this.load();
    return db.users.find((u) => u.id === id);
  }

  async saveUser(user: UserRecord): Promise<UserRecord> {
    const db = await this.load();
    const idx = db.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) db.users[idx] = user;
    else db.users.push(user);
    await this.save(db);
    return user;
  }

  // ---- Finding reviews ----
  async allFindingReviews(): Promise<FindingReviewRecord[]> {
    const db = await this.load();
    return db.findingReviews;
  }

  async getFindingReview(findingId: string): Promise<FindingReviewRecord | undefined> {
    const db = await this.load();
    return db.findingReviews.find((r) => r.findingId === findingId);
  }

  async getFindingReviewsForAudit(auditId: string): Promise<FindingReviewRecord[]> {
    const db = await this.load();
    return db.findingReviews.filter((r) => r.auditId === auditId);
  }

  async saveFindingReview(review: FindingReviewRecord): Promise<FindingReviewRecord> {
    const db = await this.load();
    const idx = db.findingReviews.findIndex((r) => r.findingId === review.findingId);
    if (idx >= 0) db.findingReviews[idx] = review;
    else db.findingReviews.push(review);
    await this.save(db);
    return review;
  }

  async hasFindingReview(findingId: string): Promise<boolean> {
    const db = await this.load();
    return db.findingReviews.some((r) => r.findingId === findingId);
  }

  async removeFindingReview(findingId: string): Promise<void> {
    const db = await this.load();
    db.findingReviews = db.findingReviews.filter((r) => r.findingId !== findingId);
    await this.save(db);
  }

  // ---- Audit events (append-only) ----
  async allAuditEvents(): Promise<AuditEventRecord[]> {
    const db = await this.load();
    return db.auditEvents;
  }

  async auditEventsForFinding(findingId: string): Promise<AuditEventRecord[]> {
    const db = await this.load();
    return db.auditEvents
      .filter((e) => e.findingId === findingId || e.entityType === "audit")
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  async auditEventsForAudit(auditId: string): Promise<AuditEventRecord[]> {
    const db = await this.load();
    return db.auditEvents.filter((e) => e.auditId === auditId).sort((a, b) => a.at.localeCompare(b.at));
  }

  async appendAuditEvent(event: AuditEventRecord): Promise<AuditEventRecord> {
    const db = await this.load();
    db.auditEvents.push(event);
    await this.save(db);
    return event;
  }

  // ---- Finalizations ----
  async allFinalizations(): Promise<ComplianceFinalization[]> {
    const db = await this.load();
    return db.finalizations;
  }

  async getFinalization(auditId: string): Promise<ComplianceFinalization | undefined> {
    const db = await this.load();
    return db.finalizations.find((f) => f.auditId === auditId);
  }

  async saveFinalization(finalization: ComplianceFinalization): Promise<ComplianceFinalization> {
    const db = await this.load();
    const idx = db.finalizations.findIndex((f) => f.auditId === finalization.auditId);
    if (idx >= 0) db.finalizations[idx] = finalization;
    else db.finalizations.push(finalization);
    await this.save(db);
    return finalization;
  }

  // ---- Assets ----
  async allAssets(): Promise<AssetRecord[]> {
    const db = await this.load();
    return db.assets;
  }

  async getAsset(id: string): Promise<AssetRecord | undefined> {
    const db = await this.load();
    return db.assets.find((a) => a.id === id);
  }

  async saveAsset(asset: AssetRecord): Promise<AssetRecord> {
    const db = await this.load();
    const idx = db.assets.findIndex((a) => a.id === asset.id);
    if (idx >= 0) db.assets[idx] = asset;
    else db.assets.push(asset);
    await this.save(db);
    return asset;
  }

  async saveAssets(assets: AssetRecord[]): Promise<AssetRecord[]> {
    const db = await this.load();
    const existing = new Map(db.assets.map((a) => [a.id, a]));
    for (const asset of assets) existing.set(asset.id, asset);
    db.assets = Array.from(existing.values());
    await this.save(db);
    return db.assets;
  }

  // ---- Connectors ----
  async allConnectors(): Promise<ConnectorRecord[]> {
    const db = await this.load();
    return db.connectors;
  }

  async getConnector(id: string): Promise<ConnectorRecord | undefined> {
    const db = await this.load();
    return db.connectors.find((c) => c.id === id);
  }

  async saveConnector(connector: ConnectorRecord): Promise<ConnectorRecord> {
    const db = await this.load();
    const idx = db.connectors.findIndex((c) => c.id === connector.id);
    if (idx >= 0) db.connectors[idx] = connector;
    else db.connectors.push(connector);
    await this.save(db);
    return connector;
  }

  async saveConnectors(connectors: ConnectorRecord[]): Promise<ConnectorRecord[]> {
    const db = await this.load();
    const existing = new Map(db.connectors.map((c) => [c.id, c]));
    for (const c of connectors) existing.set(c.id, c);
    db.connectors = Array.from(existing.values());
    await this.save(db);
    return db.connectors;
  }

  // ---- Evidence ----
  async allEvidence(): Promise<EvidenceRecord[]> {
    const db = await this.load();
    return db.evidence;
  }

  async evidenceForAsset(assetId: string): Promise<EvidenceRecord[]> {
    const db = await this.load();
    return db.evidence.filter((e) => e.assetId === assetId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async evidenceForFinding(findingId: string): Promise<EvidenceRecord[]> {
    const db = await this.load();
    return db.evidence.filter((e) => e.findingId === findingId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async getEvidence(id: string): Promise<EvidenceRecord | undefined> {
    const db = await this.load();
    return db.evidence.find((e) => e.id === id);
  }

  async saveEvidence(record: EvidenceRecord): Promise<EvidenceRecord> {
    const db = await this.load();
    const idx = db.evidence.findIndex((e) => e.id === record.id);
    if (idx >= 0) db.evidence[idx] = record;
    else db.evidence.push(record);
    await this.save(db);
    return record;
  }

  async saveEvidenceBatch(records: EvidenceRecord[]): Promise<EvidenceRecord[]> {
    const db = await this.load();
    const existing = new Map(db.evidence.map((e) => [e.id, e]));
    for (const r of records) existing.set(r.id, r);
    db.evidence = Array.from(existing.values());
    await this.save(db);
    return db.evidence;
  }

  // ---- Asset scans ----
  async allAssetScans(): Promise<AssetScanRecord[]> {
    const db = await this.load();
    return db.assetScans;
  }

  async scansForAsset(assetId: string): Promise<AssetScanRecord[]> {
    const db = await this.load();
    return db.assetScans.filter((s) => s.assetId === assetId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async getAssetScan(id: string): Promise<AssetScanRecord | undefined> {
    const db = await this.load();
    return db.assetScans.find((s) => s.id === id);
  }

  async saveAssetScan(scan: AssetScanRecord): Promise<AssetScanRecord> {
    const db = await this.load();
    const idx = db.assetScans.findIndex((s) => s.id === scan.id);
    if (idx >= 0) db.assetScans[idx] = scan;
    else db.assetScans.push(scan);
    await this.save(db);
    return scan;
  }

  // ---- Remediations ----
  async allRemediations(): Promise<RemediationRecord[]> {
    const db = await this.load();
    return db.remediations;
  }

  async remediationsForAsset(assetId: string): Promise<RemediationRecord[]> {
    const db = await this.load();
    return db.remediations.filter((r) => r.assetId === assetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRemediation(id: string): Promise<RemediationRecord | undefined> {
    const db = await this.load();
    return db.remediations.find((r) => r.id === id);
  }

  async saveRemediation(remediation: RemediationRecord): Promise<RemediationRecord> {
    const db = await this.load();
    const idx = db.remediations.findIndex((r) => r.id === remediation.id);
    if (idx >= 0) db.remediations[idx] = remediation;
    else db.remediations.push(remediation);
    await this.save(db);
    return remediation;
  }

  // ---- Governance exceptions ----
  async allGovernanceExceptions(): Promise<GovernanceException[]> {
    const db = await this.load();
    return db.governanceExceptions;
  }

  async exceptionsForAsset(assetId: string): Promise<GovernanceException[]> {
    const db = await this.load();
    return db.governanceExceptions.filter((e) => e.assetId === assetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async exceptionsForControl(controlId: string): Promise<GovernanceException[]> {
    const db = await this.load();
    return db.governanceExceptions.filter((e) => e.controlId === controlId);
  }

  async getGovernanceException(id: string): Promise<GovernanceException | undefined> {
    const db = await this.load();
    return db.governanceExceptions.find((e) => e.id === id);
  }

  async saveGovernanceException(exception: GovernanceException): Promise<GovernanceException> {
    const db = await this.load();
    const idx = db.governanceExceptions.findIndex((e) => e.id === exception.id);
    if (idx >= 0) db.governanceExceptions[idx] = exception;
    else db.governanceExceptions.push(exception);
    await this.save(db);
    return exception;
  }

  // ---- Organization baseline ----
  async getOrganizationBaseline(): Promise<OrganizationBaseline | undefined> {
    const db = await this.load();
    return db.organizationBaseline[0];
  }

  async saveOrganizationBaseline(baseline: OrganizationBaseline): Promise<OrganizationBaseline> {
    const db = await this.load();
    if (db.organizationBaseline.length > 0) {
      db.organizationBaseline[0] = baseline;
    } else {
      db.organizationBaseline.push(baseline);
    }
    await this.save(db);
    return baseline;
  }
}

let _instance: JsonRepository | null = null;

export function getRepository(): JsonRepository {
  if (!_instance) _instance = new JsonRepository();
  return _instance;
}
