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
  let fresh = errors.slice(before);
  ok(fresh.length === 0, "Generate AI plan → inline panel rendered, no console errors", fresh.join(" | ").slice(0, 300));

  let t = await bodies(page);
  ok(/ai remediation intelligence complete[^a-z]*status now planned/.test(t), "workflow notice confirms PLANNED after generation", "");
  ok(t.includes("ai remediation intelligence"), "panel header rendered", "");
  ok(t.includes("baseline remediation guidance"), "source badge labels baseline guidance (deterministic)", "");
  ok(t.includes("root cause"), "root cause section rendered", "");
  ok(t.includes("evidence used"), "evidence-used section rendered", "");
  ok(t.includes("recommended actions") && t.includes("set minimum tls version"), "recommended actions (SET_TLS_MIN_VERSION prose)", "");
  ok(t.includes("approval required"), "approval-required badge on actions", "");
  ok(t.includes("pre-checks") && t.includes("validation plan"), "pre-checks + validation plan sections", "");
  ok(t.includes("rollback plan") && t.includes("expected result"), "rollback plan + expected result sections", "");
  ok(t.includes("change risk") && t.includes("confidence"), "change risk + confidence rendered", "");
  ok(t.includes("why this remediation?"), "collapsible why-this-remediation section present", "");
  await page.screenshot({ path: "logs/phase6-ai-panel.png", fullPage: true });

  before = errors.length;
  await page.click('button:has-text("Regenerate AI plan")');
  await page.waitForFunction(() => document.body.textContent.toLowerCase().includes("regenerate ai plan") && document.body.textContent.includes("v2"), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  fresh = errors.slice(before);
  ok(fresh.length === 0, "Regenerate AI plan → v2, no console errors", fresh.join(" | ").slice(0, 300));
  t = await bodies(page);
  ok(/v2/.test(t) && t.includes("ai remediation intelligence"), "regeneration bumps version to v2 (never overwrites)", "");

  before = errors.length;
  await page.click('button:has-text("Why this remediation?")');
  await page.waitForFunction(() => document.body.textContent.toLowerCase().includes("the ai never executes changes"), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  fresh = errors.slice(before);
  ok(fresh.length === 0, "why-this-remediation expands reasoning chain, no console errors", fresh.join(" | ").slice(0, 300));
  t = await bodies(page);
  ok(/evidence:/.test(t) && /action:/.test(t) && /approval: this change requires a human approval/.test(t), "reasoning chain shows Evidence/Action/Approval lines", "");
  await page.screenshot({ path: "logs/phase6-why-expanded.png", fullPage: true });

  await page.goto(BASE + "/app/enterprise/audit", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("main", { timeout: 15000 });
  await page.waitForTimeout(900);
  const audit = await bodies(page);
  ok(audit.includes("ai remediation intelligence generated"), "audit — AI_REMEDIATION_INTELLIGENCE_GENERATED event present", "");

  console.log(`\n=== ${errors.length} console errors (incl. recount) ===`);
  if (errors.length) console.log(errors.join("\n"));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `\n${fails} FAILURES` : "\nALL CHECKS PASSED");
} finally {
  await browser.close();
}