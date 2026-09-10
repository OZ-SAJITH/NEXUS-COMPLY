import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import zlib from "node:zlib";

const BASE = "http://localhost:5173";

function decodePNG(buf) {
  let off = 8, w = 0, h = 0, bd = 0, ct = 0;
  const ids = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const t = buf.toString("latin1", off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (t === "IDAT") ids.push(d);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(ids));
  const bpp = ct === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * (ct === 6 ? 4 : 3));
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    for (let x = 0; x < stride; x++) {
      const rb = raw[p++];
      const a = x >= bpp ? raw[p - 1 - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = rb;
      if (ft === 1) v = (rb + a) & 255;
      else if (ft === 2) v = (rb + b) & 255;
      else if (ft === 3) v = (rb + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (rb + pr) & 255;
      }
      prev[x] = v;
      const px = y * w * bpp + x * bpp;
      out[px] = v; out[px + 1] = raw[p];
      if (bpp === 4) out[px + 2] = raw[p + 1];
      p += bpp - 1;
    }
  }
  return { w, h, data: out };
}

const isWarm = (r, g, b) => r > 150 && g >= 60 && g <= 215 && b <= 160 && r > g && g > b;
function warmCount(im) {
  const { w, h, data } = im;
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (isWarm(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])) n++;
  }
  return n;
}

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

async function checkSidebar(page, label) {
  const res = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return { error: "no aside" };
    const ring = aside.querySelector(".nexus-logo__ring");
    const badge = aside.querySelector(".nexus-logo__badge");
    const amberEls = [];
    aside.querySelectorAll("*").forEach((el) => {
      const cs = getComputedStyle(el);
      const m = (cs.backgroundColor + " " + cs.borderTopColor + " " + cs.boxShadow + " " + cs.backgroundImage).match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)/g
      );
      if (!m) return;
      for (const seg of m) {
        const [_, r, g, b] = seg.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (+r > 150 && +g >= 60 && +g <= 215 && +b <= 160 && +r > +g && +g > +b) {
          amberEls.push(`${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").slice(0, 40)}`);
          return;
        }
      }
    });
    const logo = aside.querySelector(".nexus-logo");
    return {
      ring,
      badge,
      amberEls,
      logoVisible: !!logo && logo.getBoundingClientRect().width > 0,
    };
  });
  res.label = label;
  return res;
}

async function crossCheck(page, label) {
  const s = await checkSidebar(page, label);
  out.push(`${label}: ring=${s.ring ? "PRESENT(!)" : "absent"} badge=${s.badge ? "PRESENT(!)" : "absent"} amberEls=${JSON.stringify(s.amberEls)} logoVisible=${s.logoVisible}`);
  if (s.error) out.push(`${label}: ${s.error}`);
  if (s.ring || s.badge || s.amberEls.length > 0) out.push(`${label} => !! ORANGE CIRCLE STILL PRESENT !!`);
  return s;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("form", { timeout: 15000 });
  await page.fill("#email", "reviewer@nexus-comply.sih");
  await page.fill("#password", "demo-reviewer");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 20000 });
  await page.waitForTimeout(2600);
}

let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let page = await ctx.newPage();
watch(page, "main");
await login(page);
await page.waitForSelector("aside .nexus-logo", { timeout: 15000 });

await crossCheck(page, "dashboard (after login)");
await page.screenshot({ path: "logs/no-orange-dashboard.png" });

// route walk: audit history -> open an audit -> reviews -> compliance -> settings -> back
await page.click('a[href="/app/audits/history"]');
await page.waitForSelector("main table a[href^=\"/app/audits/\"]", { timeout: 15000 });
await crossCheck(page, "audit history");
const firstAudit = await page.$("main table a[href^=\"/app/audits/\"]");
await firstAudit.click();
await page.waitForSelector("main", { timeout: 15000 });
await page.waitForTimeout(1200);
await crossCheck(page, "open audit result");
await page.goto(`${BASE}/app/reviews`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("main", { timeout: 15000 });
await page.waitForTimeout(800);
await crossCheck(page, "human review");
await page.goto(`${BASE}/app/compliance`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("main", { timeout: 15000 });
await page.waitForTimeout(800);
await crossCheck(page, "compliance overview");
await page.goto(`${BASE}/app/settings`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("main", { timeout: 15000 });
await page.waitForTimeout(800);
await crossCheck(page, "settings");
await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("aside .nexus-logo", { timeout: 15000 });
await page.waitForTimeout(800);
await crossCheck(page, "back to dashboard (route walk)");

// HARD refresh (fresh load, no cache)
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("aside .nexus-logo", { timeout: 15000 });
await page.waitForTimeout(2600);
await crossCheck(page, "after hard refresh");

// collapse + expand
await page.click('button[aria-label="Collapse sidebar"]');
await page.waitForTimeout(500);
await crossCheck(page, "sidebar collapsed");
await page.click('button[aria-label="Expand sidebar"]');
await page.waitForTimeout(500);
await crossCheck(page, "sidebar expanded again");
await ctx.close();

// pixel scan (fresh context) — sidebar header strip at 3 widths
for (const width of [1024, 1440, 1920]) {
  const c2 = await browser.newContext({ viewport: { width, height: 900 } });
  const p2 = await c2.newPage();
  watch(p2, `w${width}`);
  await login(p2);
  await p2.waitForSelector("aside .nexus-logo", { timeout: 15000 });
  await p2.waitForTimeout(1200);
  const clipW = Math.min(276, width);
  const shot = await p2.screenshot({ clip: { x: 0, y: 0, width: clipW, height: 110 } });
  const wc = warmCount(decodePNG(shot));
  out.push(`pixel scan @${width}: sidebar header (${clipW}x110) warm pixels = ${wc} (expect ~0)`);
  if (wc < 5) writeFileSync(`logs/no-orange-w${width}.png`, shot);
  await c2.close();
}

out.push(errors.length ? `console/page errors: ${errors.join(" | ")}` : "console/page errors: none");
console.log(out.join("\n"));
await browser.close();