import { chromium } from "playwright-core";

const BASE = "http://localhost:4173";
const EXEC = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const noise = /favicon|net::|ERR_|Failed to load resource/i;
const errors = [];
function watch(page) {
  page.on("console", (m) => m.type() === "error" && !noise.test(m.text()) && errors.push(`[console] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[pageerror] ${String(e).slice(0, 400)}`));
}

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
  await page.waitForSelector('button:has-text("Validate in sandbox")', { timeout: 20000 });
  await page.screenshot({ path: "logs/sih-pipeline-before.png", fullPage: true });

  const steps = [
    ["Validate in sandbox", "VALIDATED"],
    ["Submit for approval", "PENDING_APPROVAL"],
    ["Approve", "APPROVED"],
    ["Execute", "COMPLETED"],
    ["Re-scan & verify", "VERIFIED"],
  ];

  for (const [label, status] of steps) {
    const before = errors.length;
    await page.click(`button:has-text("${label}")`);
    await page.waitForFunction(
      (s) => document.body.innerText.includes("status now " + s),
      status,
      { timeout: 15000 }
    );
    await page.waitForTimeout(600);
    const fresh = errors.slice(before);
    ok(fresh.length === 0, `${label} -> ${status}`, fresh.length ? fresh.join(" | ").slice(0, 300) : "no errors");
    if (fresh.length) errors.push("…(counted above)");
  }

  const t = await page.evaluate(() => document.body.innerText);
  ok(t.includes("status now VERIFIED"), "workflow ends VERIFIED (notice)", "");
  await page.locator("main .card > button").first().click();
  await page.waitForTimeout(300);
  const expanded = await page.evaluate(() => document.body.innerText);
  ok(/Verification:\s*PASS/i.test(expanded), "verification section shows PASS", "");
  ok(/before/i.test(expanded) && /after/i.test(expanded), "verification before/after compliance shown", "");
  ok(/triggered by auto_verify_scan/.test(expanded), "verification attributed to auto_verify_scan", "");
  await page.screenshot({ path: "logs/sih-verified.png", fullPage: true });

  await page.goto(BASE + "/app/enterprise/audit", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("main", { timeout: 15000 });
  await page.waitForTimeout(900);
  const audit = await page.evaluate(() => document.body.innerText);
  ok(/REMEDIATION VALIDATED/.test(audit), "audit — VALIDATED event", "");
  ok(/REMEDIATION APPROVED/.test(audit) && /REMEDIATION EXECUTED/.test(audit), "audit — APPROVED + EXECUTED", "");
  ok(/ASSET SCANNED/.test(audit), "audit — auto-verify ASSET SCANNED", "");
  ok(/REMEDIATION VERIFICATION PASSED/.test(audit), "audit — VERIFICATION PASSED", "");

  console.log(`\n=== ${errors.length} console errors (incl. recount) ===`);
  if (errors.length) console.log(errors.join("\n"));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `\n${fails} FAILURES` : "\nALL CHECKS PASSED");
} finally {
  await browser.close();
}