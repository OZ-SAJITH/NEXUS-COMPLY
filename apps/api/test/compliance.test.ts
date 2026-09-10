import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CiscoAdapter } from "../src/adapters/cisco";
import { FortinetAdapter } from "../src/adapters/fortinet";
import { summarizeCompliance, postureScore, getControls } from "@nexus/compliance-rules";
import { evaluateIntents } from "../src/engines/compliance";

const sample = (vendor: string, file: string) =>
  readFileSync(resolve(__dirname, "../../../samples", vendor, file), "utf-8");

describe("Compliance evaluation — known vendor", () => {
  it("evaluates every prototype control (one finding per control)", () => {
    const p = new CiscoAdapter().parse(sample("cisco", "demo-insecure.conf"), "demo-insecure.conf");
    const findings = evaluateIntents({ fileName: "demo-insecure.conf" }, p.intents);
    expect(findings).toHaveLength(getControls().length);
    expect(getControls().length).toBeGreaterThanOrEqual(15);
  });

  it("passes secure config (0 FAIL)", () => {
    const p = new CiscoAdapter().parse(sample("cisco", "demo-secure.conf"), "demo-secure.conf");
    const findings = evaluateIntents({ fileName: "demo-secure.conf" }, p.intents);
    const summary = summarizeCompliance(findings);
    expect(summary.failed).toBe(0);
    expect(summary.score).toBe(100);
  });

  it("flags explicitly insecure config (score lower than secure)", () => {
    const sec = new CiscoAdapter().parse(sample("cisco", "demo-secure.conf"), "demo-secure.conf");
    const insec = new CiscoAdapter().parse(sample("cisco", "demo-insecure.conf"), "demo-insecure.conf");
    const secSum = summarizeCompliance(evaluateIntents({ fileName: "s" }, sec.intents));
    const insecSum = summarizeCompliance(evaluateIntents({ fileName: "i" }, insec.intents));
    expect(insecSum.failed).toBeGreaterThan(0);
    expect(insecSum.score).toBeLessThan(secSum.score);
    expect(postureScore(insecSum, null)).toBeLessThanOrEqual(postureScore(secSum, null));
  });

  it("carries evidence snippet + line numbers on findings", () => {
    const p = new CiscoAdapter().parse(sample("cisco", "demo-insecure.conf"), "demo-insecure.conf");
    const findings = evaluateIntents({ fileName: "demo-insecure.conf" }, p.intents);
    const failing = findings.find((f) => f.status === "FAIL");
    expect(failing).toBeDefined();
    expect(failing!.evidence.length).toBeGreaterThan(0);
    for (const e of failing!.evidence) {
      expect(e.lineStart).toBeGreaterThanOrEqual(1);
      expect(typeof e.reason).toBe("string");
    }
  });

  it("assigns a deterministic risk score to failing findings only", () => {
    const p = new CiscoAdapter().parse(sample("cisco", "demo-insecure.conf"), "demo-insecure.conf");
    const findings = evaluateIntents({ fileName: "x" }, p.intents);
    for (const f of findings) {
      if (f.status === "FAIL") expect(f.risk).toBeGreaterThan(0);
      else expect(f.risk).toBe(0);
    }
  });

  it("every FAIL finding is explainable (why + recommendedFix present)", () => {
    const p = new FortinetAdapter().parse(sample("fortinet", "demo-insecure.conf"), "demo-insecure.conf");
    const findings = evaluateIntents({ fileName: "f" }, p.intents);
    for (const f of findings.filter((x) => x.status === "FAIL")) {
      expect(f.why.length).toBeGreaterThan(0);
      expect(f.recommendedFix.length).toBeGreaterThan(0);
    }
  });
});