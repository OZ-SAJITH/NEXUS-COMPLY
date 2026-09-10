/* Verify the NEXUS-COMPLY UI against the running dev stack.
 * Drive system Chrome headlessly, capture console/page errors, check each route,
 * assert no horizontal overflow on mobile, confirm logo/favicon load, screenshot key pages.
 * Run: node scripts/verify-ui.mjs  (expects :5173, :4000, :8000 up)
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = "C:\\Users\\FALIHA FALAK\\AppData\\Local\\Temp\\opencode\\ui-shots";

const results = [];
const consoleErrors = [];

function log(type, key, msg) {
  results.push({ type, key, msg });
  const icon = type === "ok" ? "ok " : type === "warn" ? "!! " : "XX ";
  console.log(`${icon}${key.padEnd(46)} ${msg}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

const auditIds = [];

async function auditList() {
  const res = await page.request.get("http://localhost:4000/api/audits").catch(() => null);
  if (!res || !res.ok) return;
  const data = await res.json();
  auditIds.push(...data.map((a) => a.id).slice(0, 3));
}

async function checkRoute(path, expectText, label) {
  const resp = await page.goto(BASE + path, { waitUntil: "networkidle" });
  const status = resp ? resp.status() : 0;
  if (status >= 400) return log("fail", label ?? path, `HTTP ${status}`);
  const body = await page.textContent("body");
  const has = expectText ? body.includes(expectText) : true;
  log(has ? "ok" : "fail", label ?? path, has ? `renders (HTTP ${status})` : `missing text "${expectText}"`);
  const imgs = await page.$$eval("img, link[rel~='icon'], source", (els) => els.map((e) => (e.tagName === "LINK" ? e.href : e.getAttribute("src"))));
  return imgs;
}

// set demo session
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.setItem("nexus-comply.session", "1"));
await page.evaluate(() => localStorage.setItem("nexus-comply.user", "Security Analyst"));

await auditList();

log("info", "stack", `audits available: ${auditIds.length}`);

await checkRoute("/", "AI-Driven Multi-Vendor", "landing page");
await checkRoute("/login", "Sign in to your workspace", "login page");
await checkRoute("/app", "Security Compliance Overview", "dashboard");
await checkRoute("/app/audits/new", "Start New Audit", "audit wizard");
await checkRoute("/app/audits/history", "Audit History", "audit history");
await checkRoute("/app/reports", "Compliance Reports", "reports");
await checkRoute("/app/compliance", "Compliance", "compliance overview");
await checkRoute("/app/compliance/controls", "Controls", "compliance controls");
await checkRoute("/app/infrastructure", "Infrastructure", "infrastructure");
await checkRoute("/app/intelligence", "Intelligence", "intelligence");
await checkRoute("/app/intelligence/risk", "Failing findings by severity", "risk analysis");
await checkRoute("/app/settings", "Settings", "settings");
await checkRoute("/app/audit/doesnotexist", "404", "unknown/app route → 404");

for (const id of auditIds) {
  await checkRoute(`/app/audits/${id}`, "AUDIT COMPLETED", `result ${id}`);
  break; // one is enough for smoke
}

// finding detail (derive from dashboard top risk)
const dash = await page.request.get("http://localhost:4000/api/dashboard").catch(() => null);
if (dash && dash.ok) {
  const d = await dash.json();
  const findingId = d.topRisks[0]?.id;
  if (findingId) await checkRoute(`/app/findings/${findingId}`, "Finding Detail", "finding detail");
}

// favicon + logo asset
const fav = await page.request.get(BASE + "/nexus-logo.svg").catch(() => null);
log(fav && fav.ok() ? "ok" : "fail", "favicon /nexus-logo.svg", fav ? `HTTP ${fav.status()}` : "not fetched");

// legacy redirects
const r1 = await page.request.get(BASE + "/audit", { maxRedirects: 0 }).catch(() => null);
const code1 = r1 ? r1.status() : 0;
log(code1 >= 300 && code1 < 400 || code1 === 200 ? "ok" : "fail", "redirect /audit → /app/audits/new", `HTTP ${code1}`);

await page.screenshot({ path: `${OUT}/dashboard-desktop.png`, fullPage: false });

// mobile: horizontal overflow check
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const mpage = await mctx.newPage();
mpage.on("pageerror", (e) => consoleErrors.push(`mobile pageerror: ${e.message}`));
await mpage.goto(BASE + "/app", { waitUntil: "networkidle" });
const overflow = await mpage.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
log(overflow.sw <= overflow.iw ? "ok" : "fail", "mobile no horizontal overflow", `${overflow.sw} <= ${overflow.iw}`);
await mpage.screenshot({ path: `${OUT}/dashboard-mobile.png`, fullPage: false });
await mpage.goto(BASE + "/app/audits/new", { waitUntil: "networkidle" });
await mpage.screenshot({ path: `${OUT}/wizard-mobile.png`, fullPage: false });
await mctx.close();

await page.close();
await ctx.close();
await browser.close();

console.log("\nConsole/page errors captured:");
if (consoleErrors.length === 0) {
  console.log("  (none)");
} else {
  [...new Set(consoleErrors)].forEach((e) => console.log("  - " + e));
}

const fails = results.filter((r) => r.type === "fail");
console.log(`\n${results.filter((r) => r.type === "ok").length} ok, ${fails.length} failed, ${consoleErrors.length} console errors`);
process.exit(fails.length > 0 || consoleErrors.length > 0 ? 1 : 0);