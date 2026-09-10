import type {
  AuditRecord,
  ConfigurationRecord,
  SecurityIntent,
  AiInterpretation,
  Severity,
} from "@nexus/shared-types";
import {
  CONTROLS,
  buildRiskAssessment,
  summarizeCompliance,
} from "@nexus/compliance-rules";
import { detectVendor, splitLines, extractSnippet, fingerprintSyntax, uniqueId, isInternetExposed } from "../utils/helpers";
import { getIdapter } from "../adapters";
import { redactSecrets, countRedactions } from "../utils/redact";
import { evaluateIntents, EvaluationContext } from "../engines/compliance";
import { getRepository } from "../storage/jsonRepo";
import { AiClient, type InterpretResponse } from "../services/aiClient";
import { registerFindingsForReview } from "../services/reviewService";

export interface AuditInput {
  fileName: string;
  content: string;
  redacted?: boolean;
  aiOverrides?: AiInterpretation[];
}

export interface RunAuditResult {
  configuration: ConfigurationRecord;
  audit: AuditRecord;
  newAiInterpretations: AiInterpretation[];
  usedApprovedMapping: boolean;
}

/**
 * Application of an approved mapping (or approved AI interpretation) to the
 * candidate intents: this lets us reuse a learned mapping for unknown syntax.
 */
function applyMappingToIntent(intent: SecurityIntent, map: {
  securityIntent: SecurityIntent["intentType"];
  protocol?: string;
  sourceRestriction?: boolean;
  loggingEnabled?: boolean;
}): SecurityIntent {
  const updated = { ...intent };
  updated.intentType = map.securityIntent;
  if (map.protocol) updated.protocol = map.protocol;
  if (map.sourceRestriction) {
    if (!updated.source || updated.source.type === "ANY") {
      updated.source = { type: "NETWORK", value: "10.0.0.0/24" };
    }
  } else if (updated.source && updated.source.type === "NETWORK" && /restricted/.test(updated.source.value)) {
    updated.source = { type: "ANY", value: "any" };
  }
  if (map.loggingEnabled !== undefined) updated.loggingRequired = map.loggingEnabled;
  return updated;
}

export async function runAudit(input: AuditInput): Promise<RunAuditResult> {
  const repo = getRepository();

  // ---- 1. Vendor detection ----
  const detection = detectVendor(input.content);

  // ---- 2. Redact secrets ----
  const redactedContent = input.redacted ? input.content : redactSecrets(input.content);
  const redactionCount = input.redacted ? 0 : countRedactions(input.content, redactedContent);

  // ---- 3. Build configuration record ----
  const configuration: ConfigurationRecord = {
    id: uniqueId("cfg"),
    name: input.fileName,
    content: input.content,
    fileType: input.fileName.split(".").pop() ?? "conf",
    sizeBytes: Buffer.byteLength(input.content, "utf-8"),
    vendor: detection.vendor,
    vendorStatus: detection.status,
    detectedBy: detection.detectedBy,
    uploadedAt: new Date().toISOString(),
    redacted: redactionCount > 0,
  };
  await repo.saveConfiguration(configuration);

  const syntaxFingerprint = fingerprintSyntax(input.content);

  // ---- 4. Parse via vendor adapter or adaptive path ----
  let intents: SecurityIntent[];
  let aiInterpretations: AiInterpretation[] = [];
  let usedApprovedMapping = false;
  const parseNotes: string[] = [];

  const adapter = getIdapter(detection.vendor);

  if (detection.status === "known") {
    const parsed = adapter.parse(input.content, input.fileName);
    intents = parsed.intents;
    parseNotes.push(...parsed.parseNotes);
  } else {
    // Unknown configuration -> adaptive path
    intents = buildFallbackIntents(input.content, input.fileName);

    // Check for reusable approved mapping by syntax fingerprint
    const existingMapping = await repo.getMappingByFingerprint(syntaxFingerprint);

    if (input.aiOverrides && input.aiOverrides.length > 0) {
      // Approve/apply explicit AI interpretations (from a prior flow)
      for (const ai of input.aiOverrides) {
        const base = buildFallbackIntentForAi(ai, input.content, input.fileName);
        const applied = applyMappingToIntent(base, ai);
        intents.push(applied);
        aiInterpretations.push(ai);
      }
      // if any approved, mark as used
      if (input.aiOverrides.some((a) => a.status === "APPROVED")) {
        usedApprovedMapping = true;
      }
    } else if (existingMapping) {
      // Reuse the learned mapping
      const base = buildFallbackIntent(input.content, input.fileName);
      const applied = applyMappingToIntent(base, existingMapping);
      intents.push(applied);
      usedApprovedMapping = true;
      parseNotes.push("Reused previously approved mapping for matching custom syntax.");
    } else {
      // Fresh unknown -> generate candidate AI interpretation
      const aiClient = new AiClient();
      const response = await aiClient.interpret({
        configName: input.fileName,
        redactedConfig: redactedContent,
        vendor: "unknown",
        syntaxFingerprint,
      });
      const ai = responseToInterpretation(response, configuration.id, syntaxFingerprint, "PENDING");
      aiInterpretations.push(ai);
      // Build a best-effort candidate intent from AI (non-authoritative until approved)
      const candidate = buildFallbackIntentForAi(ai, input.content, input.fileName);
      intents.push(candidate);
      parseNotes.push("Unknown configuration — generated candidate AI interpretation (pending approval).");
    }
  }

  // ---- 5. Evaluate compliance ----
  const ctx: EvaluationContext = { fileName: input.fileName };
  const findings = evaluateIntents(ctx, intents);

  // Assign auditId to findings
  for (const f of findings) f.auditId = "";

  // ---- 6. Risk ----
  const risk = buildRiskAssessment("pending", findings);
  const compliance = summarizeCompliance(findings);

  // ---- 7. Build audit record ----
  const auditId = uniqueId("audit");
  for (const f of findings) f.auditId = auditId;

  const audit: AuditRecord = {
    id: auditId,
    configurationId: configuration.id,
    configurationName: input.fileName,
    vendor: detection.vendor,
    vendorStatus: detection.status,
    status: "COMPLETED",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    intents,
    findings,
    risk,
    compliance,
    aiInterpretations,
  };

  risk.auditId = auditId;
  risk.id = `risk-${auditId}`;
  audit.risk = risk;

  await repo.saveAudit(audit);

  // Every AI/engine-generated FAIL or WARNING finding enters the Human Review Queue.
  await registerFindingsForReview(audit);

  return { configuration, audit, newAiInterpretations: aiInterpretations, usedApprovedMapping };
}

/**
 * Construct deterministic audit per-demo from a single unknown/custom config
 * whose adaptive interpretation is intentionally flagged.
 */
function buildFallbackIntents(content: string, fileName: string): SecurityIntent[] {
  const i = newIntentLocal("RESTRICT_ADMIN_ACCESS", fileName, content);
  return [i];
}

function buildFallbackIntent(content: string, fileName: string): SecurityIntent {
  return newIntentLocal("RESTRICT_ADMIN_ACCESS", fileName, content);
}

function buildFallbackIntentForAi(ai: AiInterpretation, content: string, fileName: string): SecurityIntent {
  const lines = splitLines(content);
  const evidence = ai.evidence.map((e) => ({
    file: fileName,
    lineStart: e.lineStart,
    lineEnd: e.lineEnd,
    reason: e.reason,
    snippet: extractSnippet(lines, e.lineStart, e.lineEnd),
  }));
  return {
    id: uniqueId("intent"),
    intentType: ai.securityIntent,
    protocol: ai.protocol,
    source: ai.sourceRestriction
      ? { type: "NETWORK", value: "restricted" }
      : { type: "ANY", value: "any" },
    destination: { type: "DEVICE", value: "management" },
    action: "ALLOW",
    loggingRequired: ai.loggingEnabled,
    enabled: true,
    vendor: "unknown",
    sourceConfigFile: fileName,
    evidence,
    description: `Candidate intent from AI interpretation (confidence ${Math.round(ai.confidence * 100)}%)`,
  };
}

function newIntentLocal(intentType: SecurityIntent["intentType"], fileName: string, content: string): SecurityIntent {
  const lines = splitLines(content);
  const evidence = lines
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => /admin|ssh|remote|management|source|login/i.test(l))
    .slice(0, 4)
    .map(({ l, idx }) => ({
      file: fileName,
      lineStart: idx + 1,
      lineEnd: idx + 1,
      reason: l.trim().slice(0, 120),
      snippet: l,
    }));

  return {
    id: uniqueId("intent"),
    intentType,
    protocol: "ssh",
    source: { type: "ANY", value: "any" },
    destination: { type: "DEVICE", value: "management" },
    action: "ALLOW",
    loggingRequired: false,
    enabled: true,
    vendor: "unknown",
    sourceConfigFile: fileName,
    evidence: evidence.length ? evidence : [{ file: fileName, lineStart: 1, lineEnd: 1, reason: "Administrative access statement" }],
    description: "Candidate intent derived from unknown configuration syntax",
  };
}

function responseToInterpretation(
  r: InterpretResponse,
  sourceConfigId: string,
  fingerprint: string,
  status: "PENDING" | "APPROVED" | "REJECTED"
): AiInterpretation {
  return {
    id: uniqueId("ai"),
    sourceConfigId,
    syntaxFingerprint: fingerprint,
    detectedConcept: r.detectedConcept,
    securityIntent: r.securityIntent,
    protocol: r.protocol,
    sourceRestriction: r.sourceRestriction,
    loggingEnabled: r.loggingEnabled,
    confidence: r.confidence,
    evidence: r.evidence,
    suggestedRemediation: r.suggestedRemediation,
    provider: r.provider === "mock" ? "mock" : "live",
    status,
    createdAt: new Date().toISOString(),
  };
}

export function getControls() {
  return CONTROLS;
}

export function exposureDescriptor(intents: SecurityIntent[]): string {
  const admin = intents.filter((i) => i.intentType === "RESTRICT_ADMIN_ACCESS" || i.intentType === "SECURE_MANAGEMENT_INTERFACE");
  if (admin.length === 0) return "internal";
  if (admin.some((i) => isInternetExposed(i.source))) return "internet";
  if (admin.some((i) => !i.source || i.source.type === "ANY")) return "any";
  return "restricted";
}

export function overallRiskBand(score: number): Severity {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "INFO";
}
