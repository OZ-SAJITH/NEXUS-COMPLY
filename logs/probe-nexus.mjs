import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
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

try {
  // ===== 1. Login: logo + intro sequence =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "login");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(".nexus-logo", { timeout: 15000 });
    const idle = await page.locator(".nexus-logo--idle").count();
    const introAtLoad = await page.locator(".nexus-logo--intro").count();
    out.push(`login: nexus-logo present (idle=${idle}) | intro at mount=${introAtLoad}>0`);
    const word = await page.locator(".nexus-logo__word").textContent();
    out.push(`login: wordmark="${word?.trim()}"`);
    await page.waitForTimeout(1900);
    const introAfter = await page.locator(".nexus-logo--intro").count();
    out.push(`login: intro cleared after 1.9s=${introAfter === 0}`);
    const halo = await page.locator(".nexus-logo__halo").count();
    const sweep = await page.locator(".nexus-logo__sweep").count();
    out.push(`login: halo=${halo} rings/sweeps present=${sweep > 0}`);
    await ctx.close();
  }

  // ===== 2. App sidebar logo reflects real review state + nav pill =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "app");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("aside .nexus-logo", { timeout: 15000 });
    await page.waitForTimeout(1200);
    const classList = await page.locator("aside .nexus-logo").first().getAttribute("class");
    out.push(`app: sidebar logo class="${classList}"`);
    const reviewState = (classList ?? "").includes("nexus-logo--review") ? (await page.locator("aside .nexus-logo--review").count()) : 0;
    const introPlayed = (classList ?? "").includes("nexus-logo--intro");
    out.push(`app: sidebar logo REVIEW_REQUIRED=${reviewState === 1} | boot intro played=${introPlayed}`);
    const activeNav = await page.locator(".nav-pill.nav-pill-active").count();
    const navSweeps = await page.locator("nav .nav-pill").count();
out.push(`app: nav pills=${navSweeps} | active sweep class present=${activeNav === 1}`);
    // collapse sidebar if toggle exists
    const toggle = page.locator("button[aria-label='Collapse sidebar']").first();
    if (await toggle.count()) {
      await toggle.click();
      await page.waitForTimeout(600);
      const tip = await page.locator("aside .nav-tip").count();
      const wm = await page.locator("aside .nexus-logo__word").count();
      out.push(`app: collapsed sidebar tooltips=${tip} | wordmark hidden on collapse=${wm === 0}`);
    } else {
      out.push("app: no sidebar collapse toggle found (skip tooltip check)");
    }
    await ctx.close();
  }

  // ===== 3. Dashboard: NexusCore + compliance split =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "dash");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector(".nexus-core", { timeout: 15000 });
    const coreState = await page.locator(".nexus-core").first().getAttribute("class");
    const chip = await page.locator(".nexus-core .chip").first().textContent();
    out.push(`dash: NexusCore present state-cls "${coreState?.split(" ").find((c) => c.startsWith("nexus-core--"))}" | chip="${chip?.trim()}"`);
    const aiRing = await page.locator("text=/AI ASSESSMENT/i").count();
    const humanRing = await page.locator("text=/HUMAN VERIFIED/i").count();
    const pendingChip = await page.locator("text=/PENDING REVIEW|ALL FINDINGS VERIFIED/").count();
    out.push(`dash: compliance split AI ASSESSMENT=${aiRing} | HUMAN VERIFIED=${humanRing} | pending chip=${pendingChip}`);
    await page.screenshot({ path: "logs/probe-dashboard.png", fullPage: false });
    await ctx.close();
  }

  // ===== 4. Report generation animation =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "reports");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.click('a[href="/app/reports"]');
    await page.waitForSelector("text=/Generate report/i", { timeout: 15000 });
    await page.click("button:has-text('Generate report')");
    const dialogVisible = await page.waitForSelector('div[role="dialog"]', { timeout: 10000 }).then(() => true).catch(() => false);
    const dialogTitle = dialogVisible ? await page.locator('div[role="dialog"]').first().textContent() : "";
    out.push(`reports: generation dialog opened=${dialogVisible} | "${dialogTitle?.slice(0, 60).trim()}"`);
    const steps = await page.locator('div[role="dialog"] .rg-step').count();
    out.push(`reports: rg-steps=${steps} (expect 4)`);
    await page.waitForSelector("text=/REPORT READY/i", { timeout: 20000 }).catch(() => null);
    const ready = await page.locator('div[role="dialog"]').first().textContent().then((t) => (t ?? "").includes("REPORT READY")).catch(() => false);
    out.push(`reports: reaches REPORT READY after real fetch=${ready}`);
    await page.screenshot({ path: "logs/probe-reports.png", fullPage: false });
    await ctx.close();
  }

  // ===== 4. Reduced motion: no running logo animations =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    watch(page, "reduced");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(".nexus-logo", { timeout: 15000 });
    const check = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll(".nexus-logo *").forEach((el) => {
        const anim = getComputedStyle(el).animationName;
        const tr = getComputedStyle(el).transitionDuration;
        if (anim !== "none") bad.push(el.classList.length ? el.className : "el");
      });
      return { running: bad.length, hasIntro: document.querySelectorAll(".nexus-logo--intro").length };
    });
    out.push(`reduced-motion: logo running animations=${check.running} | no intro class=${check.hasIntro === 0}`);
    await ctx.close();
  }

  // ===== 5. Mobile 390px: no overflow, menu present =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    watch(page, "mobile-login");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(".nexus-logo", { timeout: 15000 });
    const overflowLogin = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const popLogin = await page.keyboard.press("Escape").catch(() => null);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("h1", { timeout: 15000 });
    const overflowHome = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    out.push(`mobile: /login overflow=${overflowLogin}px | / overflow=${overflowHome}px (expect <=1)`);
    await ctx.close();
  }

  out.push("console/page errors: " + (errors.length ? errors.join(" | ") : "none"));
  console.log(out.join("\n"));
} catch (e) {
  console.error("MAIN ERROR:", e);
  console.error("partial output:\n" + out.join("\n"));
} finally {
  await browser.close();
}