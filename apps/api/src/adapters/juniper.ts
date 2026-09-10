import type { IntentSource } from "@nexus/shared-types";
import { isAny, splitLines } from "../utils/helpers";
import { addEvidence, newIntent, type VendorAdapter, type ParseResult } from "./types";

interface LineRef {
  line: number;
  text: string;
}

function findLines(lines: string[], re: RegExp): LineRef[] {
  const out: LineRef[] = [];
  lines.forEach((text, idx) => {
    if (re.test(text)) out.push({ line: idx + 1, text });
  });
  return out;
}

function findFirstLine(lines: string[], re: RegExp): LineRef | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return { line: i + 1, text: lines[i] };
  }
  return undefined;
}

/**
 * Juniper Junos Adapter
 *
 * Handles both `set`-style and hierarchical `{ ... }` configuration.
 *   - system services ssh / telnet
 *   - system root-authentication
 *   - security zones (segmentation)
 *   - system syslog / logging
 *   - firewall filter / security policies (default deny)
 *   - source-address restriction (source-address in management)
 */
export class JuniperAdapter implements VendorAdapter {
  vendor = "juniper" as const;

  parse(content: string, fileName: string): ParseResult {
    const lines = splitLines(content);
    const intents = [];
    const notes: string[] = [];
    const isSetStyle = /^\s*set\s+/i.test(lines.find((l) => /\S/.test(l)) ?? "");

    // --- SSH service ---
    const sshLine = findFirstLine(lines, /^\s*set\s+system\s+services\s+ssh\b/i) ??
      findFirstLine(lines, /services\s*\{\s*\n?\s*ssh\b/i) ??
      findFirstLine(lines, /^\s*ssh\b/i);
    const telnetLine = findFirstLine(lines, /^\s*set\s+system\s+services\s+telnet\b/i) ??
      findFirstLine(lines, /^\s*telnet\b/i);

    // Source restriction
    const sourceRestrictLine = findFirstLine(lines, /source-address\s+\S+/i);
    const source: IntentSource = sourceRestrictLine && !isAny(sourceRestrictLine.text.split(/\s+/).pop())
      ? { type: "NETWORK", value: sourceRestrictLine.text.split(/\s+/).pop() ?? "restricted" }
      : { type: "ANY", value: "any" };

    if (sshLine) {
      const admin = newIntent({
        intentType: "RESTRICT_ADMIN_ACCESS",
        protocol: "ssh",
        source,
        destination: { type: "DEVICE", value: "management" },
        action: "ALLOW",
        loggingRequired: false,
        enabled: true,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: "Junos SSH administrative access",
      });
      addEvidence(admin, sshLine.line, sshLine.line, sshLine.text.trim());
      if (sourceRestrictLine) {
        admin.evidence.push({ file: fileName, lineStart: sourceRestrictLine.line, lineEnd: sourceRestrictLine.line, reason: sourceRestrictLine.text.trim() });
      }
      intents.push(admin);
    }

    if (telnetLine) {
      const tel = newIntent({
        intentType: "DISABLE_INSECURE_PROTOCOL",
        protocol: "telnet",
        enabled: true,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: "Junos Telnet enabled",
      });
      addEvidence(tel, telnetLine.line, telnetLine.line, telnetLine.text.trim());
      intents.push(tel);
    }

    // --- Root authentication ---
    const rootAuth = findFirstLine(lines, /root-authentication\b|authentication-key\s+"/i);
    if (rootAuth) {
      const auth = newIntent({
        intentType: "REQUIRE_STRONG_AUTHENTICATION",
        enabled: true,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: "Root authentication configured",
      });
      addEvidence(auth, rootAuth.line, rootAuth.line, rootAuth.text.trim());
      intents.push(auth);
    }

    // --- Logging ---
    const syslog = findFirstLine(lines, /^\s*set\s+system\s+syslog\b/i) ??
      findFirstLine(lines, /syslog\s*\{/i) ??
      findFirstLine(lines, /logging\b/i);
    if (syslog) {
      const log = newIntent({
        intentType: "REQUIRE_LOGGING",
        enabled: true,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: "Syslog/logging configured",
        loggingRequired: true,
      });
      addEvidence(log, syslog.line, syslog.line, syslog.text.trim());
      intents.push(log);
    }

    // --- Security zones (segmentation) ---
    const zoneLines = findLines(lines, /^\s*(set\s+)?security\s+.*s?zone\b/i);
    const zoneCount = zoneLines.length;
    if (zoneCount > 0) {
      const seg = newIntent({
        intentType: "NETWORK_SEGMENTATION",
        enabled: zoneCount > 1,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: `${zoneCount} security zone(s) detected`,
      });
      addEvidence(seg, zoneLines[0].line, zoneLines[0].line, zoneLines[0].text.trim());
      intents.push(seg);
    }

    // --- Default deny / security policy ---
    const hasPolicy = findFirstLine(lines, /from-zone|to-zone|policy\s+\S+\s*\{/i);
    const explicitDeny = findFirstLine(lines, /then\s+deny|permit\s+any|default-policy\s+deny/i);
    const defaultDeny = findFirstLine(lines, /default-policy\s+deny\b|then\s+deny\b/i);
    if (hasPolicy || defaultDeny) {
      const dd = newIntent({
        intentType: "DEFAULT_DENY",
        enabled: hasPolicy ? true : !!defaultDeny,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: "Security policy configured",
      });
      const ev = defaultDeny ?? hasPolicy ?? explicitDeny;
      if (ev) addEvidence(dd, ev.line, ev.line, ev.text.trim());
      intents.push(dd);
    }

    // --- SNMP ---
    const snmp = findFirstLine(lines, /^\s*(set\s+)?snmp\b/i);
    if (snmp) {
      const community = findFirstLine(lines, /community\s+\S+/i);
      const letInsecure = community && /public|private/i.test(community.text);
      const snmpIntent = newIntent({
        intentType: "DISABLE_INSECURE_PROTOCOL",
        protocol: "snmp",
        enabled: true,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: "SNMP configured",
      });
      addEvidence(snmpIntent, snmp.line, snmp.line, snmp.text.trim());
      if (community) snmpIntent.evidence.push({ file: fileName, lineStart: community.line, lineEnd: community.line, reason: community.text.trim() + (letInsecure ? " [insecure community]" : "") });
      intents.push(snmpIntent);
    }

    // --- Management via HTTP (web) ---
    const webMgmt = findLines(lines, /http\b.*management|web-management|service\s+http/i);
    const httpsMgmt = findLines(lines, /https\b|service\s+https/i);
    if (webMgmt.length > 0 || httpsMgmt.length > 0) {
      const line = webMgmt[0] ?? httpsMgmt[0];
      const mgmt = newIntent({
        intentType: "SECURE_MANAGEMENT_INTERFACE",
        enabled: true,
        vendor: "juniper",
        sourceConfigFile: fileName,
        description: "Web management configured",
      });
      addEvidence(mgmt, line.line, line.line, line.text.trim());
      intents.push(mgmt);
    }

    notes.push(`Parsed ${intents.length} security intents from Juniper Junos configuration (set-style: ${isSetStyle})`);

    return { intents, vendor: "juniper", parseNotes: notes };
  }
}
