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
  await page.goto(BASE + "/app/enterprise", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('button:has-text("Discover Assets")', { timeout: 20000 });
  const before = errors.length;
  await page.click('button:has-text("Discover Assets")');
  await page.waitForFunction(() => document.body.innerText.includes("new assets discovered"), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const notice = await page.evaluate(() => document.body.innerText.match(/Discovery run [^\n]*/)?.[0] ?? "");
  ok(errors.length === before, "Discovery run completes", notice || "no notice");

  await page.goto(BASE + "/app/enterprise/assets/ast-api-gateway-01", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('button:has-text("Scan now")', { timeout: 20000 });
  await page.click('button:has-text("Scan now")');
  await page.waitForFunction(() => document.body.innerText.includes("complete —"), null, { timeout: 20000 });
  await page.waitForTimeout(700);
  ok(true, "Manual scan completes", (await page.evaluate(() => document.body.innerText.match(/Scan [^\n]*complete[^\n]*/)?.[0] ?? "")));

  const after = await page.evaluate(() => document.body.innerText);
  ok(/Findings \(\d+\)/.test(after), "findings rendered", "");
  ok(/Evidence \(\d+\)/.test(after), "evidence section rendered", "");
  ok(/integrity sha256/.test(after), "integrity-hashed evidence shown", "");

  await page.click('button:has-text("Analyze") >> nth=0');
  await page.waitForSelector('text=AI finding analysis', { timeout: 20000 });
  await page.waitForTimeout(400);
  const modal = await page.evaluate(() => document.body.innerText);
  ok(/Evidence grounding/.test(modal), "analysis modal — evidence grounding", "");
  ok(/Root cause hypothesis/i.test(modal), "analysis modal — root cause", "");
  await page.click('button:has-text("Close")');

  await page.click('button:has-text("Plan remediation") >> nth=0');
  await page.waitForURL("**/app/enterprise/remediation", { timeout: 20000 });
  await page.waitForTimeout(900);
  const remText = await page.evaluate(() => document.body.innerText);
  const cards = await page.locator("main .card").count();
  const plannedBadges = await page.locator('main .card span:has-text("PLANNED")').count();
  ok(cards >= 6, "workflow shows the new remediation card alongside seeded one", `cards=${cards}`);
  ok(plannedBadges >= 2, "two PLANNED remediation cards (seeded + newly planned)", `planned-badges=${plannedBadges}`);
  ok(/closed loop/i.test(remText), "closed-loop section visible", "");

  console.log(`\n=== ${errors.length} console errors ===`);
  if (errors.length) console.log(errors.join("\n"));
  console.log(fails ? `\n${fails} FAILURES` : "\nALL CHECKS PASSED");
  process.exitCode = fails ? 1 : 0;
} finally {
  await browser.close();
}