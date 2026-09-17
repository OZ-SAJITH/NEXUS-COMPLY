import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCTION_CONNECTOR_POLICY,
  REMEDIATION_ACTIONS,
  authorizeConnectorAction,
  connectorModeFor,
  seededConnectors,
} from "@nexus/enterprise-catalog";

describe("connector policy gate", () => {
  const [simulated] = seededConnectors();
  const allActions = Object.keys(REMEDIATION_ACTIONS);

  it("classifies seeded adapters as SIMULATED", () => {
    expect(connectorModeFor(simulated)).toBe("SIMULATED");
  });

  it("admits a simulated adapter for an action on its authorizedActions", () => {
    const action = simulated.authorizedActions[0];
    const auth = authorizeConnectorAction({ connector: simulated, action });
    expect(auth.allowed).toBe(true);
    expect(auth.mode).toBe("SIMULATED");
    expect(auth.reason).toMatch(/Simulated adapter/);
  });

  it("denies an action outside the adapter's authorizedActions", () => {
    const banned = allActions.find((a) => !simulated.authorizedActions.includes(a as never)) as string;
    const auth = authorizeConnectorAction({ connector: simulated, action: banned });
    expect(auth.allowed).toBe(false);
    expect(auth.reason).toMatch(/not in .* authorizedActions/);
  });

  it("classifies a real (simulated:false) adapter as PRODUCTION", () => {
    const production = { ...simulated, id: "conn-prod-01", simulated: false as const };
    expect(connectorModeFor(production)).toBe("PRODUCTION");
  });

  it("denies a PRODUCTION adapter under the default policy", () => {
    const production = { ...simulated, id: "conn-prod-01", simulated: false as const };
    const auth = authorizeConnectorAction({ connector: production, action: production.authorizedActions[0] });
    expect(auth.allowed).toBe(false);
    expect(auth.mode).toBe("PRODUCTION");
    expect(auth.reason).toMatch(/allowProductionAdapters=false/);
  });

  it("denies a PRODUCTION adapter whose vendor is not allowlisted", () => {
    const production = { ...simulated, id: "conn-prod-01", simulated: false as const, vendor: "Linux" };
    const auth = authorizeConnectorAction({
      connector: production,
      action: production.authorizedActions[0],
      policy: { allowProductionAdapters: true, allowlistedVendors: ["CISCO"] },
    });
    expect(auth.allowed).toBe(false);
    expect(auth.reason).toMatch(/not allowlisted/);
  });

  it("admits a PRODUCTION adapter once enabled and allowlisted (case-insensitive)", () => {
    const production = { ...simulated, id: "conn-prod-01", simulated: false as const };
    const auth = authorizeConnectorAction({
      connector: production,
      action: production.authorizedActions[0],
      policy: { allowProductionAdapters: true, allowlistedVendors: ["CISCO"] },
    });
    expect(auth.allowed).toBe(true);
    expect(auth.mode).toBe("PRODUCTION");
    expect(auth.reason).toMatch(/allowlisted/);
  });

  it("exports a default policy that keeps production disabled", () => {
    expect(DEFAULT_PRODUCTION_CONNECTOR_POLICY).toEqual({ allowProductionAdapters: false, allowlistedVendors: [] });
  });
});