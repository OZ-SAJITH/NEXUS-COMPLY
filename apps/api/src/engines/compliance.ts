import type { ComplianceControl, Finding, SecurityIntent } from "@nexus/shared-types";
import {
  isSourceRestricted,
  isLoggingEnabled,
  protocolIsInsecure,
  isEnabled,
} from "@nexus/security-intent";
import { getControls, scoreFinding } from "@nexus/compliance-rules";

export interface EvaluationContext {
  fileName: string;
}

export interface IntentAggregate {
  intents: SecurityIntent[];
  fileName: string;
}

/**
 * Helper to get the representative intent for a given intentType.
 */
export function intentsOfType(intents: SecurityIntent[], type: string): SecurityIntent[] {
  return intents.filter((i) => i.intentType === type);
}

export function firstIntentOfType(intents: SecurityIntent[], type: string): SecurityIntent | undefined {
  return intents.find((i) => i.intentType === type);
}

function evidenceHasInsecureFlag(intent: SecurityIntent): boolean {
  return intent.evidence.some((e) => /insecure/i.test(e.reason ?? ""));
}

/**
 * Deterministic evaluation of a single control against the set of intents.
 * Returns PASS, FAIL, WARNING or NOT_APPLICABLE plus evidence.
 */
function evaluateControl(
  control: ComplianceControl,
  all: SecurityIntent[]
): { status: "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE"; intents: SecurityIntent[] } {
  const intentType = control.condition.intentType as string;
  const matching = intentsOfType(all, intentType);

  if (matching.length === 0) {
    return { status: "NOT_APPLICABLE", intents: [] };
  }

  switch (control.id) {
    case "NET-SSH-001": {
      const ssh = matching.filter((i) => !i.protocol || i.protocol === "ssh");
      if (ssh.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = ssh.every((i) => isSourceRestricted(i));
      return { status: ok ? "PASS" : "FAIL", intents: ssh };
    }
    case "NET-TELNET-001": {
      const telnets = matching.filter((i) => (i.protocol ?? "") === "telnet");
      if (telnets.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const anyEnabled = telnets.some(isEnabled);
      return { status: anyEnabled ? "FAIL" : "PASS", intents: telnets };
    }
    case "NET-MGMT-002": {
      const mgmt = matching.filter((i) => !i.protocol || i.protocol === "ssh" || i.protocol === "https");
      if (mgmt.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = mgmt.every((i) => isSourceRestricted(i));
      return { status: ok ? "PASS" : "FAIL", intents: mgmt };
    }
    case "NET-LOG-003": {
      const admin = matching.filter((i) => i.intentType === "REQUIRE_LOGGING");
      if (admin.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = admin.some(isLoggingEnabled);
      return { status: ok ? "PASS" : "FAIL", intents: admin };
    }
    case "NET-SRC-004": {
      const src = matching.filter((i) => i.intentType === "RESTRICT_SOURCE_NETWORK");
      if (src.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = src.every((i) => isSourceRestricted(i));
      return { status: ok ? "PASS" : "FAIL", intents: src };
    }
    case "NET-INSEC-005": {
      const insecure = matching
        .filter(protocolIsInsecure)
        .filter((i) => (i.protocol ?? "").toLowerCase() !== "snmp")
        .filter(evidenceHasInsecureFlag);
      const anyEnabled = insecure.some(isEnabled);
      return { status: anyEnabled ? "FAIL" : "PASS", intents: insecure };
    }
    case "NET-DDENY-006": {
      const dd = matching.filter((i) => i.intentType === "DEFAULT_DENY");
      if (dd.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = dd.some((i) => i.enabled === true);
      return { status: ok ? "PASS" : "FAIL", intents: dd };
    }
    case "NET-AUTH-007": {
      const auth = matching.filter((i) => i.intentType === "REQUIRE_STRONG_AUTHENTICATION");
      if (auth.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = auth.some((i) => i.enabled === true);
      return { status: ok ? "PASS" : "FAIL", intents: auth };
    }
    case "NET-ADMEX-008": {
      const admin = matching.filter((i) => i.intentType === "RESTRICT_ADMIN_ACCESS" || i.intentType === "SECURE_MANAGEMENT_INTERFACE");
      if (admin.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const exposed = admin.some((i) => {
        if (!i.source) return true;
        if (i.source.type === "ANY") return true;
        return false;
      });
      return { status: exposed ? "FAIL" : "PASS", intents: admin };
    }
    case "NET-DENY-009": {
      const denies = matching.filter((i) => i.intentType === "DENY_UNAUTHORIZED_TRAFFIC");
      if (denies.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = denies.some((i) => i.action === "DENY");
      return { status: ok ? "PASS" : "FAIL", intents: denies };
    }
    case "NET-SEG-010": {
      const seg = matching.filter((i) => i.intentType === "NETWORK_SEGMENTATION");
      if (seg.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = seg.some((i) => i.enabled === true);
      return { status: ok ? "PASS" : "FAIL", intents: seg };
    }
    case "NET-SVC-011": {
      const dd = matching.filter((i) => i.intentType === "DEFAULT_DENY");
      return { status: dd.length ? "PASS" : "WARNING", intents: dd };
    }
    case "NET-HTTPS-012": {
      const mgmt = matching.filter((i) => i.intentType === "SECURE_MANAGEMENT_INTERFACE");
      if (mgmt.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const ok = mgmt.every((i) => !i.protocol || i.protocol === "https");
      return { status: ok ? "PASS" : "FAIL", intents: mgmt };
    }
    case "NET-SNMP-013": {
      const snmp = matching.filter((i) => (i.protocol ?? "") === "snmp");
      if (snmp.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const insecure = snmp.some((i) => i.enabled === true && evidenceHasInsecureFlag(i));
      return { status: insecure ? "FAIL" : "PASS", intents: snmp };
    }
    case "NET-TFNTP-014": {
      const tftps = matching.filter((i) => (i.protocol ?? "") === "tftp");
      if (tftps.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const anyEnabled = tftps.some(isEnabled);
      return { status: anyEnabled ? "FAIL" : "PASS", intents: tftps };
    }
    case "NET-SNMPRO-015": {
      const snmp = matching.filter((i) => (i.protocol ?? "") === "snmp");
      if (snmp.length === 0) return { status: "NOT_APPLICABLE", intents: [] };
      const insecure = snmp.some((i) => i.enabled === true && evidenceHasInsecureFlag(i));
      return { status: insecure ? "WARNING" : "PASS", intents: snmp };
    }
    default:
      return { status: "NOT_APPLICABLE", intents: matching };
  }
}

/**
 * Run all controls against the parsed intents, producing deterministic findings.
 */
export function evaluateIntents(ctx: EvaluationContext, intents: SecurityIntent[]): Finding[] {
  const controls = getControls();
  const findings: Finding[] = [];

  for (const control of controls) {
    const { status, intents: matchedIntents } = evaluateControl(control, intents);

    const evidence = matchedIntents.flatMap((i) => i.evidence).slice(0, 10);

    const finding: Finding = {
      id: `f-${control.id}-${Date.now().toString(36)}`,
      auditId: "",
      controlId: control.id,
      controlName: control.name,
      severity: control.severity,
      status,
      what: control.name,
      why: control.failureMessage,
      where: evidence.map((e) => e.file).join(", ") || ctx.fileName,
      risk: 0,
      impact: severityImpact(control.severity),
      recommendedFix: control.remediation,
      evidence: evidence.map((e) => ({
        file: e.file,
        lineStart: e.lineStart,
        lineEnd: e.lineEnd,
        snippet: e.snippet,
        reason: e.reason,
      })),
      references: { controlId: control.id, intentType: control.condition.intentType as string | undefined },
    };

    if (status === "FAIL") {
      finding.risk = scoreFinding(finding);
    } else {
      finding.risk = 0;
    }

    findings.push(finding);
  }

  return findings;
}

function severityImpact(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "Potential for full administrative compromise and lateral movement across the network.";
    case "HIGH":
      return "Unencrypted or exposed management access may be leveraged by network-based attackers.";
    case "MEDIUM":
      return "Reduced visibility or broader access than necessary increases the attack surface.";
    case "LOW":
      return "Minor hardening gap that slightly increases the attack surface.";
    default:
      return "Informational observation.";
  }
}
