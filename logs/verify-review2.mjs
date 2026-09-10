import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
const out = [];

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("form", { timeout: 15000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 20000 });
}

try {
  // Reviewer: sealed chip should now be present after the earlier finalize
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
  await page.click('a[href="/app/reviews"]');
  await page.waitForSelector("table", { timeout: 15000 });
  await page.waitForTimeout(600);
  const seals = await page.locator("table").locator("text=/Sealed/i").count();
  out.push(`queue pending view: sealed rows visible (expect 0, filtered out): ${seals}`);
  await page.click('button:has-text("RESOLVED")');
  await page.waitForTimeout(500);
  const sealedRows = await page.locator("table tbody tr").count();
  const sealedChips = await page.locator("table").locator("text=/Sealed/i").count();
  out.push(`queue [RESOLVED] view: rows=${sealedRows} with sealed chip: ${sealedChips}`);

  // Analyst: NO actionable buttons inside the table rows
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await ctxA.newPage();
  await login(pageA, "analyst@nexus-comply.sih", "demo-analyst");
  await pageA.click('a[href="/app/reviews"]');
  await pageA.waitForSelector('table', { timeout: 15000 });
  await pageA.waitForSelector("text=/View-only analyst access/i", { timeout: 15000 });
  const inTableButtons = await pageA.locator("table tbody button").count();
  const approveTextInTable = await pageA.locator("table tbody text=Approve").count().catch(() => -1);
  out.push(`analyst queue: tbody buttons=${inTableButtons} | 'Approve' text rows inside table=${approveTextInTable} | view-only notice: ok`);

  // Analyst finding detail: no approve/reject buttons
  await pageA.locator('a[href^="/app/findings/"]').first().click();
  await pageA.waitForURL("**/app/findings/**", { timeout: 15000 });
  await pageA.waitForSelector("text=/View-only access/i", { timeout: 15000 });
  const detailButtons = await pageA.locator('button:has-text("Approve"), button:has-text("Reject"), button:has-text("Request changes")').count();
  out.push(`analyst finding detail: review-action buttons present=${detailButtons}`);

  console.log(out.join("\n"));
  await ctx.close();
  await ctxA.close();
} catch (e) {
  console.error("MAIN ERROR:", e);
  console.error("partial:\n" + out.join("\n"));
} finally {
  await browser.close();
}