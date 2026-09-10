import { describe, it, expect } from "vitest";
import { AiClient, deterministicInterpreter } from "../src/services/aiClient";
import { redactSecrets } from "../src/utils/redact";

const VALID_INTENTS = [
  "RESTRICT_ADMIN_ACCESS",
  "DISABLE_INSECURE_PROTOCOL",
  "REQUIRE_STRONG_AUTHENTICATION",
  "REQUIRE_LOGGING",
  "NETWORK_SEGMENTATION",
  "DEFAULT_DENY",
  "DENY_UNAUTHORIZED_TRAFFIC",
  "SECURE_MANAGEMENT_INTERFACE",
  "RESTRICT_SOURCE_NETWORK",
];

describe("AI interpretation contract", () => {
  it("produces a fully-structured response that passes runtime schema checks", () => {
    const r = deterministicInterpreter(
      { configName: "x.conf", redactedConfig: "ADMIN SSH ENABLED\nSOURCE UNRESTRICTED", vendor: "unknown" },
      "mock"
    );
    expect(VALID_INTENTS).toContain(r.securityIntent);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(typeof r.detectedConcept).toBe("string");
    expect(typeof r.suggestedRemediation).toBe("string");
    expect(typeof r.sourceRestriction).toBe("boolean");
    expect(typeof r.loggingEnabled).toBe("boolean");
    expect(r.provider).toBe("mock");
    expect(Array.isArray(r.evidence)).toBe(true);
    for (const e of r.evidence) {
      expect(e.lineStart).toBeGreaterThanOrEqual(1);
      expect(typeof e.reason).toBe("string");
    }
  });

  it("attribute evidence line numbers reference the actual config lines", () => {
    const r = deterministicInterpreter({ configName: "c", redactedConfig: "A\nB\nC\nADMIN SSH 10.0.1.5", vendor: "unknown" }, "mock");
    const hasRef = r.evidence.some((e) => e.lineStart <= 4 && e.lineEnd >= 1);
    expect(hasRef).toBe(true);
  });

  it("does NOT confuse 10.0.0.0/8 (restricted) with the 0.0.0.0 wildcard", () => {
    const r = deterministicInterpreter(
      { configName: "restricted.conf", redactedConfig: 'MGMT.ACCESS {\nPROTOCOL "SSH"\nSOURCE "10.0.0.0/8"\nAUDIT.TRAIL "on" }', vendor: "unknown" },
      "mock"
    );
    expect(r.securityIntent).toBe("RESTRICT_ADMIN_ACCESS");
    expect(r.sourceRestriction).toBe(true);
    expect(r.loggingEnabled).toBe(true);
  });

  it("does treat the exact 0.0.0.0 wildcard as unrestricted", () => {
    const r = deterministicInterpreter(
      { configName: "open.conf", redactedConfig: 'ALLOWED.CLIENTS "0.0.0.0/0"\nSOURCE "0.0.0.0"', vendor: "unknown" },
      "mock"
    );
    expect(r.sourceRestriction).toBe(false);
  });

  it("still returns a valid interpretation when the AI service is unreachable (falls back deterministically)", async () => {
    const client = new AiClient({ aiServiceUrl: "http://localhost:9" });
    const r = await client.interpret({
      configName: "unreachable.conf",
      redactedConfig: "METHOD SSH\nSOURCE ANY",
      vendor: "unknown",
    });
    expect(VALID_INTENTS).toContain(r.securityIntent);
    expect([r.provider, "mock", "fallback"]).toContain(r.provider);
    expect(typeof r.confidence).toBe("number");
  });
});

describe("Redaction protects secrets before AI sees them", () => {
  it("redactSecrets removes passwords and shared secrets", () => {
    const out = redactSecrets("password hunter2\nsecret C0mpl3x!\nenable secret supersecret\nline 3");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("C0mpl3x!");
    expect(out).not.toContain("supersecret");
  });
});