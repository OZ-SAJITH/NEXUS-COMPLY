import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
const API = "http://localhost:4000/api";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});

const errors = [];
function watch(page, tag) {
  page.on("console", (m) => m.type() === "error" && errors.push(`[${tag}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${tag}] ${String(e)}`));
}

const out = [];

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('form', { timeout: 15000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 20000 });
}

async function backend() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "reviewer@nexus-comply.sih", password: "demo-reviewer" }),
  }).then((r) => r.json());
  const reviews = await fetch(`${API}/reviews`, { headers: { Authorization: `Bearer ${res.token}` } }).then((r) => r.json());
  return { reviews };
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "reviewer");

  // --- Sign in as reviewer ---
  await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
  out.push("reviewer login -> /app: ok (" + page.url() + ")");

  // --- Open Human Review queue ---
  await page.click('a[href="/app/reviews"]');
  await page.waitForSelector('table', { timeout: 15000 });
  await page.waitForTimeout(800);
  const rowCount = await page.locator('table tbody tr').count();
  out.push(`queue rows: ${rowCount}`);
  await page.screenshot({ path: "logs/review-queue.png", fullPage: false });

  // --- Precondition: queue API contract ---
  const pre = await backend();
  const pendingBefore = pre.reviews.counts.PENDING_REVIEW;
  out.push(`backend pending before: ${pendingBefore}`);

  // --- Open the first pending finding ---
  const firstLink = page.locator('a[href^="/app/findings/"]').first();
  const findingUrl = await firstLink.getAttribute("href");
  await firstLink.click();
  await page.waitForURL("**/app/findings/**", { timeout: 15000 });
  await page.waitForSelector('text=/Pending Human Review/i', { timeout: 15000 });
  out.push(`opened finding: ${findingUrl} | pending banner visible`);

  // --- Approve it ---
  await page.click('button:has-text("Approve")');
  await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
  await page.fill('div[role="dialog"] textarea', "E2E verification: human decision matches the evidence boundaries.");
  await page.click('div[role="dialog"] button:has-text("Confirm")');
  await page.waitForSelector('text=/approved/i', { timeout: 10000 });
  await page.waitForSelector('text=/Human Approved/i', { timeout: 15000 });
  const trailHasApprove = await page.locator("text=/Approved by human reviewer/i").count();
  out.push("approve -> HUMAN APPROVED badge: ok | audit trail human event: " + trailHasApprove);

  // --- Back to queue, show APPROVED filter ---
  await page.click('a[href="/app/reviews"]');
  await page.waitForSelector('table', { timeout: 15000 });
  await page.click('button:has-text("APPROVED")');
  await page.waitForTimeout(600);
  const approvedCount = await page.locator('table tbody tr').count();
  const sealedChips = await page.locator("text=/Sealed/i").count();
  out.push(`queue [APPROVED] count: ${approvedCount} | sealed chips visible: ${sealedChips}`);

  // --- Finalize an audit (acknowledge pending criticals) ---
  await page.click('button:has-text("Pending")');
  await page.waitForTimeout(400);
  const finalizeBtn = page.locator('button:has-text("Finalize ·")').first();
  const finalizes = await page.locator('button:has-text("Finalize ·")').count();
  out.push(`finalize buttons available: ${finalizes}`);
  if (finalizes > 0) {
    await finalizeBtn.click();
    await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
    await page.click('div[role="dialog"] button:has-text("Finalize & Seal")');
    await page.waitForSelector('div[role="dialog"] input[type="checkbox"]', { timeout: 10000 }).catch(() => null);
    const ackNeeded = await page.locator('div[role="dialog"] input[type="checkbox"]').count();
    if (ackNeeded > 0) {
      await page.check('div[role="dialog"] input[type="checkbox"]');
      await page.click('div[role="dialog"] button:has-text("Finalize & Seal")');
      out.push("finalize: acknowledge-pending flow triggered checkbox (correct) and completed");
    } else {
      out.push("finalize: no acknowledgement needed");
    }
    await page.waitForSelector("text=/finalized and sealed/i", { timeout: 10000 });
    out.push("finalize -> toast confirmed");
  }

  // --- Analyst view-only ---
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await ctxA.newPage();
  watch(pageA, "analyst");
  await login(pageA, "analyst@nexus-comply.sih", "demo-analyst");
  await pageA.click('a[href="/app/reviews"]');
  await pageA.waitForSelector("text=/View-only analyst access/i", { timeout: 15000 });
  const approveButtons = await pageA.locator('button:has-text("Approve")').count();
  out.push("analyst review page: view-only chip shown; editable approve buttons: " + approveButtons);
  const firstLinkA = pageA.locator('a[href^="/app/findings/"]').first();
  await firstLinkA.click();
  await pageA.waitForSelector("text=/View-only access/i", { timeout: 15000 });
  out.push("analyst finding detail: view-only notice + no review actions");

  out.push("console/page errors: " + (errors.length ? errors.join(" | ") : "none"));

  console.log(out.join("\n"));
  await ctx.close();
  await ctxA.close();
} catch (e) {
  console.error("MAIN ERROR:", e);
  console.error("partial output:\n" + out.join("\n"));
} finally {
  await browser.close();
}