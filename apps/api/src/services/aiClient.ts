import type { SecurityIntentType } from "@nexus/shared-types";

export interface InterpretRequest {
  configName: string;
  redactedConfig: string;
  vendor: string;
  syntaxFingerprint?: string;
}

export interface InterpretResponse {
  detectedConcept: string;
  securityIntent: SecurityIntentType;
  protocol?: string;
  sourceRestriction: boolean;
  loggingEnabled: boolean;
  confidence: number;
  evidence: Array<{ lineStart: number; lineEnd: number; reason: string; snippet?: string }>;
  suggestedRemediation: string;
  provider: "mock" | "live" | "fallback";
  model?: string;
}

export interface AiClientOptions {
  aiServiceUrl?: string;
  provider?: string;
  apiKey?: string;
}

/**
 * Matches the exact wildcard address 0.0.0.0(/0|/32) — but NOT a network such
 * as 10.0.0.0/8 which merely *contains* those octets. Used by the deterministic
 * interpreters so restricted management networks are never treated as open.
 */
const WILDCARD_ADDRESS = String.raw`(?:^|[^0-9])0\.0\.0\.0(?:/\d+)?(?=$|[^0-9.])`;

/**
 * Client that talks to the Python FastAPI AI service.
 * If the service is unreachable (e.g. Python not running) and the provider
 * is mock/fallback, the backend uses a deterministic in-process interpreter.
 */
export class AiClient {
  private baseUrl: string;
  private provider: string;
  private apiKey: string;

  constructor(opts: AiClientOptions = {}) {
    this.baseUrl = opts.aiServiceUrl ?? process.env.AI_SERVICE_URL ?? "http://localhost:8000";
    this.provider = opts.provider ?? process.env.AI_PROVIDER ?? "mock";
    this.apiKey = opts.apiKey ?? process.env.AI_API_KEY ?? "";
  }

  get providerMode(): "mock" | "live" {
    if (this.provider === "mock" || !this.apiKey) return "mock";
    return "live";
  }

  async interpret(req: InterpretRequest): Promise<InterpretResponse> {
    // Try the Python service first; on any failure fall back deterministically.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${this.baseUrl}/api/ai/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...req,
          provider: this.provider,
          apiKey: this.apiKey,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`AI service ${res.status}`);
      const data = (await res.json()) as InterpretResponse;
      return data;
    } catch (err) {
      // Deterministic fallback interpreter (works without Python).
      return deterministicInterpreter(req, this.providerMode);
    }
  }
}

/**
 * Deterministic mock/fallback interpreter.
 * Produces a sensible candidate for the custom unknown configuration.
 */
export function deterministicInterpreter(req: InterpretRequest, mode: "mock" | "live"): InterpretResponse {
  const c = req.redactedConfig;
  const lines = c.split(/\r?\n/);

  const evidence: Array<{ lineStart: number; lineEnd: number; reason: string; snippet?: string }> = [];

  const ref = (lineStart: number, lineEnd: number, reason: string) => {
    evidence.push({
      lineStart,
      lineEnd,
      reason,
      snippet: lines.slice(Math.max(0, lineStart - 1), lineEnd).join("\n"),
    });
  };

  const hasSsh = /ssh|secure[\s-_]?shell/i.test(c);
  const hasTelnet = /telnet/i.test(c);
  const hasAnySource = new RegExp(String.raw`(source|from|allow|clients)[^\n]*(\bany\b|${WILDCARD_ADDRESS}|unrestricted|\ball\b)`, "i").test(c);

  let concept = "administrative_access";
  let intent: SecurityIntentType = "RESTRICT_ADMIN_ACCESS";
  let protocol = hasTelnet && !hasSsh ? "telnet" : "ssh";
  let sourceRestriction = !hasAnySource;
  let logging = /log|audit|trap/i.test(c);
  let i = 0;

  if (/telnet/i.test(c) && !/ssh/i.test(c)) {
    ref(1, 3, "Configuration enables Telnet for administrative access.");
    intent = "DISABLE_INSECURE_PROTOCOL";
    concept = "insecure_protocol_enabled";
    protocol = "telnet";
    sourceRestriction = false;
    logging = false;
  } else {
    while (i < lines.length) {
      const l = lines[i];
      if (/ssh|secure[\s-_]?shell|remote|management|admin/i.test(l)) {
        ref(i + 1, i + 1, `Line enables ${protocol} management access: ${l.trim()}`.slice(0, 120));
      }
      i++;
    }
    if (hasAnySource || new RegExp(String.raw`(source|netmask|subnet|from)[^\n]*(${WILDCARD_ADDRESS}|\bany\b|\ball\b)`, "i").test(c)) {
      ref(1, lines.length > 6 ? 6 : lines.length, "Administrative access appears permitted from an unrestricted source.");
      sourceRestriction = false;
    }
  }

  const confidence = 0.91;

  const recommended = sourceRestriction
    ? "Restrict administrative access to approved management networks and enforce logging."
    : "Restrict SSH management access to approved administrative networks.";

  return {
    detectedConcept: concept,
    securityIntent: intent,
    protocol,
    sourceRestriction,
    loggingEnabled: logging,
    confidence,
    evidence: evidence.length ? evidence : [{ lineStart: 1, lineEnd: 1, reason: "Administrative access statement detected.", snippet: lines[0] }],
    suggestedRemediation: recommended,
    provider: mode === "live" ? "fallback" : "mock",
  };
}
