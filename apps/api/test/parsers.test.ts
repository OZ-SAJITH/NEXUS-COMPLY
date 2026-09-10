import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CiscoAdapter } from "../src/adapters/cisco";
import { FortinetAdapter } from "../src/adapters/fortinet";
import { JuniperAdapter } from "../src/adapters/juniper";
import { UnknownAdapter } from "../src/adapters/unknown";
import { detectVendor } from "../src/utils/helpers";

const sample = (vendor: string, file: string) =>
  readFileSync(resolve(__dirname, "../../../samples", vendor, file), "utf-8");

describe("Vendor detection", () => {
  it("detects Cisco IOS", () => {
    const r = detectVendor(sample("cisco", "demo-insecure.conf"));
    expect(r.vendor).toBe("cisco");
    expect(r.status).toBe("known");
  });

  it("detects Fortinet FortiGate", () => {
    const r = detectVendor(sample("fortinet", "demo-insecure.conf"));
    expect(r.vendor).toBe("fortinet");
    expect(r.status).toBe("known");
  });

  it("detects Juniper Junos", () => {
    const r = detectVendor(sample("juniper", "demo-insecure.conf"));
    expect(r.vendor).toBe("juniper");
    expect(r.status).toBe("known");
  });

  it("flags unknown/custom syntax as unknown", () => {
    const r = detectVendor(sample("unknown", "custom-demo.conf"));
    expect(r.vendor).toBe("unknown");
    expect(r.status).toBe("unknown");
  });
});

describe("Cisco parser", () => {
  it("extracts RESTRICT_ADMIN_ACCESS with source restriction from secure config", () => {
    const p = new CiscoAdapter().parse(sample("cisco", "demo-secure.conf"), "demo-secure.conf");
    const admin = p.intents.find((i) => i.intentType === "RESTRICT_ADMIN_ACCESS");
    expect(admin).toBeDefined();
    expect(admin!.source?.value).not.toMatch(/^(any|0\.0\.0\.0\/0)$/i);
  });

  it("marks telnet as enabled (insecure) on the insecure sample", () => {
    const p = new CiscoAdapter().parse(sample("cisco", "demo-insecure.conf"), "demo-insecure.conf");
    const tel = p.intents.find((i) => i.intentType === "DISABLE_INSECURE_PROTOCOL" && i.protocol === "telnet");
    expect(tel).toBeDefined();
    expect(tel!.enabled).toBe(true);
  });

  it("preserves evidence line numbers", () => {
    const p = new CiscoAdapter().parse(sample("cisco", "demo-insecure.conf"), "demo-insecure.conf");
    for (const intent of p.intents) {
      for (const ev of intent.evidence) {
        expect(ev.lineStart).toBeGreaterThanOrEqual(1);
        expect(ev.lineEnd).toBeGreaterThanOrEqual(ev.lineStart);
      }
    }
  });
});

describe("Fortinet parser", () => {
  it("reads trusted-host as a restricted admin source", () => {
    const p = new FortinetAdapter().parse(sample("fortinet", "demo-secure.conf"), "demo-secure.conf");
    const admin = p.intents.find((i) => i.intentType === "RESTRICT_ADMIN_ACCESS");
    expect(admin).toBeDefined();
    expect(admin!.source?.type).toBe("NETWORK");
  });

  it("treats 0.0.0.0/0 trusthost as unrestricted", () => {
    const p = new FortinetAdapter().parse(sample("fortinet", "demo-insecure.conf"), "demo-insecure.conf");
    const admin = p.intents.find((i) => i.intentType === "RESTRICT_ADMIN_ACCESS");
    expect(admin!.source?.value).toBe("any");
  });
});

describe("Juniper parser", () => {
  it("detects SSH service", () => {
    const p = new JuniperAdapter().parse(sample("juniper", "demo-secure.conf"), "demo-secure.conf");
    const admin = p.intents.find((i) => i.intentType === "RESTRICT_ADMIN_ACCESS");
    expect(admin).toBeDefined();
    expect(admin!.protocol).toBe("ssh");
  });

  it("detects insecure telnet/http services", () => {
    const p = new JuniperAdapter().parse(sample("juniper", "demo-insecure.conf"), "demo-insecure.conf");
    const tel = p.intents.find((i) => i.protocol === "telnet");
    expect(tel).toBeDefined();
  });
});

describe("Unknown adapter", () => {
  it("returns no deterministic intents (adaptive path owns unknown syntax)", () => {
    const p = new UnknownAdapter().parse("ifjapod jaspod ojasd", "x.conf");
    expect(p.intents).toHaveLength(0);
    expect(p.vendor).toBe("unknown");
  });
});