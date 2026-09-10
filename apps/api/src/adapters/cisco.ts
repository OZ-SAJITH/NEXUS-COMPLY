import type { SecurityIntent, IntentSource } from "@nexus/shared-types";
import { splitLines } from "../utils/helpers";
import { addEvidence, newIntent, type VendorAdapter, type ParseResult } from "./types";

/**
 * Cisco IOS Adapter
 *
 * Extracts security-relevant intent from IOS-style configuration:
 *   - line vty / transport input
 *   - access-class / ip access-class
 *   - service ssh / ip ssh
 *   - enable secret / password
 *   - logging
 *   - telnet detection
 *   - SNMP community strings
 *   - default-gateway / routing
 *   - ACLs for source restriction
 */
export class CiscoAdapter implements VendorAdapter {
  vendor = "cisco" as const;

  parse(content: string, fileName: string): ParseResult {
    const lines = splitLines(content);
    const intents: SecurityIntent[] = [];
    const notes: string[] = [];

    // --- SSH admin access ---
    {
      const vtySections = findLineBlocks(lines, /^line\s+vty/i);
      for (const block of vtySections) {
        const transport = block.lines.find((l) => /transport\s+input/i.test(l.text));
        const accessClass = block.lines.filter((l) => /access-class\s/i.test(l.text) || /ip\s+access-class/i.test(l.text));
        const login = block.lines.filter((l) => /^login\b/i.test(l.text) || /login\s+local/i.test(l.text));
        const usesSSH = transport && /ssh/i.test(transport.text);
        const usesTelnet = transport && /telnet/i.test(transport.text);

        const source: IntentSource = accessClass.length
          ? { type: "NETWORK", value: "restricted-by-acl" }
          : { type: "ANY", value: "any" };

        const sshIntent = newIntent({
          intentType: "RESTRICT_ADMIN_ACCESS",
          protocol: usesSSH ? "ssh" : usesTelnet ? "telnet" : undefined,
          source,
          destination: { type: "DEVICE", value: "management" },
          action: "ALLOW",
          loggingRequired: false,
          enabled: true,
          vendor: "cisco",
          sourceConfigFile: fileName,
          description: "SSH/Telnet administrative access on VTY lines",
        });
        addEvidence(sshIntent, block.start + 1, block.end, `VTY transport: ${transport?.text ?? "not set"}`);
        for (const ac of accessClass) {
          sshIntent.evidence.push({ file: fileName, lineStart: ac.line, lineEnd: ac.line, reason: ac.text.trim() });
        }
        intents.push(sshIntent);

        // Telnet insecure
        if (usesTelnet) {
          const tel = newIntent({
            intentType: "DISABLE_INSECURE_PROTOCOL",
            protocol: "telnet",
            enabled: true,
            vendor: "cisco",
            sourceConfigFile: fileName,
            description: "Telnet enabled on VTY lines",
          });
          addEvidence(tel, block.start + 1, block.end, "Telnet transport enabled without encryption");
          intents.push(tel);
          notes.push("Telnet enabled on VTY — insecure protocol");
        }

        // Login / auth
        if (login.length > 0) {
          const auth = newIntent({
            intentType: "REQUIRE_STRONG_AUTHENTICATION",
            enabled: true,
            vendor: "cisco",
            sourceConfigFile: fileName,
            description: "VTY login authentication configured",
          });
          addEvidence(auth, login[0].line, login[login.length - 1].line, login.map((l) => l.text.trim()).join("; "));
          intents.push(auth);
        }

        // Logging on vty
        const execLog = block.lines.find((l) => /logging\s+exec/i.test(l.text));
        if (execLog) {
          const log = newIntent({
            intentType: "REQUIRE_LOGGING",
            enabled: true,
            vendor: "cisco",
            sourceConfigFile: fileName,
            description: "Exec/logging on VTY",
            loggingRequired: true,
          });
          addEvidence(log, execLog.line, execLog.line, "logging exec configured");
          intents.push(log);
        }
      }
    }

    // --- Global service ssh / telnet ---
    findLines(lines, /^service\s+ssh/i).forEach((l) => {
      const sshIntent = intents.find((i) => i.protocol === "ssh" && i.intentType === "RESTRICT_ADMIN_ACCESS");
      if (sshIntent) {
        sshIntent.enabled = true;
        sshIntent.evidence.push({ file: fileName, lineStart: l.line, lineEnd: l.line, reason: "service ssh configured globally" });
      }
    });

    // --- ip ssh version / source interface ---
    findLines(lines, /^ip\s+ssh\s/i).forEach((l) => {
      const src = intents.find((i) => i.protocol === "ssh");
      if (src && /source-interface/i.test(l.text)) {
        src.evidence.push({ file: fileName, lineStart: l.line, lineEnd: l.line, reason: "ssh source interface" });
      }
    });

    findLines(lines, /^service\s+telnet/i).forEach((l) => {
      if (!intents.some((i) => i.protocol === "telnet")) {
        const tel = newIntent({
          intentType: "DISABLE_INSECURE_PROTOCOL",
          protocol: "telnet",
          enabled: true,
          vendor: "cisco",
          sourceConfigFile: fileName,
          description: "Telnet service enabled",
        });
        addEvidence(tel, l.line, l.line, "service telnet enabled");
        intents.push(tel);
      }
    });

    // --- enable secret / password (auth) ---
    findLines(lines, /^enable\s+(secret|password)/i).forEach((l) => {
      if (!intents.some((i) => i.intentType === "REQUIRE_STRONG_AUTHENTICATION")) {
        const auth = newIntent({
          intentType: "REQUIRE_STRONG_AUTHENTICATION",
          enabled: true,
          vendor: "cisco",
          sourceConfigFile: fileName,
          description: "enable secret configured",
        });
        addEvidence(auth, l.line, l.line, l.text.trim());
        intents.push(auth);
      }
    });

    // --- Global logging ---
    findLines(lines, /^logging\s+(?!exec)/i).forEach((l) => {
      if (!intents.some((i) => i.intentType === "REQUIRE_LOGGING")) {
        const log = newIntent({
          intentType: "REQUIRE_LOGGING",
          enabled: true,
          vendor: "cisco",
          sourceConfigFile: fileName,
          description: "Logging configured",
          loggingRequired: true,
        });
        addEvidence(log, l.line, l.line, l.text.trim());
        intents.push(log);
      }
    });

    // --- SNMP community ---
    findLines(lines, /^snmp-server\s+community/i).forEach((l) => {
      const ro = /ro\b/i.test(l.text);
      const community = l.text.match(/community\s+(\S+)/i);
      const value = community ? community[1] : "";
      const insecure = /public|private/i.test(value) || !ro;
      const snmpIntent = newIntent({
        intentType: "DISABLE_INSECURE_PROTOCOL",
        protocol: "snmp",
        enabled: true,
        vendor: "cisco",
        sourceConfigFile: fileName,
        description: "SNMP community configured",
      });
      addEvidence(snmpIntent, l.line, l.line, `${l.text.trim()}${insecure ? " [insecure community]" : ""}`);
      intents.push(snmpIntent);
    });

    // --- ACLs (source restriction evidence) ---
    findLines(lines, /^(ip\s+)?access-list/i).forEach((l) => {
      if (/permit\s+(any|host)/i.test(l.text) || /(deny\s+any)/i.test(l.text)) {
        const seg = newIntent({
          intentType: "DENY_UNAUTHORIZED_TRAFFIC",
          action: /deny/i.test(l.text) ? "DENY" : "ALLOW",
          enabled: true,
          vendor: "cisco",
          sourceConfigFile: fileName,
          description: "Access-list entry",
        });
        addEvidence(seg, l.line, l.line, l.text.trim());
        intents.push(seg);
      }
    });

    // --- Default deny (last line of database / static default) ---
    const hasImplicitDeny = findLines(lines, /(deny\s+ip\s+any)/i).length > 0;
    const hasGlobalDefault = findLines(lines, /(default\s+deny|deny\s+any)/i).length > 0;
    if (hasImplicitDeny || hasGlobalDefault) {
      const dd = newIntent({
        intentType: "DEFAULT_DENY",
        enabled: true,
        vendor: "cisco",
        sourceConfigFile: fileName,
        description: "Implicit/explicit deny present",
      });
      const match = (hasImplicitDeny ? findLines(lines, /deny\s+ip\s+any/i) : findLines(lines, /deny\s+any/i))[0];
      addEvidence(dd, match.line, match.line, match.text.trim());
      intents.push(dd);
    }

    // --- Management interface expose (http server) ---
    findLines(lines, /^ip\s+http\s+server\s*(!?\s*secure)?/i).forEach((l) => {
      const mgmt = newIntent({
        intentType: "SECURE_MANAGEMENT_INTERFACE",
        enabled: true,
        vendor: "cisco",
        sourceConfigFile: fileName,
        description: "HTTP/HTTPS management server",
      });
      addEvidence(mgmt, l.line, l.line, l.text.trim());
      intents.push(mgmt);
    });

    // --- Interfaces (segmentation signal) ---
    const ifaceCount = findLines(lines, /^interface\b/i).length;
    if (ifaceCount > 0) {
      const first = findLines(lines, /^interface\b/i)[0];
      const seg = newIntent({
        intentType: "NETWORK_SEGMENTATION",
        enabled: ifaceCount > 1,
        vendor: "cisco",
        sourceConfigFile: fileName,
        description: `Interfaces detected (${ifaceCount})`,
      });
      addEvidence(seg, first.line, first.line, `${ifaceCount} interface(s) configured`);
      intents.push(seg);
    }

    notes.push(`Parsed ${intents.length} security intents from Cisco IOS configuration`);

    return { intents, vendor: "cisco", parseNotes: notes };
  }
}

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

interface Block {
  start: number;
  end: number;
  lines: LineRef[];
  header: string;
}

function findLineBlocks(lines: string[], headerRe: RegExp): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  lines.forEach((text, idx) => {
    const lineNo = idx + 1;
    if (headerRe.test(text)) {
      current = { start: idx, end: idx, lines: [{ line: lineNo, text }], header: text };
      blocks.push(current);
    } else if (current) {
      const isNewTopLevel = /^(interface|line|router|snmp-server|logging|enable|service|ip\s+http|ip\s+ssh|access-list)/i.test(text);
      const trimmedClose = text.trim();
      const isClosing = trimmedClose === "!" || trimmedClose === "exit" || trimmedClose === "end";
      if (isNewTopLevel && !/^\s/.test(text) && current.lines.length > 1) {
        current.end = idx - 1;
        current = null;
      } else if (isClosing) {
        current.end = idx;
        current = null;
      } else {
        current.lines.push({ line: lineNo, text });
        current.end = idx;
      }
    }
  });
  return blocks;
}
