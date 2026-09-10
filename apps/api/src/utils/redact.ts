/**
 * Secret redaction for sending configuration to the AI service.
 * Uploaded configuration is UNTRUSTED input. We redact credentials before
 * anything leaves the process boundary toward an external AI provider.
 */

const REDACTED = "[REDACTED]";

interface RedactRule {
  re: RegExp;
  to: string;
}

// Match keyword value pairs for common secrets.
const KEYWORD_SECRET_RULES: RedactRule[] = [
  { re: /(password\s+)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(secret\s+(\d+\s+)?)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(community\s+)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(api[_-]?key\s*[=:]\s*)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(token\s*[=:]\s*)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(auth[_-]?key\s+)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(authentication-key\s+")([^"]+)/gi, to: `$1${REDACTED}` },
  { re: /(passphrase\s+)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(privacy-password\s+)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(snmp-server\s+user\s+\S+\s+\S+\s+)/gi, to: `$1${REDACTED}` },
  { re: /(snmp-server\s+community\s+)(\S+)/gi, to: `$1${REDACTED}` },
  { re: /(login\s+password\s+)(\S+)/gi, to: `$1${REDACTED}` },
];

// Heuristic detection for standalone secret-looking tokens.
function heuristicRedact(line: string): string {
  // Redact lines that are only a "key = <secrecy>" pattern
  const keyVal = line.match(/^\s*([a-z0-9_\-]+)\s*=\s*(\S+)\s*$/i);
  if (keyVal) {
    const key = keyVal[1].toLowerCase();
    if (/key|secret|pass|token|cred/.test(key)) {
      return `${keyVal[1]} = ${REDACTED}`;
    }
  }
  return line;
}

/**
 * Redact obvious secrets from configuration text.
 */
export function redactSecrets(content: string): string {
  let out = content;
  for (const rule of KEYWORD_SECRET_RULES) {
    out = out.replace(rule.re, rule.to);
  }

  // Also redact basic/plaintext auth tokens and long random strings that follow
  // a keyword within quotes
  out = out.replace(/(("|')(pass(word)?|secret|key|token)("|'))/gi, REDACTED);

  // Line-by-line heuristic
  const lines = out.split(/\r?\n/);
  const newLines = lines.map(heuristicRedact);
  return newLines.join("\n");
}

/**
 * Detect whether redaction changed anything (e.g. whether secrets were present).
 */
export function countRedactions(input: string, redacted: string): number {
  let count = 0;
  const inp = input.split(/\r?\n/);
  const red = redacted.split(/\r?\n/);
  for (let i = 0; i < Math.min(inp.length, red.length); i++) {
    if (inp[i] !== red[i]) count += 1;
  }
  return count;
}
