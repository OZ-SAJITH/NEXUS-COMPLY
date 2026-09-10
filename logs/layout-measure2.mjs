import { chromium } from "playwright-core";

const APP = process.env.APP_URL || "http://localhost:5173";
const EXEC = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

async function login(page) {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[type=email]", { timeout: 15000 });
  await page.fill("input[type=email]", "reviewer@nexus-comply.sih");
  await page.fill("input[type=password]", "demo-reviewer");
  await page.click("button[type=submit]");
  await page.waitForSelector("main", { timeout: 20000 });
  await page.waitForTimeout(700);
}

const geom = (page) =>
  page.evaluate(() => {
    const aside = document.querySelector("aside[aria-label=Sidebar]");
    const main = document.querySelector("main");
    const header = document.querySelector("header.sticky");
    const b = (e) => (e ? (() => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; })() : null);
    return {
      vw: window.innerWidth,
      sOverflow: document.documentElement.scrollWidth - window.innerWidth,
      aside: b(aside),
      main: b(main),
      header: b(header),
    };
  });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await login(page);

await page.setViewportSize({ width: 1366, height: 900 });
await page.waitForTimeout(250);
console.log("dashboard expanded :", JSON.stringify(await geom(page)));

await page.click("button[aria-label='Collapse sidebar']");
await page.waitForTimeout(300);
const g1 = await geom(page);
const overlap1 = Math.max(0, g1.aside.r - g1.main.l);
console.log("dashboard collapsed :", JSON.stringify(g1), "OVERLAP=" + overlap1);

await page.click("button[aria-label='Expand sidebar']");
await page.waitForTimeout(300);

const audits = await page.locator("a[href^='/app/audits']").first();
if (await audits.count()) await audits.click();
await page.waitForTimeout(700);
const g2 = await geom(page);
console.log("audit history page  :", JSON.stringify(g2), "OVERLAP=" + Math.max(0, g2.aside.r - g2.main.l));

const first = page.locator("a[href^='/app/findings/'], a[href^='/app/audits/']").first();
if (await first.count()) {
  await first.click();
  await page.waitForTimeout(700);
  const g3 = await geom(page);
  console.log("opened record page  :", JSON.stringify(g3), "OVERLAP=" + Math.max(0, g3.aside.r - g3.main.l));
}

await browser.close();