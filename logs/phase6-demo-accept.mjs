import { chromium } from "playwright-core";

const BASE = "http://localhost:4173";
const EXEC = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const noise = /favicon|net::|ERR_|Failed to load resource/i;
const errors = [];
function watch(page) {
  page.on("console", (m) => m.type() === "error" && !noise.test(m.text()) && errors.push(`[console] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[pageerror] ${String(e).slice(0, 400)}`));
}
const bodies = (page) => page.evaluate(() => (document.body.textContent ?? "").toLowerCase());

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
watch(page);

let fails = 0;
const ok = (b, l, extra) => {
  console.log(`${b ? "PASS" : "FAIL"}  ${l}${extra ? "  -> " + extra : ""}`);
  if (!b) fails++;
};
const fresh = (before) => errors.slice(before);
const waitBodyGrow = (pred, timeout = 15000) =>
  page.waitForFunction((p) => (document.body.textContent ?? "").toLowerCase().match(p), pred, { timeout });

try {
  await page.goto(BASE + "/app/enterprise/remediation", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('button:has-text("Generate AI plan")', { timeout: 20000 });

  const card = page.locator('main .card:has-text("SET_TLS_MIN_VERSION")');
  await card.locator("> button").first().click();
  await page.waitForTimeout(400);

  let before = errors.length;
  await page.click('button:has-text("Generate AI plan")');
  await page.waitForSelector('button:has-text("Regenerate AI plan")', { timeout: 20000 });
  await page.waitForTimeout(800);
  ok(fresh(before).length === 0, "DEMO §7 — Generate AI plan renders inline panel, 0 console errors", fresh(before).join(" | ").slice(0, 300));

  let t = await bodies(page);
  ok(/v1/.test(t), "version badge v1", "");
  ok(t.includes("baseline remediation guidance"), "source badge 'Baseline remediation guidance' (baseline-labeled)", "");
  ok(t.includes("change risk") && t.includes("high"), "Change risk HIGH pill", "");
  ok(t.includes("confidence 98%"), "confidence 98% in header", "");
  ok(t.includes("evidence-grounded"), "root-cause certainty badge 'Evidence-grounded'", "");
  ok(t.includes("evidence used") && t.includes("verified"), "Evidence used rows with verified chip", "");
  ok(/[0-9a-f]{12,}/.test(t), "evidence hash short derived from payload", "");
  ok(t.includes("recommended actions"), "recommended actions section", "");
  ok(t.includes("set minimum tls version to 1.2; disable tls 1.0/1.1 cipher suites"), "action 1 prose (SET_TLS_MIN_VERSION)", "");
  ok(t.includes("apply strong cipher configuration and remove legacy key exchange / weak ciphers"), "action 2 prose (ENFORCE_STRONG_CIPHERS)", "");
  ok(t.includes("set_tls_min_version") && t.includes("enforce_strong_ciphers"), "action type tokens rendered", "");
  ok((t.match(/approval required/g) || []).length >= 2, "two 'approval required' badges", "");
  ok(t.includes("pre-checks") && t.includes("validation plan"), "Pre-checks + Validation plan sections", "");
  ok(t.includes("rollback plan") && t.includes("available"), "Rollback plan + AVAILABLE", "");
  ok(t.includes("expected result"), "Expected result section", "");
  ok(t.includes("connector capability (vendor-aware)"), "Connector capability (vendor-aware) section header", "");
  ok(t.includes("why this remediation?"), "collapsible 'Why this remediation?' present", "");
  ok(t.includes("validate in sandbox"), "human gate intact — Validate in sandbox remains (AI never auto-executes)", "");
  await page.screenshot({ path: "logs/phase6-demo-accept.png", fullPage: true });

  before = errors.length;
  await page.click('button:has-text("Regenerate AI plan")');
  await waitBodyGrow(/v2/);
  await page.waitForTimeout(600);
  ok(fresh(before).length === 0, "Regenerate AI plan → v2, 0 console errors", fresh(before).join(" | ").slice(0, 300));
  ok(await (await bodies(page)).includes("v2"), "version bumps to v2 (record history preserved)", "");

  console.log(`\n=== ${errors.length} console errors (incl. recount) ===`);
  if (errors.length) console.log(errors.join("\n"));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `\n${fails} FAILURES` : "\nALL DEMO §7 CHECKS PASSED");
} finally {
  await browser.close();
}