import { describe, it, expect, beforeAll } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { enterpriseDemo } from "../src/demo/enterpriseStore";
import AssetDetailPage from "../src/pages/enterprise/AssetDetailPage";
import ConnectorsPage from "../src/pages/enterprise/ConnectorsPage";
import GovernancePage from "../src/pages/enterprise/GovernancePage";
import DashboardPage from "../src/pages/DashboardPage";
import EnterpriseAuditPage from "../src/pages/enterprise/EnterpriseAuditPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

if (typeof window !== "undefined" && !window.IntersectionObserver) {
  class IOStub {
    root = null;
    rootMargin = "";
    thresholds = [];
    disconnect() {}
    observe() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver = IOStub as unknown as typeof IntersectionObserver;
}

/**
 * PHASE 2 browser-equivalent render probe (jsdom). Exercises the real React
 * tree the user clicks: connector profile panel, connection test, expandable
 * evidence rows with recomputed SHA-256 verification — against the exact
 * in-browser facade (demoApi -> enterpriseDemo) a static deployment uses.
 */

const HERO = "ast-api-gateway-01";

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  }
}

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[`/app/enterprise/${HERO}`]}>
        <Routes>
          <Route path="/app/enterprise/:id" element={<AssetDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
  });
  return { root, container };
}

describe("AssetDetailPage — PHASE 2 connector + evidence integrity (jsdom render probe)", () => {
  beforeAll(async () => {
    await enterpriseDemo.scan(HERO, "manual");
  });

  it("renders the connector panel with transport, protocol, latency and declared capabilities", async () => {
    const { root, container } = mount();
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("Managing connector");
    expect(text).toContain("API Gateway / TLS Adapter (Kong)");
    expect(text).toContain("Kong");
    expect(text).toContain("Transport HTTPS_API");
    expect(text).toContain("Protocol HTTPS");
    expect(text).toContain("Latency");
    expect(text).toContain("Declared capabilities");
    expect(text).toContain("SECURITY_HEADERS");
    expect(text).toContain("Test connection");
    act(() => root.unmount());
  });

  it("runs a live connection test and shows the negotiated transport/latency/capabilities", async () => {
    const { root, container } = mount();
    await flush();
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Test connection"));
    expect(button).toBeDefined();
    await act(async () => button!.click());
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("Connection test OK");
    expect(text).toContain("HTTPS_API/HTTPS");
    expect(text).toContain("capabilities negotiated");
    act(() => root.unmount());
  });

  it("renders evidence rows and expands one to re-verify its SHA-256 canonical payload", async () => {
    const { root, container } = mount();
    await flush();
    let text = container.textContent ?? "";
    expect(text).toContain("Evidence (");
    expect(text).toContain("sha256");
    const toggle = [...container.querySelectorAll("section")].find((s) => s.textContent?.includes("Evidence ("))?.querySelector("button") as HTMLButtonElement;
    expect(toggle).toBeDefined();
    await act(async () => toggle.click());
    await flush();
    text = container.textContent ?? "";
    expect(text).toContain("Recomputed SHA-256 integrity (canonical payload)");
    expect(text).toContain("NEXUS-EVIDENCE-1");
    expect(text).toContain("verified");
    expect(text).toMatch(/[0-9a-f]{64}/);
    act(() => root.unmount());
  });

  it("shows findings + evidence-grounded risk from the latest scan", async () => {
    const { root, container } = mount();
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("Findings (");
    expect(text).toContain("Risk posture");
    expect(text).toContain("TLS-001");
    expect(text).toContain("Analyze");
    act(() => root.unmount());
  });

  it("PHASE 3 — expands the 'Why is this a finding?' panel and flips the finding lifecycle", async () => {
    const { root, container } = mount();
    await flush();
    let text = container.textContent ?? "";
    expect(text).toContain("Why is this a finding?");
    expect(text).toContain("lifecycle");

    const whyToggle = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Why is this a finding?"));
    expect(whyToggle).toBeDefined();
    await act(async () => whyToggle!.click());
    await flush();
    text = container.textContent ?? "";
    expect(text).toContain("Observed");
    expect(text).toContain("Expected");
    expect(text).toContain("Recommended fix");

    const select = [...container.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "OPEN")) as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.value).toBe("OPEN");
    await act(async () => {
      select.value = "ACKNOWLEDGED";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent ?? "").toContain("ACKNOWLEDGED");
    act(() => root.unmount());
  });
});

describe("ConnectorsPage — PHASE 2 transport/protocol/capabilities chips (jsdom render probe)", () => {
  function mountConnectors() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/app/enterprise/connectors"]}>
          <Routes>
            <Route path="/app/enterprise/connectors" element={<ConnectorsPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    return { root, container };
  }

  it("renders the full 17-connector registry with transports, protocols and capability chips", async () => {
    const { root, container } = mountConnectors();
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("Enterprise Connectors");
    expect(text).toContain("connectors");
    const cards = [...container.querySelectorAll("button")].filter((b) => b.textContent?.includes("Test connection"));
    expect(cards.length).toBe(17);
    expect(text).toContain("Transport HTTPS_API");
    expect(text).toContain("Protocol HTTPS");
    expect(text).toContain("Declared capabilities");
    expect(text).toContain("OS_INFO");
    for (const expected of ["AGENT", "WINRM", "CLOUD_API", "SECURITY_HEADERS", "FIREWALL_RULES"] as const) {
      expect(text).toContain(expected);
    }
    act(() => root.unmount());
  });

  it("tests a degraded connector and reports the transition ONLINE in the notice", async () => {
    const { root, container } = mountConnectors();
    await flush();
    const degraded = enterpriseDemo.connectorById("conn-net-02");
    expect(degraded?.status).not.toBe("ONLINE");
    const palo = [...container.querySelectorAll(".card")].find((c) => c.textContent?.includes("Palo Alto"));
    const button = palo?.querySelector("button") as HTMLButtonElement;
    expect(button).toBeDefined();
    await act(async () => button.click());
    await flush();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Palo Alto Firewall Adapter connection test: ONLINE/);
    expect(enterpriseDemo.connectorById("conn-net-02")?.status).toBe("ONLINE");
    act(() => root.unmount());
  });
});

describe("GovernancePage — PHASE 4 adaptive governance hub (jsdom render probe)", () => {
  function mountGovernance() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/app/enterprise/governance"]}>
          <Routes>
            <Route path="/app/enterprise/governance" element={<GovernancePage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    return { root, container };
  }

  it("renders regime posture, framework catalog, policy profiles, decision trace and exception registry", async () => {
    const { root, container } = mountGovernance();
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("Enterprise Governance");
    expect(text).toContain("Regime posture");
    expect(text).toContain("By region");
    expect(text).toContain("By framework");
    expect(text).toContain("Framework catalog");
    expect(text).toContain("Regional policy profiles");
    expect(text).toContain("Asset decision trace");
    expect(text).toContain("Governance exception registry");
    expect(text).toContain("NIST");
    expect(text).toContain("ISO27001");
    expect(text).toContain("PCI_DSS");
    expect(text).toContain("OWASP");
    expect(text).toContain("INDIA_ENTERPRISE");
    expect(text).toContain("Regional policy");
    expect(text).toContain("Applicable controls");
    const selects = [...container.querySelectorAll("select")];
    expect(selects.length).toBeGreaterThan(0);
    expect(selects[0].value).not.toBe("");
    act(() => root.unmount());
  });
});

describe("AssetDetailPage — PHASE 4 Adaptive Governance panel (jsdom render probe)", () => {
  beforeAll(async () => {
    await enterpriseDemo.scan(HERO, "manual");
  });

  it("renders policy selection, applicable controls grid and exception governance actions", async () => {
    const { root, container } = mount();
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("Adaptive governance");
    expect(text).toContain("Policy selection");
    expect(text).toContain("INDIA_ENTERPRISE");
    expect(text).toContain("Applicable controls");
    expect(text).toContain("14 applicable");
    expect(text).toContain("Governance exceptions");
    expect(text).toContain("Request governance exception");
    expect([...container.querySelectorAll("button")].some((b) => b.textContent?.includes("Request exception"))).toBe(true);
    act(() => root.unmount());
  });
});

describe("DashboardPage — PHASE 4 regional & framework posture panel (jsdom render probe)", () => {
  it("renders the posture panel with byRegion/byFramework rows and the governance deep link", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();
    const text = container.textContent ?? "";
    act(() => root.unmount());
    expect(text).toContain("Regional & framework posture");
    expect(text).toContain("By region");
    expect(text).toContain("By framework");
    expect(text).toContain("India");
    expect(text).toContain("Singapore");
    expect(text).toContain("United States");
    expect(text).toContain("AT RISK");
    expect(text).toContain("Open enterprise governance");
  });
});

describe("EnterpriseAuditPage — PHASE 4 governance events audited (jsdom render probe)", () => {
  it("renders governance exception events with dedicated chips in the ledger", async () => {
    const created = enterpriseDemo.requestException({
      controlId: "TLS-001",
      assetId: HERO,
      reason: "Legacy TLS for backward compatibility",
      requestedBy: "Demo Operator",
      expiresInDays: 30,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/app/enterprise/audit"]}>
          <Routes>
            <Route path="/app/enterprise/audit" element={<EnterpriseAuditPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();
    const text = container.textContent ?? "";
    act(() => root.unmount());
    expect(text).toContain("Enterprise Audit Trail");
    expect(text).toContain("GOVERNANCE EXCEPTION REQUESTED");
    expect(text).toContain(`governance:${created.id}`);
  });
});