import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:5173/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);
  const frame = page.frames().find((f) => f !== page.mainFrame());

  async function snapshot() {
    return frame.evaluate(() => {
      const canvas = document.getElementById("flow-canvas");
      const x = Math.floor(canvas.width / 2);
      const y = Math.floor(canvas.height / 2);
      const px = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
      let bright = 0;
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) bright++;
      return { alpha: px[3], brightPx: bright, running: typeof window.__SF_CONTROLS !== "undefined" };
    });
  }

  const a = await snapshot();
  await page.waitForTimeout(700);
  const b = await snapshot();
  console.log("sample1:", JSON.stringify(a));
  console.log("sample2:", JSON.stringify(b));
  console.log("animating:", JSON.stringify(a) !== JSON.stringify(b));
  await page.close();
} finally {
  await browser.close();
}