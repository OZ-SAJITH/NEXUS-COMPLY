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
  await page.waitForSelector("form", { timeout: 15000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 20000 });
}

try {
  // ===== 1. Amber orb REMOVED — sidebar + header logos stay cyan-only =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "amber");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("aside .nexus-logo", { timeout: 15000 });
    await page.waitForTimeout(1500);
    const sidebarClass = await page.locator("aside .nexus-logo").first().getAttribute("class");
    const amber = await page.evaluate(() => {
      const bad = [];
      // The old amber orb was an amber HALO around the mark. That is banned.
      // Amber rings/badges around the logo are removed entirely — the area
      // beside the NEXUS logo contains nothing but intentional branding.
      document.querySelectorAll(".nexus-logo__halo").forEach((el) => {
        const bg = getComputedStyle(el).backgroundImage || "";
        if (bg.includes("245, 158, 11")) bad.push(`halo bg=${bg.slice(0, 60)}`);
      });
      document.querySelectorAll(".nexus-logo__ring, .nexus-logo__badge").forEach((el) => bad.push(`decor=${el.className}`));
      const anyHalo = Array.from(document.querySelectorAll(".nexus-logo__halo")).map((el) => (getComputedStyle(el).backgroundImage || "").slice(0, 90));
      return { bad, anyHalo };
    });
    const badgeWidth = await page.evaluate(() => {
      const b = document.querySelector("aside .nexus-logo__badge");
      return b ? b.getBoundingClientRect().width : 0;
    });
    out.push(`amber: sidebar class="${sidebarClass}"`);
    out.push(`amber: amber HALO elements on page=${amber.bad.length} ${amber.bad.join(" | ")} (expect 0 — orb stays banned)`);
    out.push(`amber: cyan halo bg samples="${amber.anyHalo[0]}"`);
    out.push(`amber: review badge/ring beside sidebar logo=${badgeWidth > 0 ? "PRESENT!" : "absent"} (expect absent — no orange circle)`);
    await page.screenshot({ path: "logs/motion2-sidebar.png", clip: { x: 0, y: 0, width: 340, height: 900 } });
    await ctx.close();
  }

  // ===== 2. Route transition visible (page-enter runs + box blurs/pans) =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "routes");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("main > div.page-enter", { timeout: 15000 });
    await page.click('main a[href="/app/reports"]');
    await page.waitForSelector("text=/Generate report/i", { timeout: 15000 });
    const anim = await page.evaluate(() => {
      const el = document.querySelector("main > div.page-enter");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { name: cs.animationName, dur: cs.animationDuration, delay: cs.animationDelay };
    });
    out.push(`routes: main page-enter animation=${anim?.name} ${anim?.dur} delay=${anim?.delay} (expect page-enter 0.38s)`);
    await ctx.close();
  }

  // ===== 3. Audit result: ring draws 0→score, stats count up, tabs underline =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "result");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.click('a[href="/app/audits/history"]');
    await page.waitForSelector('main table a[href^="/app/audits/"]', { timeout: 15000 });
    const target = await page.evaluate(async () => {
      const list = await (await fetch("/api/audits")).json();
      const good = list.find((a) => a.compliance && a.compliance.score > 50);
      return good ? good.id : list[0].id;
    });
    await page.click(`main table a[href="/app/audits/${target}"]`, { timeout: 15000 });
    await page.waitForSelector('text=/Executive summary/i', { timeout: 15000 });

    const enterUps = await page.locator(".enter-up").count();
    const enterAnim = await page.evaluate(() => {
      const el = document.querySelector(".enter-up");
      return el ? getComputedStyle(el).animationName : null;
    });
    out.push(`result: staggered .enter-up blocks=${enterUps} | animation="${enterAnim}" | score audit=${target.slice(0, 8)}…`);

    const ring = page.locator('.glass-card:has-text("Executive summary") svg circle >> nth=1');
    const scoreText = page.locator('.glass-card:has-text("Executive summary") div.absolute.inset-0 span.text-2xl');
    await page.waitForTimeout(120);
    const dashStart = await ring.getAttribute("stroke-dasharray");
    await page.waitForTimeout(1600);
    const dashLate = await ring.getAttribute("stroke-dasharray");
    const scoreLate = (await scoreText.textContent()) ?? "";
    const sumLate = await page.locator('.glass-card:has-text("Executive summary") div.grid.grid-cols-2 div.rounded-lg [class*="text-2xl"]').count();
    out.push(`result: compliance ring dash start="${dashStart}" late="${dashLate}" (drawn 0→score=${dashLate !== dashStart})`);
    out.push(`result: compliance score count-up final="${scoreLate}" | SumStat tiles=${sumLate}`);

    await page.click('button.tab-btn:has-text("Findings")');
    await page.waitForTimeout(500);
    const underline = await page.evaluate(() => {
      const el = [...document.querySelectorAll(".tab-btn")].find((b) => b.classList.contains("tab-btn-active"));
      return el ? getComputedStyle(el, "::after").transform : "n/a";
    });
    out.push(`result: active tab underline transform="${underline}" (expect scaleX(1) matrix)`);
    await page.screenshot({ path: "logs/motion2-result.png", fullPage: false });
    await ctx.close();
  }

  // ===== 4. Real audit run → AIAnalysisAnimation bound to real aiStatus =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "audit");
    await login(page, "analyst@nexus-comply.sih", "demo-analyst");
    await page.click('a[href="/app/audits/new"]');
    await page.waitForSelector("text=/Start New Audit/i", { timeout: 15000 });
    const next = page.locator('button:has-text("Next")').first();
    await next.click();
    await page.waitForSelector('section[aria-label="Select assets"]', { timeout: 15000 });
    await page.click('section[aria-label="Select assets"] button >> nth=0');
    await page.waitForSelector('section[aria-label="Configure audit"]', { timeout: 15000 });
    await page.click('button:has-text("Run compliance audit")');
    await page.waitForSelector(".ai-stage", { timeout: 15000 });
    const stagesEarly = await page.locator(".ai-stage").count();
    const logoCls = await page.locator(".nexus-logo").first().getAttribute("class");
    out.push(`audit: AIAnalysisAnimation mounted stages=${stagesEarly} | logo="${logoCls?.split(" ").find((c) => c.startsWith("nexus-logo--"))}"`);
    await page.screenshot({ path: "logs/motion2-ai-analyzing.png", fullPage: false });

    const progressed = await page.waitForSelector(".ai-stage-run, .ai-stage.ai-stage-done", { timeout: 8000 }).then(() => true).catch(() => false);
    const runNow = await page.locator(".ai-stage.ai-stage-run").count();
    const doneNow = await page.locator(".ai-stage.ai-stage-done").count();
    const queuedNow = await page.locator("text=/QUEUED/").count();
    out.push(`audit: pipeline progressed=${progressed} | working=${runNow} | done=${doneNow} | queued text=${queuedNow}`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: "logs/motion2-ai-mid.png", fullPage: false });

    const allDone = await page
      .waitForFunction(() => document.querySelectorAll(".ai-stage.ai-stage-done").length === 4, { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    const successLogo = await page.locator(".nexus-logo--success").count();
    out.push(`audit: all 4 stages reach DONE on analysis step=${allDone} | signature logo SUCCESS flash=${successLogo > 0}`);
    await page.screenshot({ path: "logs/motion2-ai-complete.png", fullPage: false });

    const ok = await page
      .waitForSelector('text=/Audit completed/i', { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    const err = await page.waitForSelector('text=/Analysis interrupted/i', { timeout: 5000 }).then(() => true).catch(() => false);
    out.push(`audit: real run resolved to report-ready=${ok} | engine error state shown=${err}`);
    await ctx.close();
  }

  // ===== 5. Reduced motion: everything static, real-state badges still visible =====
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    watch(page, "reduced");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("main > div.page-enter", { timeout: 15000 });
    await page.waitForTimeout(600);
    const check = await page.evaluate(() => {
      const anims = [];
      document.querySelectorAll(".page-enter, .enter-up, .row-in, .nexus-logo *").forEach((el) => {
        const n = getComputedStyle(el).animationName;
        if (n !== "none") anims.push(el.classList.length ? el.className : "el");
      });
      const halo = document.querySelector("aside .nexus-logo__halo");
      return {
        running: anims.length,
        haloBg: halo ? (getComputedStyle(halo).backgroundImage || "").slice(0, 70) : "missing",
        intro: document.querySelectorAll(".nexus-logo--intro").length,
      };
    });
    out.push(`reduced: running animations=0 → got ${check.running} | intro=${check.intro} | haloBg="${check.haloBg}" (cyan only)`);
    await ctx.close();
  }

  // ===== 6. Mobile 390px: no overflow, logo cyan =====
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    watch(page, "mobile");
    await login(page, "reviewer@nexus-comply.sih", "demo-reviewer");
    await page.waitForSelector("aside .nexus-logo", { state: "attached", timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const haloBg = await page.evaluate(() => {
      const h = document.querySelector("aside .nexus-logo__halo");
      return h ? (getComputedStyle(h).backgroundImage || "").slice(0, 70) : "missing";
    });
    out.push(`mobile: horizontal overflow=${overflow}px (expect <=1) | sidebar haloBg="${haloBg}" (cyan only)`);
    await page.screenshot({ path: "logs/motion2-mobile.png", fullPage: false });
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