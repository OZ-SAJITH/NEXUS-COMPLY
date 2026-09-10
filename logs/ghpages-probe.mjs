import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json" };

const server = http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.startsWith("/NEXUS-COMPLY/")) urlPath = urlPath.slice("/NEXUS-COMPLY".length);
    else if (urlPath === "/NEXUS-COMPLY") { res.writeHead(302, { Location: "/NEXUS-COMPLY/" }); res.end(); return; }
    if (urlPath === "/" || urlPath.endsWith("/")) urlPath += "index.html";
    let f = path.join(dist, urlPath);
    const missing = !fs.existsSync(f) || fs.statSync(f).isDirectory();
    if (missing) f = path.join(dist, "404.html");
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); res.end("404"); return; }
      res.writeHead(missing ? 404 : 200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      res.end(b);
    });
  })
  .listen(4174, "127.0.0.1");

const BASE = "http://127.0.0.1:4174/NEXUS-COMPLY";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const out = [];

for (const route of ["/", "/login", "/app/audits/new", "/dashboard"]) {
  const page = await browser.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push("console:" + m.text().slice(0, 120)); });
  page.on("pageerror", (e) => errs.push("pageerror:" + String(e).slice(0, 120)));
  page.on("requestfailed", (r) => errs.push("failed:" + r.url().slice(BASE.length)));
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const check = await page.evaluate(() => {
    const img = document.querySelector("img[src*='nexus-comply-logo.png']");
    return {
      title: (document.querySelector("title")?.textContent || "").slice(0, 40),
      h1: (document.querySelector("h1, .page-enter h1")?.textContent || "").slice(0, 40),
      rootChildren: document.getElementById("root")?.childElementCount ?? -1,
      logoLoaded: img ? img.complete && img.naturalWidth > 0 : "none",
      path: window.location.pathname,
    };
  });
  out.push(`${route.padEnd(16)} -> path=${check.path} root=${check.rootChildren} h1="${check.h1}" logo=${check.logoLoaded} errs=${errs.length ? errs.join(" | ") : "none"}`);
  await page.close();
}

console.log(out.join("\n"));
await browser.close();
server.close();
process.exit(0);