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

const text = async () => (await page.evaluate(() => document.body.innerText));

async function goto(path, settle = 1200) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("main", { timeout: 20000 });
  await page.waitForTimeout(settle);
}

try {
  await goto("/app", 2200);
  let t = await text();
  check(/evidence-driven score/i.test(t), "Dashboard — compliance summary strip (score)", "");
  check(/passed/i.test(t) && /failed/i.test(t) && /warnings/i.test(t), "Dashboard — passed/failed/warnings totals", "");
  check(/finding lifecycle/i.test(t), "Dashboard — lifecycle breakdown panel", "");
  check(/open/i.test(t), "Dashboard — OPEN lifecycle chip", "");
  await page.screenshot({ path: "logs/phase3-dashboard-summary.png", fullPage: false });

  await goto("/app/enterprise/assets/ast-api-gateway-01");
  t = await text();
  check(/TLS-001/i.test(t), "Detail — TLS-001 finding listed", "");
  check(/why is this a finding/i.test(t), "Detail — 'Why is this a finding?' present", "");
  check(/lifecycle/i.test(t), "Detail — lifecycle label present", "");

  const whyButtons = await page.locator('button:has-text("Why is this a finding?")').count();
  check(whyButtons >= 1, "Detail — why-toggle buttons", `buttons=${whyButtons}`);

  await page.locator('button:has-text("Why is this a finding?")').first().click();
  await page.waitForTimeout(500);
  t = await text();
  check(/observed/i.test(t) && /expected/i.test(t) && /recommended fix/i.test(t), "Detail — why-panel shows observed/expected/recommended fix", "");

  const lifecycleSelects = page.getByLabel(/lifecycle/i);
  const selects = await lifecycleSelects.count();
  check(selects >= 1, "Detail — lifecycle selects present", `selects=${selects}`);

  await lifecycleSelects.first().selectOption("ACKNOWLEDGED");
  await page.waitForTimeout(600);
  t = await text();
  check(/ACKNOWLEDGED/i.test(t), "Detail — lifecycle flipped to ACKNOWLEDGED", "");
  await page.screenshot({ path: "logs/phase3-lifecycle-acknowledged.png", fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20000 });
  await page.waitForTimeout(900);
  t = await text();
  check(/ACKNOWLEDGED/i.test(t), "Detail — lifecycle persists across reload", "");

  await goto("/app/enterprise/audit", 1200);
  t = await text();
  check(/finding lifecycle changed/i.test(t), "Audit — FINDING LIFECYCLE CHANGED event recorded", "");
  await page.screenshot({ path: "logs/phase3-audit-lifecycle-event.png", fullPage: false });

  const allFail = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length} checks, ${checks.length - allFail.length} pass, ${allFail.length} fail, console errors: ${errors.length} ===`);
  console.log("ERRORS:\n" + (errors.join("\n") || "(none)"));
  process.exitCode = allFail.length || errors.length ? 1 : 0;
} finally {
  await browser.close();
}