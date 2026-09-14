import { chromium } from "playwright-core";

const BASE = "http://localhost:4173";
const EXEC = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const noise = /favicon|net::|ERR_|Failed to load resource/i;
const errors = [];

function watch(page, tag) {
  page.on("console", (m) => m.type() === "error" && !noise.test(m.text()) && errors.push(`[${tag}] console: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${String(e).slice(0, 500)}`));
}

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
watch(page, "all");

const checks = [];
function check(ok, label, extra) {
  checks.push({ ok, label, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  -> " + extra : ""}`);
}

let failed = 0;
async function goto(path, want) {
  const tag = path;
  const errsBefore = errors.length;
  try {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(want || "main", { timeout: 20000 });
    await page.waitForTimeout(900);
  } catch (e) {
    check(false, `${path} — render`, String(e).slice(0, 300));
    failed++;
    return;
  }
  const newErrs = errors.slice(errsBefore);
  check(newErrs.length === 0, `${path} — no console/page errors`, newErrs.length ? newErrs.join(" | ").slice(0, 400) : "clean");
  if (newErrs.length) failed += newErrs.length;
}

const text = async () =>
  (await page.evaluate(() => document.body.innerText));

try {
  await goto("/app/enterprise", "main");

  const assetsText = await text();
  check(/Total Assets|Total assets/i.test(assetsText), "Assets — stat cards", "");
  check(/Regional footprint|Region/i.test(assetsText), "Assets — regional footprint summary", "");
  check(/Discover Assets/i.test(assetsText), "Assets — discover button", "");
  const rowCount = await page.locator("table tbody tr").count();
  check(rowCount >= 22, `Assets — table rows`, `rows=${rowCount}`);
  const search = await page.locator('input[type="search"], input[placeholder*="earch"]').count();
  const selects = await page.locator("select").count();
  check(search >= 1, "Assets — search box", `inputs=${search}`);
  check(selects >= 5, "Assets — filter dropdowns", `selects=${selects}`);
  await page.screenshot({ path: "logs/enterprise-assets.png", fullPage: true });

  await goto("/app/enterprise/topology", "main");
  const topoText = await text();
  check(/Tier 1|TIER 1|Tier1|Critical Infrastructure/.test(topoText), "Topology — tier flow present", "");
  check(/Tier 3|TIER 3|Tier3/.test(topoText), "Topology — tier 3 present", "");
  await page.screenshot({ path: "logs/enterprise-topology.png", fullPage: true });

  await goto("/app/enterprise/connectors", "main");
  const connText = await text();
  const connButtons = await page.locator("button:has-text('Test connection')").count();
  check(/authorized remediation actions/i.test(connText) && connButtons >= 15, "Connectors — connector cards", `buttons=${connButtons}`);
  check(/online|degraded/i.test(connText), "Connectors — stat cards", "");

  await goto("/app/enterprise/remediation", "main");
  const remText = await text();
  const remCards = await page.locator("main .card").count();
  check(/Closed loop/i.test(remText), "Remediation — page rendered", "");
  check(remCards >= 4, "Remediation — stat + workflow cards", `cards=${remCards}`);
  const remButtons = await page.locator("button:has-text('Validate')").count();
  check(remButtons >= 1, "Remediation — actionable cards", `validate-buttons=${remButtons}`);

  await goto("/app/enterprise/audit", "main");
  const audText = await text();
  const audCards = await page.locator("main .card").count();
  check(/events ·/.test(audText), "Audit — counters present", "");
  check(audCards >= 1, "Audit — event cards", `cards=${audCards}`);

  await goto("/app/enterprise/assets/ast-api-gateway-01", "main");
  const detailText = await text();
  check(/ast-api-gateway-01/.test(detailText), "Detail — hero asset header", "");
  check(/TLS-001|PKI-002|findings?|Findings/i.test(detailText), "Detail — findings listed", "");
  await page.screenshot({ path: "logs/enterprise-asset-detail.png", fullPage: true });

  const allFail = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length} checks, ${checks.length - allFail.length} pass, ${allFail.length} fail, console errors: ${errors.length} ===`);
  console.log("ERRORS:\n" + (errors.join("\n") || "(none)"));
  process.exitCode = allFail.length || failed ? 1 : 0;
} finally {
  await browser.close();
}