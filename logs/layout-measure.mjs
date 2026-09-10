import { chromium } from "playwright-core";

const APP = process.env.APP_URL || "http://localhost:5173";
const EXEC = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const WIDTHS = [1920, 1600, 1440, 1366, 1280, 1100, 1024, 900, 768, 430, 375];

async function login(page) {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[type=email]", { timeout: 15000 });
  await page.fill("input[type=email]", "reviewer@nexus-comply.sih");
  await page.fill("input[type=password]", "demo-reviewer");
  await page.click("button[type=submit]");
  await page.waitForSelector("main", { timeout: 20000 });
  await page.waitForTimeout(900);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await login(page);

const out = [];
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  const r = await page.evaluate(() => {
    const aside = document.querySelector("aside[aria-label=Sidebar]");
    const mainCol = document.querySelector("div.relative.z-10");
    const main = document.querySelector("main");
    const header = document.querySelector("header.sticky");
    const title = document.querySelector("main h1");
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), w: Math.round(b.width) };
    };
    return {
      viewport: window.innerWidth,
      docScrollW: document.documentElement.scrollWidth,
      aside: rect(aside),
      mainCol: rect(mainCol),
      main: rect(main),
      header: rect(header),
      title: rect(title),
    };
  });
  const asideVis = r.aside && r.aside.l === 0 && r.aside.w > 0;
  const mainLeft = r.main ? r.main.l : null;
  const asideRight = r.aside ? r.aside.r : null;
  const overlap = asideVis && mainLeft !== null ? Math.max(0, asideRight - mainLeft) : 0;
  const horizOverflow = r.docScrollW - r.viewport;
  out.push(
    `w=${String(w).padStart(4)}: sidebar=${asideVis ? `visible ${r.aside.w}px (r=${asideRight})` : "hidden"} | mainLeft=${mainLeft} | mainRight=${r.main ? r.main.r : "-"} | headerLeft=${r.header ? r.header.l : "-"} | title.l=${r.title ? r.title.l : "-"} | OVERLAP=${overlap}px | hOverflow=${horizOverflow}px`
  );
}
console.log(out.join("\n"));

const w = 1366;
await page.setViewportSize({ width: w, height: 900 });
await page.waitForTimeout(300);
await page.screenshot({ path: "logs/layout-1366.png", fullPage: false });
await browser.close();