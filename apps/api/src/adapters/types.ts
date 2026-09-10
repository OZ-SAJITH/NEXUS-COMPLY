import type { SecurityIntent, VendorId } from "@nexus/shared-types";
import { uniqueId } from "../utils/helpers";

export interface ParseResult {
  intents: SecurityIntent[];
  vendor: VendorId;
  parseNotes: string[];
}

export interface VendorAdapter {
  vendor: VendorId;
  parse(content: string, fileName: string): ParseResult;
}

/**
 * Small helper to append evidence to an intent.
 */
export function addEvidence(intent: SecurityIntent, lineStart: number, lineEnd: number, reason?: string): void {
  intent.evidence.push({
    file: intent.sourceConfigFile,
    lineStart,
    lineEnd,
    reason,
  });
}

export function newIntent(partial: Partial<SecurityIntent> & Pick<SecurityIntent, "intentType">): SecurityIntent {
  return {
    id: uniqueId("intent"),
    intentType: partial.intentType,
    protocol: partial.protocol,
    source: partial.source,
    destination: partial.destination,
    action: partial.action ?? "ALLOW",
    loggingRequired: partial.loggingRequired ?? false,
    authMethod: partial.authMethod,
    enabled: partial.enabled ?? true,
    vendor: partial.vendor ?? "unknown",
    sourceConfigFile: partial.sourceConfigFile ?? "",
    evidence: partial.evidence ?? [],
    description: partial.description,
  };
}
