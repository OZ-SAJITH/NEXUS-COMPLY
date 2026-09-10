import type {
  AiInterpretation,
  AuditRecord,
  ComplianceControl,
  SecurityIntent,
  SecurityIntentType,
  Severity,
  VendorId,
  VendorStatus,
} from "@nexus/shared-types";

// ---------------------------------------------------------------------------
// Demo control catalog (mirrors the live @nexus/compliance-rules catalog)
// ---------------------------------------------------------------------------
export interface DemoControl extends ComplianceControl {
  id: string;
  name: string;
  description?: string;
  frameworks: ComplianceControl["frameworks"];
  severity: Severity;
  remediation: string;
}

export const DEMO_CONTROLS: DemoControl[] = [
  { id: "NET-SSH-001", name: "Restrict SSH Administrative Access", description: "SSH management access must be restricted to approved administrative networks.", frameworks: ["CIS", "NIST"], severity: "HIGH", condition: {}, failureMessage: "", remediation: "Restrict SSH access to trusted administrative networks (e.g. 10.0.0.0/24)." },
  { id: "NET-TELNET-001", name: "Telnet Disabled", description: "Insecure Telnet must not be enabled for device access.", frameworks: ["CIS", "NIST"], severity: "CRITICAL", condition: {}, failureMessage: "", remediation: "Disable Telnet and use SSH for all device management." },
  { id: "NET-MGMT-002", name: "Management Access Restriction", description: "Management interfaces must not be exposed to the internet or unrestricted networks.", frameworks: ["CIS", "NIST"], severity: "HIGH", condition: {}, failureMessage: "", remediation: "Bind management interfaces to private networks and restrict source addresses." },
  { id: "NET-LOG-003", name: "Logging Enabled", description: "Security-relevant events must be logged.", frameworks: ["CIS", "NIST", "STIG"], severity: "MEDIUM", condition: {}, failureMessage: "", remediation: "Enable logging for administrative access and security events." },
  { id: "NET-SRC-004", name: "Source Network Restriction", description: "Traffic sources must be restricted to approved networks.", frameworks: ["CIS", "NIST"], severity: "MEDIUM", condition: {}, failureMessage: "", remediation: "Restrict permitted source networks to approved ranges." },
  { id: "NET-INSEC-005", name: "Insecure Protocol Detection", description: "Insecure protocols must be disabled where secure alternatives exist.", frameworks: ["CIS"], severity: "HIGH", condition: {}, failureMessage: "", remediation: "Replace insecure protocols with encrypted equivalents." },
  { id: "NET-DDENY-006", name: "Default Deny", description: "Traffic should be denied by default unless explicitly permitted.", frameworks: ["CIS", "NIST"], severity: "HIGH", condition: {}, failureMessage: "", remediation: "Apply a default-deny policy and explicitly permit only required traffic." },
  { id: "NET-AUTH-007", name: "Require Strong Authentication", description: "Device access must require strong (non-plaintext) authentication.", frameworks: ["CIS", "NIST", "STIG"], severity: "HIGH", condition: {}, failureMessage: "", remediation: "Enforce strong, encrypted authentication for all device access." },
  { id: "NET-ADMEX-008", name: "Administrative Exposure", description: "Administrative services must not be reachable from the internet.", frameworks: ["CIS", "NIST"], severity: "CRITICAL", condition: {}, failureMessage: "", remediation: "Place management services behind the firewall on a private network." },
  { id: "NET-DENY-009", name: "Deny Unauthorized Traffic", description: "Unauthorized or default-permit traffic must be explicitly denied.", frameworks: ["CIS"], severity: "MEDIUM", condition: {}, failureMessage: "", remediation: "Add explicit deny rules for unauthorized traffic." },
  { id: "NET-SEG-010", name: "Network Segmentation", description: "Security zones must be segmented to limit lateral movement.", frameworks: ["CIS", "NIST"], severity: "MEDIUM", condition: {}, failureMessage: "", remediation: "Segment networks into zones and enforce allow-only between them." },
  { id: "NET-SVC-011", name: "Unnecessary Services Disabled", description: "Unnecessary network services must be disabled to reduce attack surface.", frameworks: ["CIS", "NIST"], severity: "LOW", condition: {}, failureMessage: "", remediation: "Disable non-essential services on the device." },
  { id: "NET-HTTPS-012", name: "Secure Management Web Interface", description: "Web management interface must use HTTPS, not plain HTTP.", frameworks: ["CIS"], severity: "MEDIUM", condition: {}, failureMessage: "", remediation: "Enable HTTPS for the management web interface." },
  { id: "NET-SNMP-013", name: "SNMP Community Restriction", description: "SNMP must not be enabled with default or public community strings.", frameworks: ["CIS", "NIST"], severity: "MEDIUM", condition: {}, failureMessage: "", remediation: "Disable SNMP or restrict it using strong community strings and source ACLs." },
  { id: "NET-TFNTP-014", name: "TFTP Disabled", description: "Insecure TFTP should not be enabled.", frameworks: ["CIS"], severity: "LOW", condition: {}, failureMessage: "", remediation: "Disable TFTP." },
  { id: "NET-SNMPRO-015", name: "SNMP Traps Secure", description: "SNMP traps should use SNMPv3 or be restricted.", frameworks: ["CIS"], severity: "LOW", condition: {}, failureMessage: "", remediation: "Use SNMPv3 or restrict trap destinations." },
];

export const DEMO_CONTROL_BY_ID: Record<string, DemoControl> = Object.fromEntries(DEMO_CONTROLS.map((c) => [c.id, c]));

export const CONTROL_INTENT: Record<string, SecurityIntentType> = {
  "NET-SSH-001": "RESTRICT_ADMIN_ACCESS",
  "NET-TELNET-001": "DISABLE_INSECURE_PROTOCOL",
  "NET-MGMT-002": "SECURE_MANAGEMENT_INTERFACE",
  "NET-LOG-003": "REQUIRE_LOGGING",
  "NET-SRC-004": "RESTRICT_SOURCE_NETWORK",
  "NET-INSEC-005": "DISABLE_INSECURE_PROTOCOL",
  "NET-DDENY-006": "DEFAULT_DENY",
  "NET-AUTH-007": "REQUIRE_STRONG_AUTHENTICATION",
  "NET-ADMEX-008": "RESTRICT_ADMIN_ACCESS",
  "NET-DENY-009": "DENY_UNAUTHORIZED_TRAFFIC",
  "NET-SEG-010": "NETWORK_SEGMENTATION",
  "NET-SVC-011": "DEFAULT_DENY",
  "NET-HTTPS-012": "SECURE_MANAGEMENT_INTERFACE",
  "NET-SNMP-013": "DISABLE_INSECURE_PROTOCOL",
  "NET-TFNTP-014": "DISABLE_INSECURE_PROTOCOL",
  "NET-SNMPRO-015": "DISABLE_INSECURE_PROTOCOL",
};

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------
export function uniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function hashNum(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function detectVendor(content: string): { vendor: VendorId; status: VendorStatus; detectedBy: string; confidence: number } {
  const rules: Array<{ vendor: VendorId; label: string; markers: RegExp[] }> = [
    { vendor: "cisco", label: "Cisco IOS", markers: [/\bhostname\s+\S+/i, /\benable\s+secret/i, /\binterface\s+[a-z]+[0-9\/]/i, /^router\s+/im, /\bip\s+access-list/i] },
    { vendor: "fortinet", label: "Fortinet FortiGate", markers: [/\bconfig\s+system\s+(global|admin)\b/i, /\bconfig\s+firewall\s+policy\b/i, /\bset\s+admin-ssh\b/i, /\bset\s+gui-http\b/i] },
    { vendor: "juniper", label: "Juniper Junos", markers: [/\bset\s+\S+\s+system\s+login\b/i, /^set\s+interfaces\s/im, /\bset\s+security\s+[a-z]/i, /\broot-authentication\b/i] },
  ];
  let best: { vendor: VendorId; weight: number; by: string } = { vendor: "unknown", weight: 0, by: "No recognized vendor syntax" };
  for (const r of rules) {
    let hits = 0;
    for (const m of r.markers) if (m.test(content)) hits += 1;
    const weight = hits * 3;
    if (weight > best.weight) best = { vendor: r.vendor, weight, by: `Matched ${r.label} syntax (${hits} markers)` };
  }
  if (best.vendor === "unknown") return { vendor: "unknown", status: "unknown", detectedBy: best.by, confidence: 0.5 };
  return { vendor: best.vendor, status: "known", detectedBy: best.by, confidence: Math.min(0.99, 0.5 + best.weight / 20) };
}

export function isInsecureContent(content: string): boolean {
  return /telnet\b/i.test(content) || /(0\.0\.0\.0|any|all|unrestricted)/i.test(content) || /no\s+logging/i.test(content) || /(snmp.*(public|private))/i.test(content);
}

export function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

// ---------------------------------------------------------------------------
// Scenario profiles
// ---------------------------------------------------------------------------
export interface ScenarioProfile {
  id: string;
  vendor: VendorId;
  status: VendorStatus;
  label: string;
  content: string;
  insecure: boolean;
  controls: Array<{ id: string; status: "PASS" | "FAIL" | "WARNING" }>;
}

const CISCO_SECURE = `hostname edge-rtr-01
enable secret 9 $9$K3nZxvKl04qEh/U4kUwWfJnhS7myn/MBvl7ClwGlj8
!
interface Gi0/0
 description uplink-to-mpls
ip access-group 101 in
ip access-list extended 101
 permit tcp 10.0.0.0 0.0.0.255 any eq 22
 deny ip any any log
!
line vty 0 4
 transport input ssh
 access-class 10 in
ip ssh version 2
logging host 10.0.0.20
logging trap informational
no service telnet
snmp-server community nexus!RO 10.0.0.30
no ip http server
ip http secure-server`;

const CISCO_INSECURE = `hostname exposed-rtr-02
enable secret 9 $9$Qz9dLpTxKz1rEu/Osse0VeQ2hFwE/KfXnO9nYcE4RtY
!
interface Gi0/0
 description internet-facing-management
ip access-group 100 in
ip access-list extended 100
 permit tcp any any eq 22
 permit tcp any any eq 23
 permit ip any any
!
line vty 0 4
 transport input telnet ssh
 no access-class
transport input all
ip ssh version 1
no logging host
no logging trap
snmp-server community public RW
ip http server
ip tftp source-interface`;
const FORTINET_SECURE = `config system global
 set admin-sport 8443
 set admin-ssh enable
 set gui-httpsonly enable
end
config system admin
 set remote-auth enable
 set auth-timeout 15
end
config firewall address
 edit "mgmt-net"
  set subnet 10.0.0.0 255.255.255.0
 next
end
config firewall policy
 edit 1
  set srcintf "trust"
  set dstintf "wan"
  set srcaddr "mgmt-net"
  set dstaddr "all"
  set action accept
  set nat enable
 next
 edit 2
  set srcintf "any"
  set dstintf "any"
  set srcaddr "all"
  set dstaddr "all"
  set action deny
 next
end
config log syslogd setting
 set status enable
 set server "10.0.0.20"
end`;
const FORTINET_INSECURE = `config system global
 set admin-ssh disable
 set gui-http enable
end
config system admin
 set remote-auth disable
 set trusthost 0.0.0.0 0.0.0.0
end
config firewall address
 edit "all-src"
  set subnet 0.0.0.0 0.0.0.0
 next
end
config firewall policy
 edit 1
  set srcintf "any"
  set dstintf "any"
  set srcaddr "all"
  set dstaddr "all"
  set action accept
 next
end
config system snmp community
 edit "public"
  set events vpn cpu mem
 next
end`;
const JUNIPER_SECURE = `system {
    host-name mgmt-sw-01;
    root-authentication {
        encrypted-password "$6$w8nXc2qD$8mz4TkVu7aPQs3dEybWJfCo1HgRlSnKpZuBxYc9wNeM";
    }
    services {
        ssh {
            root-login deny;
        }
    }
    login {
        user operator {
            class operator;
            authentication {
                encrypted-password "$6$d2MfGh7K$oLq0Srn9VuAdBz5TyWErIkPq1HnMjZfX8CxeYd3RbG";
            }
        }
    }
    syslog {
        host 10.0.0.20 {
            any notice;
        }
    }
}
set interfaces vlan unit 0 family inet address 10.0.1.2/24
set security zones security-zone trust screen untrust-screen
set security policies from-zone trust to-zone untrust policy allow-mgmt match source-address 10.0.0.0/24
set security policies from-zone trust to-zone untrust policy allow-mgmt then permit`;
const JUNIPER_INSECURE = `system {
    host-name mgmt-sw-02;
    root-authentication {
        plain-text-password "secret123";
    }
    services {
        telnet {
        }
        ssh {
            root-login allow;
        }
    }
    login {
        user admin {
            class super-user;
            authentication {
                plain-text-password "admin123";
            }
        }
    }
}
set interfaces vlan unit 0 family inet address 0.0.0.0/0
set security zones security-zone untrust screen untrust-screen
set security policies from-zone untrust to-zone trust policy allow-all match source-address any
set security policies from-zone untrust to-zone trust policy allow-all then permit`;
const UNKNOWN_CUSTOM = `CLOUDEDGE-SDN v6.2.0 build 2189
fabric-id nexus-fab-1
node-type gateway primary
!
management {
  admin-interface mgmt0;
  transport [ssh https];
  source-address any;
  listeners {
    protocol ssh { state enabled; }
    protocol https { state enabled; }
    protocol telnet { state enabled; }
  }
}
logging {
  sink syslog://10.99.0.5:514;
  level info;
  enabled false;
}
ruleset ext-inbound {
  match source any;
  action permit;
  target any;
}`;

export const SCENARIOS: ScenarioProfile[] = [
  {
    id: "cisco-secure", vendor: "cisco", status: "known", label: "Cisco IOS — Secure Baseline", insecure: false, content: CISCO_SECURE,
    controls: [
      { id: "NET-TELNET-001", status: "PASS" },
      { id: "NET-SSH-001", status: "PASS" },
      { id: "NET-ADMEX-008", status: "PASS" },
      { id: "NET-MGMT-002", status: "PASS" },
      { id: "NET-LOG-003", status: "PASS" },
      { id: "NET-SRC-004", status: "PASS" },
      { id: "NET-DDENY-006", status: "PASS" },
      { id: "NET-DENY-009", status: "PASS" },
      { id: "NET-AUTH-007", status: "PASS" },
      { id: "NET-SVC-011", status: "WARNING" },
      { id: "NET-SNMP-013", status: "WARNING" },
      { id: "NET-HTTPS-012", status: "PASS" },
    ],
  },
  {
    id: "cisco-insecure", vendor: "cisco", status: "known", label: "Cisco IOS — Internet-Facing Administration", insecure: true, content: CISCO_INSECURE,
    controls: [
      { id: "NET-TELNET-001", status: "FAIL" },
      { id: "NET-SSH-001", status: "FAIL" },
      { id: "NET-ADMEX-008", status: "FAIL" },
      { id: "NET-MGMT-002", status: "FAIL" },
      { id: "NET-LOG-003", status: "FAIL" },
      { id: "NET-SRC-004", status: "FAIL" },
      { id: "NET-DDENY-006", status: "FAIL" },
      { id: "NET-DENY-009", status: "FAIL" },
      { id: "NET-AUTH-007", status: "WARNING" },
      { id: "NET-INSEC-005", status: "FAIL" },
      { id: "NET-SNMP-013", status: "FAIL" },
      { id: "NET-SVC-011", status: "WARNING" },
    ],
  },
  {
    id: "fortinet-secure", vendor: "fortinet", status: "known", label: "Fortinet FortiGate — Secure Baseline", insecure: false, content: FORTINET_SECURE,
    controls: [
      { id: "NET-TELNET-001", status: "PASS" },
      { id: "NET-SSH-001", status: "PASS" },
      { id: "NET-ADMEX-008", status: "PASS" },
      { id: "NET-MGMT-002", status: "PASS" },
      { id: "NET-LOG-003", status: "PASS" },
      { id: "NET-DDENY-006", status: "PASS" },
      { id: "NET-DENY-009", status: "PASS" },
      { id: "NET-AUTH-007", status: "PASS" },
      { id: "NET-SRC-004", status: "PASS" },
      { id: "NET-HTTPS-012", status: "PASS" },
      { id: "NET-SVC-011", status: "WARNING" },
    ],
  },
  {
    id: "fortinet-insecure", vendor: "fortinet", status: "known", label: "Fortinet FortiGate — Insecure", insecure: true, content: FORTINET_INSECURE,
    controls: [
      { id: "NET-SSH-001", status: "FAIL" },
      { id: "NET-ADMEX-008", status: "FAIL" },
      { id: "NET-MGMT-002", status: "FAIL" },
      { id: "NET-SRC-004", status: "FAIL" },
      { id: "NET-DDENY-006", status: "FAIL" },
      { id: "NET-DENY-009", status: "FAIL" },
      { id: "NET-LOG-003", status: "FAIL" },
      { id: "NET-SNMP-013", status: "FAIL" },
      { id: "NET-SVC-011", status: "WARNING" },
    ],
  },
  {
    id: "juniper-secure", vendor: "juniper", status: "known", label: "Juniper Junos — Secure Baseline", insecure: false, content: JUNIPER_SECURE,
    controls: [
      { id: "NET-TELNET-001", status: "PASS" },
      { id: "NET-SSH-001", status: "PASS" },
      { id: "NET-MGMT-002", status: "PASS" },
      { id: "NET-LOG-003", status: "PASS" },
      { id: "NET-AUTH-007", status: "PASS" },
      { id: "NET-DDENY-006", status: "PASS" },
      { id: "NET-DENY-009", status: "PASS" },
      { id: "NET-SRC-004", status: "PASS" },
      { id: "NET-SVC-011", status: "WARNING" },
      { id: "NET-SNMP-013", status: "PASS" },
    ],
  },
  {
    id: "juniper-insecure", vendor: "juniper", status: "known", label: "Juniper Junos — Insecure", insecure: true, content: JUNIPER_INSECURE,
    controls: [
      { id: "NET-TELNET-001", status: "FAIL" },
      { id: "NET-SSH-001", status: "FAIL" },
      { id: "NET-ADMEX-008", status: "FAIL" },
      { id: "NET-MGMT-002", status: "FAIL" },
      { id: "NET-AUTH-007", status: "FAIL" },
      { id: "NET-DDENY-006", status: "WARNING" },
      { id: "NET-DENY-009", status: "FAIL" },
      { id: "NET-SRC-004", status: "FAIL" },
      { id: "NET-LOG-003", status: "FAIL" },
      { id: "NET-SVC-011", status: "WARNING" },
    ],
  },
  {
    id: "unknown-custom", vendor: "unknown", status: "unknown", label: "CloudEdge SDN — Custom Syntax (Flagship Demo)", insecure: true, content: UNKNOWN_CUSTOM,
    controls: [
      { id: "NET-SSH-001", status: "FAIL" },
      { id: "NET-ADMEX-008", status: "FAIL" },
      { id: "NET-MGMT-002", status: "FAIL" },
      { id: "NET-LOG-003", status: "FAIL" },
      { id: "NET-DDENY-006", status: "FAIL" },
      { id: "NET-DENY-009", status: "FAIL" },
      { id: "NET-SRC-004", status: "FAIL" },
      { id: "NET-SVC-011", status: "WARNING" },
    ],
  },
  {
    id: "unknown-custom-branch", vendor: "unknown", status: "unknown", label: "CloudEdge SDN — Custom Syntax (Variant)", insecure: true,
    content: UNKNOWN_CUSTOM.replace("source-address any", "source-address 0.0.0.0/0").replace("enabled false", "enabled true"),
    controls: [
      { id: "NET-SSH-001", status: "FAIL" },
      { id: "NET-ADMEX-008", status: "FAIL" },
      { id: "NET-MGMT-002", status: "FAIL" },
      { id: "NET-DDENY-006", status: "FAIL" },
      { id: "NET-DENY-009", status: "FAIL" },
      { id: "NET-SRC-004", status: "FAIL" },
      { id: "NET-SVC-011", status: "WARNING" },
    ],
  },
];

export function findScenario(labelOrContent: string): ScenarioProfile | undefined {
  return SCENARIOS.find((s) => s.label === labelOrContent || s.content === labelOrContent || labelOrContent.includes(s.label));
}

// ---------------------------------------------------------------------------
// Finding / intent / audit construction
// ---------------------------------------------------------------------------
export interface FindingSeed {
  controlId: string;
  status: "PASS" | "FAIL" | "WARNING";
}

function riskFor(controlId: string, status: string): number {
  if (status === "PASS") return 0;
  const c = DEMO_CONTROL_BY_ID[controlId];
  const base = { CRITICAL: 88, HIGH: 72, MEDIUM: 55, LOW: 34, INFO: 15 }[c?.severity ?? "LOW"] ?? 40;
  return Math.max(5, Math.min(98, base + (hashNum(controlId) % 9) - 4));
}

export function buildIntents(content: string, vendor: VendorId, controls: FindingSeed[]): SecurityIntent[] {
  const lines = splitLines(content);
  return controls.map((seed, i) => {
    const control = DEMO_CONTROL_BY_ID[seed.controlId];
    const intentType = CONTROL_INTENT[seed.controlId] ?? "RESTRICT_ADMIN_ACCESS";
    const isAdmin = intentType === "RESTRICT_ADMIN_ACCESS" || intentType === "SECURE_MANAGEMENT_INTERFACE";
    const restricted = seed.status === "PASS";
    const evidenceLines = lines
      .map((l, idx) => ({ l, idx }))
      .filter(({ l }) => /(ssh|telnet|access|source|log|snmp|admin|permit|deny|authentication|root)/i.test(l))
      .slice((i * 3) % Math.max(1, lines.length), (i * 3) % Math.max(1, lines.length) + 2);
    const evidence = evidenceLines.length
      ? evidenceLines.map(({ l, idx }) => ({ file: "", lineStart: idx + 1, lineEnd: idx + 1, reason: l.trim().slice(0, 100), snippet: l }))
      : [{ file: "", lineStart: 1, lineEnd: 1, reason: "Configuration statement", snippet: lines[0] ?? "" }];
    return {
      id: uniqueId("intent"),
      intentType,
      protocol: intentType === "DISABLE_INSECURE_PROTOCOL" ? (seed.controlId === "NET-TELNET-001" ? "telnet" : seed.controlId.startsWith("NET-SNMP") ? "snmp" : "tftp") : intentType === "RESTRICT_ADMIN_ACCESS" || intentType === "SECURE_MANAGEMENT_INTERFACE" ? "ssh" : undefined,
      source: isAdmin ? { type: "NETWORK", value: restricted ? "10.0.0.0/24" : "any" } : undefined,
      destination: { type: "DEVICE", value: "management" },
      action: "DENY",
      loggingRequired: inputHasLogging(content, intentType),
      enabled: !(intentType === "DISABLE_INSECURE_PROTOCOL" && seed.status === "PASS"),
      vendor: vendor === "unknown" ? "unknown" : vendor,
      sourceConfigFile: "",
      evidence,
      description: control.name,
    };
  });
}

function inputHasLogging(content: string, intentType: string): boolean {
  if (intentType !== "REQUIRE_LOGGING") return false;
  return /log/i.test(content) && !/no\s+logging/i.test(content);
}

export function buildAudit(profile: ScenarioProfile, name: string, sourceConfigName: string): AuditRecord {
  const now = new Date(Date.now() - (hashNum(profile.id) % 28) * 3600_000 - 7 * 24 * 3600_000).toISOString();
  const detection = detectVendor(profile.content);
  const seeds: FindingSeed[] = profile.controls.map((c) => ({ controlId: c.id, status: c.status }));
  const findings = seeds.map((seed) => {
    const control = DEMO_CONTROL_BY_ID[seed.controlId];
    const failing = seed.status === "FAIL";
    const warningRisk = seed.status === "WARNING" ? 15 + (hashNum(seed.controlId) % 15) : 0;
    return {
      id: `${profile.id}-f-${seed.controlId.toLowerCase()}`,
      auditId: profile.id,
      controlId: seed.controlId,
      controlName: control.name,
      severity: failing ? control.severity : seed.status === "WARNING" ? ("LOW" as Severity) : control.severity,
      status: seed.status,
      what: failing
        ? control.name
        : seed.status === "WARNING"
          ? `Review recommended hardening: ${control.name}`
          : `Control satisfied: ${control.name}`,
      why: failing
        ? control.description ?? "Configuration does not satisfy this security control."
        : seed.status === "WARNING"
          ? "A hardening opportunity was identified but does not currently fail compliance."
          : "Configuration satisfies the control as verified by the NEXUS-COMPLY engine.",
      where: sourceConfigName,
      risk: failing ? riskFor(seed.controlId, "FAIL") : warningRisk,
      impact: failing ? `Failure of ${control.name} increases exposure and may be cited in compliance assessments.` : "No material impact.",
      recommendedFix: failing ? control.remediation : "No remediation required.",
      evidence: buildIntents(profile.content, profile.vendor, seeds).flatMap((i) => i.evidence).slice(hashNum(seed.controlId) % 3, (hashNum(seed.controlId) % 3) + 1),
      references: { controlId: seed.controlId, intentType: CONTROL_INTENT[seed.controlId] },
    };
  });

  const intents = buildIntents(profile.content, detection.vendor, profile.controls.map((c) => ({ controlId: c.id, status: c.status })));
  const passed = findings.filter((f) => f.status === "PASS").length;
  const failed = findings.filter((f) => f.status === "FAIL").length;
  const warnings = findings.filter((f) => f.status === "WARNING").length;
  const score = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 100;
  const failingRisks = findings.filter((f) => f.status === "FAIL").map((f) => f.risk);
  const overallScore = failingRisks.length
    ? Math.round((failingRisks.reduce((a, b) => a + b, 0) / failingRisks.length) * (0.75 + 0.25 * Math.min(1, failingRisks.length / 8)))
    : 0;

  const aiInterpretations: AiInterpretation[] =
    detection.vendor === "unknown"
      ? [
          {
            id: uniqueId("ai"),
            sourceConfigId: profile.id,
            syntaxFingerprint: `fp-${hashNum(profile.content).toString(36)}`,
            detectedConcept: "administrative_access",
            securityIntent: "RESTRICT_ADMIN_ACCESS",
            protocol: "ssh",
            sourceRestriction: false,
            loggingEnabled: /log/i.test(profile.content) && !/enabled false/i.test(profile.content),
            confidence: 0.91,
            evidence: [{ lineStart: 1, lineEnd: Math.min(6, splitLines(profile.content).length), reason: "Administrative access appears permitted from an unrestricted source." }],
            suggestedRemediation: "Restrict SSH management access to approved administrative networks.",
            provider: "mock",
            status: "PENDING",
            createdAt: now,
          },
        ]
      : [];

  return {
    id: profile.id,
    configurationId: uniqueId("cfg"),
    configurationName: name,
    vendor: detection.vendor,
    vendorStatus: detection.status,
    status: "COMPLETED",
    startedAt: now,
    completedAt: now,
    intents,
    findings,
    risk: {
      id: `risk-${profile.id}`,
      auditId: profile.id,
      overallScore,
      severityFactor: Math.round(overallScore * 0.35),
      exposureFactor: Math.round((overallScore * 0.3) / 1),
      criticalityFactor: Math.round(overallScore * 0.15),
      controlImportanceFactor: Math.round(overallScore * 0.1),
      exploitabilityFactor: Math.round(overallScore * 0.1),
      explanation: `Overall risk ${overallScore >= 80 ? "CRITICAL" : overallScore >= 60 ? "HIGH" : overallScore >= 40 ? "MEDIUM" : "LOW"} (${overallScore}/100) computed from severity, exposure, asset criticality, control importance and exploitability.`,
      findings: findings.filter((f) => f.status === "FAIL").map((f) => f.id),
    },
    compliance: { passed, failed, warnings, na: 0, score },
    aiInterpretations,
  };
}

export function buildAuditFromContent(fileName: string, content: string): AuditRecord {
  const scenario = findScenario(content);
  if (scenario) return buildAudit(scenario, fileName, fileName);
  return buildAudit(makeCustomProfile(content, fileName), fileName, fileName);
}

function makeCustomProfile(content: string, fileName: string): ScenarioProfile {
  const detection = detectVendor(content);
  const insecure = isInsecureContent(content);
  const base: ScenarioProfile = findScenario(detection.vendor === "unknown" ? "unknown-custom" : detection.vendor === "cisco" ? (insecure ? "cisco-insecure" : "cisco-secure") : detection.vendor === "fortinet" ? (insecure ? "fortinet-insecure" : "fortinet-secure") : insecure ? "juniper-insecure" : "juniper-secure") ?? SCENARIOS[0];
  return {
    ...base,
    id: `custom-${hashNum(fileName + content).toString(36)}`,
    label: fileName,
    content,
    controls: base.controls,
  };
}

export function mockInterpret(content: string): {
  detectedConcept: string;
  securityIntent: SecurityIntentType;
  protocol?: string;
  sourceRestriction: boolean;
  loggingEnabled: boolean;
  confidence: number;
  evidence: Array<{ lineStart: number; lineEnd: number; reason: string; snippet?: string }>;
  suggestedRemediation: string;
  provider: "mock";
} {
  const lines = splitLines(content);
  const hasTelnet = /telnet/i.test(content);
  const hasAnySource = /(0\.0\.0\.0|\bany\b|\ball\b|unrestricted)/i.test(content);
  const protocol = hasTelnet ? "telnet" : "ssh";
  const concept = hasTelnet ? "insecure_protocol_enabled" : "administrative_access";
  const intent: SecurityIntentType = hasTelnet ? "DISABLE_INSECURE_PROTOCOL" : "RESTRICT_ADMIN_ACCESS";
  const evidence = lines
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => /(ssh|telnet|source|addr|permit|admin|management|from)/i.test(l))
    .slice(0, 3)
    .map(({ l, idx }) => ({ lineStart: idx + 1, lineEnd: idx + 1, reason: `Line enables ${protocol} management access: ${l.trim()}`.slice(0, 120), snippet: l }));
  return {
    detectedConcept: concept,
    securityIntent: intent,
    protocol,
    sourceRestriction: !hasAnySource,
    loggingEnabled: /log/i.test(content) && !/no\s+log/i.test(content) && !/enabled false/i.test(content),
    confidence: 0.91,
    evidence: evidence.length ? evidence : [{ lineStart: 1, lineEnd: 1, reason: "Administrative access statement detected.", snippet: lines[0] ?? "" }],
    suggestedRemediation: hasAnySource
      ? "Restrict SSH management access to approved administrative networks."
      : "Restrict administrative access to approved management networks and enforce logging.",
    provider: "mock",
  };
}