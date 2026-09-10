import { chromium } from "playwright-core";

const APP = "http://localhost:5173";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("input[type=email]", { timeout: 15000 });
await page.fill("input[type=email]", "reviewer@nexus-comply.sih");
await page.fill("input[type=password]", "demo-reviewer");
await page.click("button[type=submit]");
await page.waitForSelector("main", { timeout: 20000 });
await page.waitForTimeout(800);

const geom = () =>
  page.evaluate(() => {
    const aside = document.querySelector("aside[aria-label=Sidebar]");
    const drawer = [...document.querySelectorAll("aside[aria-label=Sidebar]")].find((el) => el !== aside && el.getBoundingClientRect().width > 0) || null;
    const main = document.querySelector("main");
    const header = document.querySelector("header.sticky");
    const title = document.querySelector("main h1");
    const b = (e) => (e ? (() => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; })() : null);
    const cs = aside ? getComputedStyle(aside) : null;
    return {
      vw: window.innerWidth,
      aside: b(aside),
      drawer: b(drawer),
      asideCssW: cs ? cs.width : null,
      main: b(main),
      header: b(header),
      title: b(title),
      hOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

const out = [];
const check = (label, g) => {
  const asideVis = g.aside && g.aside.w > 0 && g.aside.l === 0;
  const ok = asideVis ? g.main.l >= g.aside.r : true;
  const headerOk = asideVis ? g.header.l >= g.aside.r : true;
  const titleOk = g.title && g.title.l >= (asideVis ? g.aside.r : 0) && g.title.r <= g.main.r;
  out.push(`${label}: ${ok ? "PASS" : "FAIL"} (sidebarR=${g.aside ? g.aside.r : "-"} mainL=${g.main.l} hdrL=${g.header.l} title=[${g.title ? g.title.l : "-"},${g.title ? g.title.r : "-"}] hOv=${g.hOverflow}px asideW=${g.asideCssW})`);
};

for (const w of [1920, 1440, 1366, 1280, 1024]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(300);
  check(`dashboard @ ${w}`, await geom());
}
for (const route of ["/app/compliance", "/app/reviews", "/app/audits/history"]) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 15000 });
  await page.waitForTimeout(600);
  check(`${route} @ 1366`, await geom());
}
await page.setViewportSize({ width: 1366, height: 900 });
await page.goto(`${APP}/app`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("main", { timeout: 15000 });
await page.waitForTimeout(600);
check("back to dashboard @ 1366", await geom());
await page.screenshot({ path: "logs/layout-final-1366.png", fullPage: false });

await page.setViewportSize({ width: 1024, height: 900 });
await page.waitForTimeout(300);
await page.screenshot({ path: "logs/layout-final-1024.png", fullPage: false });

await page.setViewportSize({ width: 430, height: 900 });
await page.waitForTimeout(300);
const openMenu = page.locator("button[aria-label='Open menu']");
if (await openMenu.count()) {
  await openMenu.click();
  await page.waitForTimeout(400);
  const g = await geom();
  const drawerW = g.drawer ? g.drawer.w : -1;
  const drawerOk = g.drawer && g.drawer.l === 0 && drawerW <= Math.round(0.85 * window_width(g));
  out.push(`mobile drawer @ 430: ${drawerW}px, l=${g.drawer ? g.drawer.l : "-"} → ${drawerOk ? "PASS" : "FAIL"} (drawer overlay, main l=0)`);
}
console.log(out.join("\n"));

function window_width(g) { return g.vw; }

await browser.close();