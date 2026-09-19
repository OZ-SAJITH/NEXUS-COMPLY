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

  await page.click('button:has-text("Discover Assets")');
  await page.waitForFunction(() => document.body.innerText.includes("15 new assets discovered"), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  let rows = await page.locator("table tbody tr").count();
  ok(rows === 37, "first discovery — table has 37 rows", `rows=${rows}`);

  await page.click('button:has-text("Discover Assets")');
  await page.waitForFunction(() => document.body.innerText.includes("0 new assets discovered"), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const notice2 = await page.evaluate(() => document.body.innerText.match(/Discovery run [^\n]*/)?.[0] ?? "");
  rows = await page.locator("table tbody tr").count();
  ok(rows === 37, "second discovery — idempotent, still 37 rows (no duplicates)", `rows=${rows}`);
  ok(/0 new assets discovered/.test(notice2), "second discovery notice", notice2 || "no notice");

  await page.goto(BASE + "/app/enterprise/assets/ast-fw-sg-01", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("main", { timeout: 20000 });
  await page.waitForSelector('button:has-text("Scan now")', { timeout: 20000 });
  await page.waitForTimeout(500);
  const detail0 = await page.evaluate(() => document.body.innerText);
  ok(/FW-SG-01/.test(detail0), "wave detail — FW-SG-01 header", "");
  ok(/DMZ/.test(detail0), "wave detail — zone/context (DMZ)", "");
  ok(/No scan on record/.test(detail0), "wave detail — unscanned state visible", "");

  // The firewall adapter is seeded NETWORK_BLOCKED / OFFLINE: scanning a
  // firewall before connecting must be gated by the connector foundation.
  await page.goto(BASE + "/app/enterprise/connectors", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('main .card', { timeout: 20000 });
  const paloCard = page.locator('main .card').filter({ hasText: "Palo Alto Firewall Adapter" });
  await paloCard.locator('button:has-text("Test connection")').click();
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll(".card"));
      const card = cards.find((c) => c.textContent?.includes("Palo Alto Firewall Adapter"));
      return card ? /ONLINE/.test(card.textContent ?? "") : false;
    },
    null,
    { timeout: 15000 }
  );
  ok(true, "connector foundation — Palo Alto adapter restored to ONLINE via Test connection", "");

  await page.goto(BASE + "/app/enterprise/assets/ast-fw-sg-01", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('button:has-text("Scan now")', { timeout: 20000 });
  await page.click('button:has-text("Scan now")');
  await page.waitForFunction(() => document.body.innerText.includes("complete —"), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const detail = await page.evaluate(() => document.body.innerText);
  ok(/Findings \(\d+\)/.test(detail), "wave detail — findings appear after scan + connect", "");
  ok(/Evidence \(\d+\)/.test(detail), "wave detail — evidence appears after scan + connect", "");
  ok(/integrity sha256|integrity-hash/.test(detail), "wave detail — integrity-hashed evidence", "");
  ok(/Risk posture/.test(detail), "wave detail — risk posture", "");

  ok(errors.length === 0, "no console/page errors", errors.length ? errors.join(" | ").slice(0, 400) : "clean");

  console.log(`\n=== ${errors.length} console errors ===`);
  if (errors.length) console.log(errors.join("\n"));
  console.log(fails ? `\n${fails} FAILURES` : "\nALL CHECKS PASSED");
  process.exitCode = fails ? 1 : 0;
} finally {
  await browser.close();
}