import { describe, it, expect, beforeAll } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { enterpriseDemo } from "../src/demo/enterpriseStore";
import AssetDetailPage from "../src/pages/enterprise/AssetDetailPage";
import ConnectorsPage from "../src/pages/enterprise/ConnectorsPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
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