import type { AssetPostureSummary, DashboardStats, Finding, Severity, VendorId } from "@nexus/shared-types";
import { summarizeCompliance, postureScore, severityCount } from "@nexus/compliance-rules";
import { getRepository } from "../storage/jsonRepo";
import { reviewAggregate } from "./reviewService";
import { ConnectorManager } from "./enterprise/connectorManager";
import { ENTERPRISE_REGIONS } from "./enterprise/assetService";

/**
 * Aggregate statistics across all audits for the dashboard.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const repo = getRepository();
  const audits = await repo.allAudits();

  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let postureSum = 0;
  let postureCount = 0;

  const risk: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const vendorDistribution: Record<VendorId, number> = { cisco: 0, fortinet: 0, juniper: 0, unknown: 0 };
  const topRisks: Finding[] = [];

  let knownAnalyzed = 0;
  let unknownDetected = 0;
  let aiInterpretations = 0;
  let approvedMappings = 0;
  let rejectedMappings = 0;

  for (const audit of audits) {
    if (audit.compliance) {
      passed += audit.compliance.passed;
      failed += audit.compliance.failed;
      warnings += audit.compliance.warnings;
    }
    if (audit.risk) {
      postureSum += postureScore(
        summarizeCompliance(audit.findings),
        audit.risk
      );
      postureCount += 1;
    }

    // severity counts across failing findings
    const sev = severityCount(audit.findings);
    for (const k of Object.keys(sev) as Severity[]) {
      risk[k] += sev[k];
    }

    vendorDistribution[audit.vendor] = (vendorDistribution[audit.vendor] ?? 0) + 1;
    if (audit.vendorStatus === "known") knownAnalyzed += 1;
    else unknownDetected += 1;

    for (const f of audit.findings) {
      if (f.status === "FAIL") topRisks.push({ ...f, auditId: audit.id });
    }

    if (audit.aiInterpretations) {
      aiInterpretations += audit.aiInterpretations.length;
      for (const ai of audit.aiInterpretations) {
        if (ai.status === "APPROVED") approvedMappings += 1;
        if (ai.status === "REJECTED") rejectedMappings += 1;
      }
    }
  }

  topRisks.sort((a, b) => b.risk - a.risk);
  const topRisksSliced = topRisks.slice(0, 6);

  const posture = postureCount ? Math.round(postureSum / postureCount) : 0;

  const score = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;

  const managers = {
    connectors: new ConnectorManager(repo),
  };

  return {
    posture,
    compliance: { passed, failed, warnings, score },
    risk,
    vendorDistribution,
    topRisks: topRisksSliced,
    adaptive: {
      knownAnalyzed,
      unknownDetected,
      aiInterpretations,
      approvedMappings: await (await repo.allApprovedMappings()).length,
      rejectedMappings,
      totalAudits: audits.length,
    },
    review: await reviewAggregate(),
    connectors: await connectSummary(managers.connectors),
    assets: await assetSummary(repo),
    remediation: await remediationSummary(repo),
    globalPosture: await postureSummary(repo),
  };
}

async function connectSummary(manager: ConnectorManager): Promise<NonNullable<DashboardStats["connectors"]>> {
  const connectors = await manager.probeAll();
  const online = connectors.filter((c) => c.status === "ONLINE").length;
  const byTypeMap = new Map<string, number>();
  for (const c of connectors) byTypeMap.set(c.type, (byTypeMap.get(c.type) ?? 0) + 1);
  return {
    total: connectors.length,
    online,
    offline: connectors.filter((c) => c.status === "OFFLINE").length,
    authFailed: connectors.filter((c) => c.status === "AUTHENTICATION_FAILED").length,
    networkBlocked: connectors.filter((c) => c.status === "NETWORK_BLOCKED").length,
    byType: Array.from(byTypeMap.entries()).map(([type, count]) => ({ type: type as never, count })),
  };
}

async function assetSummary(repo: Awaited<ReturnType<typeof getRepository>>): Promise<NonNullable<DashboardStats["assets"]>> {
  const assets = await repo.allAssets();
  const byType = new Map<string, number>();
  const byTier = new Map<string, number>();
  const byRegion = new Map<string, { region: string; label: string; count: number }>();
  let nonCompliant = 0;
  let compliant = 0;
  let discovered = 0;
  let monitored = 0;
  let scannable = 0;

  for (const a of assets) {
    const type = a.assetType;
    byType.set(type, (byType.get(type) ?? 0) + 1);
    const tier = a.location.tier ?? "TIER_2";
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
    const regionKey = a.regionLabel ?? "Unknown";
    const prev = byRegion.get(regionKey) ?? { region: a.location?.region ?? "UNK", label: regionKey, count: 0 };
    prev.count += 1;
    byRegion.set(regionKey, prev);

    if (a.complianceStatus === "PASS") compliant += 1;
    else if (a.complianceStatus === "FAIL" || a.complianceStatus === "WARNING") nonCompliant += 1;

    if (a.discoveryStatus === "DISCOVERED") discovered += 1;
    else if (a.discoveryStatus === "IDENTIFIED" || a.discoveryStatus === "CONNECTABLE") monitored += 1;
    else if (a.discoveryStatus === "SCANNABLE") scannable += 1;
  }

  return {
    total: assets.length,
    byType: Array.from(byType.entries()).map(([type, count]) => ({ type: type as never, count })),
    byStatus: [
      { status: "DISCOVERED" as never, count: discovered },
      { status: "IDENTIFIED" as never, count: monitored },
      { status: "CONNECTABLE" as never, count: monitored },
      { status: "SCANNABLE" as never, count: scannable },
    ],
    byTier: Array.from(byTier.entries()).map(([tier, count]) => ({ tier: tier as never, count })),
    byRegion: Array.from(byRegion.values()),
    discovered,
    monitored,
    scannable,
    nonCompliant,
    compliant,
  };
}

async function remediationSummary(repo: Awaited<ReturnType<typeof getRepository>>): Promise<NonNullable<DashboardStats["remediation"]>> {
  const all = await repo.allRemediations();
  const planned = all.filter((r) => r.status === "PLANNED" || r.status === "VALIDATED" || r.status === "VALIDATION_FAILED").length;
  const pendingApproval = all.filter((r) => r.status === "PENDING_APPROVAL").length;
  const executed = all.filter((r) => r.execution?.status === "COMPLETED").length;
  const completed = all.filter((r) => r.status === "COMPLETED" || r.status === "VERIFYING").length;
  const verifiedPass = all.filter((r) => r.status === "VERIFIED").length;
  const verificationFail = all.filter((r) => r.status === "FAILED").length;
  const rolledBack = all.filter((r) => r.status === "ROLLED_BACK").length;
  const verificationSuccessRate =
    verifiedPass + verificationFail + rolledBack > 0 ? Math.round((verifiedPass / (verifiedPass + verificationFail + rolledBack)) * 100) : 0;
  return { planned, pendingApproval, executed, completed, verifiedPass, verificationFail, rolledBack, verificationSuccessRate };
}

async function postureSummary(repo: Awaited<ReturnType<typeof getRepository>>): Promise<AssetPostureSummary> {
  const assets = await repo.allAssets();
  const scans = await repo.allAssetScans();
  const latestByAsset = new Map<string, typeof scans[number]>();
  for (const s of scans) {
    if (!latestByAsset.has(s.assetId) || s.startedAt > latestByAsset.get(s.assetId)!.startedAt) latestByAsset.set(s.assetId, s);
  }
  let complianceSum = 0;
  let complianceCount = 0;
  const bands = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const byRegion: NonNullable<DashboardStats["globalPosture"]>["byRegion"] = [];
  const byTypeMap = new Map<string, { count: number; nonCompliant: number }>();

  for (const asset of assets) {
    if (asset.complianceScore !== undefined) {
      complianceSum += asset.complianceScore;
      complianceCount += 1;
    }
    const band = asset.riskBand;
    if (band && band in bands) bands[band as keyof typeof bands] += 1;

    const entry = byTypeMap.get(asset.assetType) ?? { count: 0, nonCompliant: 0 };
    entry.count += 1;
    if (asset.complianceStatus === "FAIL" || asset.complianceStatus === "WARNING") entry.nonCompliant += 1;
    byTypeMap.set(asset.assetType, entry);
  }

  for (const region of ENTERPRISE_REGIONS) {
    const regionAssets = assets.filter((a) => a.regionLabel === region.label);
    let sum = 0;
    let count = 0;
    for (const a of regionAssets) {
      if (a.complianceScore !== undefined) {
        sum += a.complianceScore;
        count += 1;
      }
    }
    byRegion.push({ region: region.code, label: region.label, score: count ? Math.round(sum / count) : 0, assets: regionAssets.length });
  }

  const verified = await repo.allRemediations();
  const remediationRate = verified.length ? Math.round((verified.filter((r) => r.status === "VERIFIED" || r.status === "COMPLETED").length / verified.length) * 100) : 0;
  const verificationRate = verified.length
    ? Math.round((verified.filter((r) => r.status === "VERIFIED" || r.status === "FAILED" || r.status === "ROLLED_BACK").length / verified.length) * 100)
    : 0;

  return {
    globalCompliance: complianceCount ? Math.round(complianceSum / complianceCount) : 0,
    critical: bands.CRITICAL,
    high: bands.HIGH,
    medium: bands.MEDIUM,
    low: bands.LOW,
    remediationRate,
    verificationRate,
    byRegion,
    byType: Array.from(byTypeMap.entries()).map(([type, v]) => ({ type: type as never, count: v.count, nonCompliant: v.nonCompliant })),
  };
}