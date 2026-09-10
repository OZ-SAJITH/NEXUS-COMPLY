import type { VendorId, VendorStatus } from "@nexus/shared-types";

export interface VendorDetection {
  vendor: VendorId;
  status: VendorStatus;
  detectedBy: string;
  confidence: number;
}

const RULES: Array<{ vendor: VendorId; label: string; markers: RegExp[]; weight: number }> = [
  {
    vendor: "cisco",
    label: "Cisco IOS",
    markers: [/\bhostname\s+\S+/i, /\benable\s+secret/i, /\binterface\s+[a-z]+[0-9\/]/i, /^router\s+/im, /\bip\s+access-list/i, /\bspanning-tree\b/i],
    weight: 3,
  },
  {
    vendor: "fortinet",
    label: "Fortinet FortiGate",
    markers: [/\bconfig\s+system\s+global\b/i, /\bconfig\s+system\s+admin\b/i, /\bconfig\s+router\b/i, /\bconfig\s+firewall\s+policy\b/i, /\bset\s+admin-ssh\b/i, /\bset\s+gui-http\b/i],
    weight: 3,
  },
  {
    vendor: "juniper",
    label: "Juniper Junos",
    markers: [/\bset\s+\S+\s+system\s+login\b/i, /^set\s+interfaces\s/im, /\bset\s+security\s+[a-z]/i, /^system\s*\{\s*host-name/im, /^\s*version\s+\S+;\s*$/im, /\broot-authentication\b/i],
    weight: 3,
  },
];

export function detectVendor(content: string): VendorDetection {
  let best = { vendor: "unknown" as VendorId, weight: 0, by: "No recognized vendor syntax" };

  for (const rule of RULES) {
    let hits = 0;
    for (const m of rule.markers) {
      if (m.test(content)) hits += 1;
    }
    const weight = hits * rule.weight;
    if (weight > best.weight) {
      best = { vendor: rule.vendor, weight, by: `Matched ${rule.label} syntax (${hits} markers)` };
    }
  }

  if (best.vendor === "unknown") {
    return { vendor: "unknown", status: "unknown", detectedBy: best.by, confidence: 0.5 };
  }

  const confidence = Math.min(0.99, 0.5 + best.weight / 20);
  return { vendor: best.vendor, status: "known", detectedBy: best.by, confidence: Math.round(confidence * 100) / 100 };
}

export function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

export function isAny(value: string | undefined | null): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === "any" || v === "all" || v === "0.0.0.0/0" || v === "::/0" || v === "0.0.0.0" || v === "unknown" || v === "*";
}

export function cidrToRange(cidr: string): [number, number] | null {
  const m = cidr.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!m) return null;
  const bits = m[1].split(".").map(Number);
  if (bits.some((b) => b < 0 || b > 255)) return null;
  const prefix = Number(m[2]);
  if (prefix < 0 || prefix > 32) return null;
  const ipNum = ((bits[0] << 24) | (bits[1] << 16) | (bits[2] << 8) | bits[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const start = (ipNum & mask) >>> 0;
  const end = (start | ~mask) >>> 0;
  return [start, end];
}

export function isPrivateOrInternal(cidr: string): boolean {
  const r = cidrToRange(cidr);
  if (!r) return false;

  const privateRanges: Array<[number, number]> = [
    [0x0a000000, 0x0affffff],
    [0xac100000, 0xac1fffff],
    [0xc0a80000, 0xc0a8ffff],
    [0x7f000000, 0x7fffffff],
  ];

  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
  for (const pr of privateRanges) {
    if (r[0] >= pr[0] && r[1] <= pr[1]) return true;
  }
  return false;
}

export function isInternetExposed(source?: { type: string; value: string } | null): boolean {
  if (!source) return true;
  if (source.type === "ANY") return true;
  if (isAny(source.value)) return true;
  if (source.type === "NETWORK" && !isPrivateOrInternal(source.value)) return true;
  return false;
}

export function extractSnippet(lines: string[], lineStart: number, lineEnd: number): string {
  const a = Math.max(1, lineStart) - 1;
  const b = Math.min(lines.length, lineEnd);
  const slice = lines.slice(a, b);
  return slice.map((l, i) => `${a + i + 1}: ${l}`).join("\n");
}

export function fingerprintSyntax(content: string): string {
  return hashString30(structuralNormalize(content));
}

/**
 * Structural normalization: drop values, keep only syntax/keyword structure so
 * that variants of the same custom configuration language share a fingerprint.
 * Capitalized/uppercase tokens are treated as keywords; numbers, IPs, quoted
 * strings, and lowercase values are ignored.
 */
function structuralNormalize(s: string): string {
  const out: string[] = [];
  for (const line of s.split(/\r?\n/)) {
    const stripped = line
      .replace(/"(\\.|[^"\\])*"/g, '"V"')
      .replace(/0x[0-9a-fA-F]+/g, "N")
      .replace(/\b\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?\b/g, "IP")
      .replace(/\b\d+\b/g, "N");
    const keywords = stripped.match(/[A-Z][A-Z0-9_.-]*/g) ?? [];
    if (keywords.length) out.push(keywords.join(" "));
  }
  return out.join("\n");
}

function hashString30(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36).padStart(8, "0");
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
