import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
const p = await b.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 140)); });
p.on("requestfailed", (r) => console.log("REQFAIL:", r.url(), "->", r.failure()?.errorText));
p.on("request", (r) => { if (!r.url().startsWith("http://localhost:5173")) console.log("REQ:", r.url().slice(0, 120)); });
await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
await b.close();
