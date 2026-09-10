import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});

const noise = /ERR_CONNECTION_REFUSED|net::|Failed to load resource|favicon/i;
const errors = [];
function watch(page, tag) {
  page.on("console", (m) => m.type() === "error" && noise.test(m.text()) === false && errors.push(`[${tag}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${tag}] ${String(e)}`));
}

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
  // ===== 1. Sidebar lockup: full NEXUS-COMPLY, NO truncation =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "sidebar");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("aside .nexus-logo", { timeout: 15000 });
    await page.waitForTimeout(1400);
    const r = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      const lock = aside?.querySelector('a[aria-label="NEXUS-COMPLY workspace"]');
      const errs = [];
      let name = "", sub = "", overflow = -1, navItems = 0, indicator = "n/a", logoCls = "";
      if (lock) {
        const rows = lock.querySelectorAll("span.whitespace-nowrap");
        if (rows[0]) name = rows[0].textContent ?? "";
        if (rows[1]) sub = rows[1].textContent ?? "";
      }
      if (aside) overflow = aside.scrollWidth - aside.clientWidth;
      navItems = document.querySelectorAll("aside ul .nav-item-in").length;
      const bar = document.querySelector(".nav-pill.nav-pill-active");
      if (bar) indicator = getComputedStyle(bar, "::before").transform;
      const logo = document.querySelector("aside .nexus-logo");
      if (logo) logoCls = (logo.className.match(/nexus-logo--\w+/) || [])[0] || "";
      return { name, sub, overflow, navItems, indicator, logoCls };
    });
    out.push(`sidebar: full name="${r.name}" | tagline="${r.sub}" | horizontal overflow=${r.overflow}px | nav stagger items=${r.navItems}`);
    out.push(`sidebar: active indicator ::before transform="${r.indicator}" (expect matrix scaleX(1)) | logo state=${r.logoCls}`);
    await page.screenshot({ path: "logs/preview-sidebar.png", clip: { x: 0, y: 0, width: 360, height: 900 } });
    await ctx.close();
  }

  // ===== 2. Dashboard premium blocks =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "dash");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("main .cf", { timeout: 15000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const nodes = document.querySelectorAll("main .cf-node").length;
      const filled = document.querySelectorAll("main .cf-connector.filled").length;
      const activeDot = document.querySelector("main .cf-node-active");
      const activeBody = activeDot ? getComputedStyle(activeDot).animationName : "n/a";
      const byText = (root, needle) => [...root.querySelectorAll("div,section,main")].find((el) => (el.textContent || "").includes(needle));
      const gaugeCard = byText(document, "Risk distribution");
      const gaugeTxt = gaugeCard ? (gaugeCard.querySelector("svg") ? "svg" : "none") : "missing";
      const legend = [...document.querySelectorAll("main span.font-mono")].some((s) => /CRITICAL|HIGH|MEDIUM|LOW/.test(s.textContent ?? ""));
      const aiBar = [...document.querySelectorAll("main *")].some((e) => (e.textContent ?? "").includes("AI engine assessment"));
      const humanBar = [...document.querySelectorAll("main *")].some((e) => (e.textContent ?? "").includes("Human-verified score"));
      const activity = [...document.querySelectorAll("main h2")].find((h) => (h.textContent ?? "").includes("Live compliance activity"));
      const activityItems = activity ? activity.closest(".glass-card")?.querySelectorAll("ul li").length ?? 0 : -1;
      const sweep = document.querySelector(".nexus-core__sweep");
      const sweepAnim = sweep ? getComputedStyle(sweep).animationName : "n/a";
      const segLegend = byText(document, "Active findings")?.querySelector(".flex.flex-wrap") ? true : false;
      return { nodes, filled, activeBody, gauge: gaugeTxt, legend, aiBar, humanBar, activityItems, sweepAnim, segLegend };
    });
    out.push(`dash: lifecycle flow nodes=${r.nodes} | filled connectors=${r.filled} | active node anim=${r.activeBody}`);
    out.push(`dash: risk gauge=${r.gauge} | severity legend=${r.legend} | stacked-segment legend=${r.segLegend}`);
    out.push(`dash: AI-vs-human bars: AI engine=${r.aiBar} Human verified=${r.humanBar}`);
    out.push(`dash: live activity items=${r.activityItems} | NexusCore radar sweep anim="${r.sweepAnim}"`);
    await page.screenshot({ path: "logs/preview-dashboard.png", fullPage: false });
    await ctx.close();
  }

  // ===== 3. Logo WARNING/CRITICAL subtle status — never an air orb =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "logo");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("aside .nexus-logo", { timeout: 15000 });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const logo = document.querySelector("aside .nexus-logo");
      const cls = logo ? (logo.className.match(/nexus-logo--\w+/) || [])[0] || "" : "none";
      const haloBg = document.querySelector("aside .nexus-logo__halo") ? (getComputedStyle(document.querySelector("aside .nexus-logo__halo")).backgroundImage || "").slice(0, 80) : "no-halo";
      const ringAbsent = !document.querySelector("aside .nexus-logo__ring");
      const badgeAbsent = !document.querySelector("aside .nexus-logo__badge");
      return { cls, haloBg, ringAbsent, badgeAbsent };
    });
    out.push(`logo: state=${r.cls} | halo="${r.haloBg}" (cyan expected) | ring=${r.ringAbsent ? "absent" : "PRESENT"} | badge=${r.badgeAbsent ? "absent" : "PRESENT"} (no amber circle beside the logo)`);
    await ctx.close();
  }

  // ===== 4. Audit result: lifecycle strip + result regressions =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "result");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.click('a[href="/app/audits/history"]');
    await page.waitForSelector('main table a[href^="/app/audits/"]', { timeout: 15000 });
    const target = await page.evaluate(async () => {
      const list = await (await fetch("/api/audits")).json();
      return list[0].id;
    });
    await page.click(`main table a[href="/app/audits/${target}"]`, { timeout: 15000 });
    await page.waitForSelector('text=/Executive summary/i', { timeout: 15000 });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const flows = document.querySelectorAll("main .cf-node").length;
      const lifeLabel = [...document.querySelectorAll("main .chip")].map((c) => c.textContent?.trim()).find((t) => /VERIFIED|REVIEW|CRITICAL/.test(t ?? ""));
      const execCard = [...document.querySelectorAll("main .glass-card")].find((c) => (c.textContent || "").includes("Executive summary"));
      const ring = execCard ? execCard.querySelectorAll("svg circle")[1] : null;
      const dash = ring ? ring.getAttribute("stroke-dasharray") : "none";
      const enterUps = document.querySelectorAll(".enter-up").length;
      return { flows, lifeLabel, dash, enterUps };
    });
    out.push(`result: lifecycle nodes=${r.flows} | chip="${r.lifeLabel}" | exec ring dash="${r.dash}" | staggered blocks=${r.enterUps}`);
    await page.screenshot({ path: "logs/preview-audit-result.png", fullPage: false });
    await ctx.close();
  }

  // ===== 5. Reduced motion: everything static, real info still visible =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    watch(page, "reduced");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("main .cf", { timeout: 15000 });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      let running = 0;
      document.querySelectorAll("main .page-enter, main .enter-up, main .row-in, main .cf *, aside .nav-item-in, aside .nexus-logo *").forEach((el) => {
        const n = getComputedStyle(el).animationName;
        if (n !== "none") running += 1;
      });
      const firstNode = document.querySelector("main .cf-node");
      return { running, labelVisible: firstNode ? getComputedStyle(firstNode).opacity : "n/a" };
    });
    out.push(`reduced: running animations=0 → got ${r.running} | cf label opacity=${r.labelVisible}`);
    await ctx.close();
  }

  // ===== 6. Mobile 390px: no overflow, drawer shows full name =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    watch(page, "mobile");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("header button[aria-label='Open menu']", { timeout: 15000 });
    await page.click("header button[aria-label='Open menu']");
    await page.waitForSelector("aside.modal-panel .nexus-logo", { timeout: 15000 });
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const aside = document.querySelector("aside.modal-panel");
      const lock = aside?.querySelector('a[aria-label="NEXUS-COMPLY workspace"]');
      const name = lock ? (lock.querySelector("span.whitespace-nowrap")?.textContent ?? "") : "";
      const full = name.includes("NEXUS-COMPLY") && !name.includes("…") && !name.includes("...");
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      return { name, full, overflow };
    });
    out.push(`mobile: drawer brand="${r.name}" full-name=${r.full} | horizontal overflow=${r.overflow}px`);
    await page.screenshot({ path: "logs/preview-mobile.png", fullPage: false });
    await ctx.close();
  }

  out.push("console/page errors (non-CDN): " + (errors.length ? errors.join(" | ") : "none"));
  console.log(out.join("\n"));
} catch (e) {
  console.error("MAIN ERROR:", e);
  console.error("partial output:\n" + out.join("\n"));
} finally {
  await browser.close();
}