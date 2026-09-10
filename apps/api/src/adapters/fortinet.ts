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

/**
 * Fortinet FortiGate Adapter
 *
 * Parses FortiOS-style configuration:
 *   - config system admin (admin-ssh, gui-http, trusted-host)
 *   - config system global (admin-sport, fw sessions)
 *   - config firewall policy (deny/allow, srcintf)
 *   - config system snmp community
 *   - logging (config log)
 *   - vdom / zones (segmentation)
 */
export class FortinetAdapter implements VendorAdapter {
  vendor = "fortinet" as const;

  parse(content: string, fileName: string): ParseResult {
    const lines = splitLines(content);
    const intents = [];
    const notes: string[] = [];

    // --- Admin access / management ---
    {
      const lineIdx = findBlockIndex(lines, /config\s+system\s+admin/i);
      if (lineIdx >= 0) {
        const block = collectBlock(lines, lineIdx);

        const sshSet = block.lines.find((l) => /set\s+.*ssh/i.test(l.text) && !/https/i.test(l.text));
        const trusted = block.lines.find((l) => /trust(ed)?-?host/i.test(l.text));

        const source: IntentSource = trusted && !isAny(extractValue(trusted.text))
          ? { type: "NETWORK", value: extractValue(trusted.text) }
          : { type: "ANY", value: "any" };

        const admin = newIntent({
          intentType: "RESTRICT_ADMIN_ACCESS",
          protocol: sshSet ? "ssh" : "https",
          source,
          destination: { type: "DEVICE", value: "management" },
          action: "ALLOW",
          loggingRequired: false,
          enabled: true,
          vendor: "fortinet",
          sourceConfigFile: fileName,
          description: "FortiGate administrative access",
        });
        addEvidence(admin, block.start + 1, block.end, block.lines.map((l) => l.text.trim()).join("; "));
        intents.push(admin);
      }

      // GUI insecure HTTP
      const guiInsecure = findBlockIndex(lines, /set\s+gui-http\b|set\s+http-https\s+disable/i);
      if (guiInsecure >= 0) {
        const http = newIntent({
          intentType: "SECURE_MANAGEMENT_INTERFACE",
          enabled: true,
          vendor: "fortinet",
          sourceConfigFile: fileName,
          description: "FortiGate web GUI using HTTP",
        });
        addEvidence(http, guiInsecure + 1, guiInsecure + 1, lines[guiInsecure]);
        intents.push(http);
      }
    }

    // --- Firewall policy (allow/deny) ---
    for (const pol of findPolicyBlocks(lines)) {
      const actionLine = pol.lines.find((l) => /^set\s+action/i.test(l.text.trim()));
      const action = actionLine ? extractValue(actionLine.text) : "accept";
      const srcaddr = pol.lines.find((l) => /^set\s+srcaddr/i.test(l.text.trim()));

      if (/deny/i.test(action)) {
        const deny = newIntent({
          intentType: "DENY_UNAUTHORIZED_TRAFFIC",
          action: "DENY",
          enabled: true,
          vendor: "fortinet",
          sourceConfigFile: fileName,
          description: "Firewall deny policy",
        });
        addEvidence(deny, pol.start + 1, pol.end, pol.lines.map((l) => l.text.trim()).join("; "));
        intents.push(deny);
      }

      // permit from unrestricted source
      if (/accept|allow/i.test(action)) {
        const srcVal = srcaddr ? extractValue(srcaddr.text) : "";
        if (isAny(srcVal)) {
          const permit = newIntent({
            intentType: "RESTRICT_SOURCE_NETWORK",
            source: { type: "ANY", value: "any" },
            enabled: true,
            vendor: "fortinet",
            sourceConfigFile: fileName,
            description: "Firewall policy permits from unrestricted source",
          });
          addEvidence(permit, pol.start + 1, pol.end, "Policy permits traffic from any source");
          intents.push(permit);
        }
      }
    }

    // --- SNMP community ---
    const snmpBlocks = findNamedBlocks(lines, /config\s+system\s+snmp\s+community/i);
    for (const block of snmpBlocks) {
      const nameLine = block.lines.find((l) => /set\s+name/i.test(l.text.trim()));
      const name = nameLine ? extractValue(nameLine.text) : "";
      const insecure = /public|private|default/i.test(name);
      const snmp = newIntent({
        intentType: "DISABLE_INSECURE_PROTOCOL",
        protocol: "snmp",
        enabled: true,
        vendor: "fortinet",
        sourceConfigFile: fileName,
        description: "SNMP community configured",
      });
      addEvidence(snmp, block.start + 1, block.end, `community ${name}${insecure ? " [insecure]" : ""}`);
      intents.push(snmp);
    }

    // --- Logging ---
    const logIdx = findBlockIndex(lines, /config\s+log/i);
    if (logIdx >= 0) {
      const log = newIntent({
        intentType: "REQUIRE_LOGGING",
        enabled: true,
        vendor: "fortinet",
        sourceConfigFile: fileName,
        description: "Logging configured",
        loggingRequired: true,
      });
      addEvidence(log, logIdx + 1, logIdx + 1, lines[logIdx]);
      intents.push(log);
    }

    // --- Default sentinel: expect firewall policy presence ---
    if (findPolicyBlocks(lines).length === 0) {
      const dd = newIntent({
        intentType: "DEFAULT_DENY",
        enabled: false,
        vendor: "fortinet",
        sourceConfigFile: fileName,
        description: "No explicit firewall policies found",
      });
      addEvidence(dd, 1, 1, "No firewall policies defined");
      intents.push(dd);
    }

    // --- VDOM segmentation ---
    const vdom = findLines(lines, /config\s+vdom\b|config\s+global\b/i).length;
    const hasPolicies = findPolicyBlocks(lines).length > 0;
    if (vdom > 0) {
      const first = findLines(lines, /config\s+vdom\b|config\s+global\b/i)[0];
      const seg = newIntent({
        intentType: "NETWORK_SEGMENTATION",
        enabled: vdom > 0 || hasPolicies,
        vendor: "fortinet",
        sourceConfigFile: fileName,
        description: `${vdom} vdom/global block(s)${hasPolicies ? " with firewall policies" : ""}`,
      });
      addEvidence(seg, first.line, first.line, `${vdom} segmentation block(s)`);
      intents.push(seg);
    }

    notes.push(`Parsed ${intents.length} security intents from Fortinet configuration`);

    return { intents, vendor: "fortinet", parseNotes: notes };
  }
}

function extractValue(text: string): string {
  const parts = text.trim().split(/\s+/);
  return parts[parts.length - 1].replace(/["']/g, "");
}

function findBlockIndex(lines: string[], headerRe: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) return i;
  }
  return -1;
}

function collectBlock(lines: string[], startIdx: number): { start: number; end: number; lines: LineRef[] } {
  const blockLines: LineRef[] = [{ line: startIdx + 1, text: lines[startIdx] }];
  let end = startIdx;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const t = lines[i];
    if (/^\s*end$/i.test(t) || /^\s*##/.test(t)) break;
    blockLines.push({ line: i + 1, text: t });
    end = i;
  }
  return { start: startIdx, end, lines: blockLines };
}

interface Block {
  start: number;
  end: number;
  lines: LineRef[];
}

function findPolicyBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/config\s+firewall\s+policy/i.test(lines[i])) {
      for (let j = i; j < lines.length; j++) {
        if (/^edit\s+\d+/i.test(lines[j].trim())) {
          const block = { start: j, end: j, lines: [{ line: j + 1, text: lines[j] }] as LineRef[] };
          for (let k = j + 1; k < lines.length; k++) {
            const t = lines[k];
            if (/^next$|^end$/.test(t.trim())) {
              block.end = k;
              break;
            }
            block.lines.push({ line: k + 1, text: t });
          }
          out.push(block);
        }
      }
      break;
    }
  }
  return out;
}

function findNamedBlocks(lines: string[], headerRe: RegExp): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      const block = { start: i, end: i, lines: [{ line: i + 1, text: lines[i] }] as LineRef[] };
      for (let k = i + 1; k < lines.length; k++) {
        const t = lines[k];
        if (/^end$|^next$/.test(t.trim())) {
          block.end = k;
          break;
        }
        block.lines.push({ line: k + 1, text: t });
      }
      out.push(block);
      i = block.end;
    }
  }
  return out;
}
