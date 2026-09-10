import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const resp = await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  const frame = page.frame({ name: "", url: "about:srcdoc" }) ?? page.frames().find((f) => f !== page.mainFrame());

  const bg = await page.evaluate(() => {
    const wrap = Array.from(document.querySelectorAll("div"))
      .find((d) => d.firstElementChild?.tagName === "IFRAME" && d.className.includes("pointer-events-none"));
    const iframe = wrap?.querySelector("iframe");
    return {
      wrapFound: !!wrap,
      iframeTitle: iframe?.title ?? null,
      iframeSize: iframe ? [iframe.clientWidth, iframe.clientHeight] : null,
      wrapClass: wrap?.className ?? null,
      logoCount: document.querySelectorAll('img[alt="NEXUS-COMPLY"]').length,
      submitPresent: !!document.querySelector('button[type="submit"]'),
    };
  });

  let frameOk = "no-frame";
  try {
    frameOk = await frame.evaluate(() => {
      const canvas = document.getElementById("flow-canvas");
      const role = canvas?.getAttribute("data-threeui-role");
      const ready = document.body.getAttribute("data-threeui-ready");
      return { hasCanvas: !!canvas, role, ready, canvasSize: canvas ? [canvas.width, canvas.height] : null };
    });
  } catch (e) {
    frameOk = "error " + String(e);
  }

  // form must remain usable -> submit navigates
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  await page.waitForTimeout(1200);
  const landedOnApp = page.url().includes("/app");

  console.log("HTTP:", resp?.status());
  console.log("gateway frame:", JSON.stringify(frame ? { title: frame.url() } : null));
  console.log("bg wrapper:", JSON.stringify(bg));
  console.log("iframe content:", JSON.stringify(frameOk));
  console.log("form submit -> /app:", landedOnApp);
  console.log("console errors:", consoleErrors.length ? consoleErrors.join(" | ") : "none");
  console.log("page errors:", pageErrors.length ? pageErrors.join(" | ") : "none");
  await page.close();
} catch (e) {
  console.error("MAIN ERROR:", e);
} finally {
  await browser.close();
}