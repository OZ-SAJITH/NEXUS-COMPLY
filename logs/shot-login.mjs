import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:5173/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "logs/gateway-login.png" });
  await page.close();
} finally {
  await browser.close();
}