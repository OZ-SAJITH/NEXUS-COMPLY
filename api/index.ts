/**
 * Vercel Serverless entrypoint for the NEXUS-COMPLY REST API.
 *
 * Hosts the Express API at /api/* on the SAME origin as the Vite frontend.
 * Previously the SPA catch-all rewrite in vercel.json sent every POST —
 * including /api/auth/login — to index.html, and static hosts reject POSTs
 * with 405 Not Allowed. Routing /api/* to this Function fixes that.
 */
import "dotenv/config";
import { createApp } from "../apps/api/src/app";
import { seedIfEmpty } from "../apps/api/src/services/seed";
import { ensureDemoUsers } from "../apps/api/src/services/auth";
import { backfillReviewData } from "../apps/api/src/services/reviewService";
import express from "express";

// Vercel serverless filesystems are read-only except /tmp. The JSON storage
// backend writes data/db.json; jsonRepo re-reads DATA_DIR when each repository
// instance is constructed (at request time, after this body has run), so the
// seeded demo audits and the demo login accounts materialize under /tmp.
if (process.env.VERCEL && !process.env.DATA_DIR) {
  process.env.DATA_DIR = "/tmp/nexus-data";
}

let warm = false;
let warming: Promise<void> | null = null;

function warmup(): Promise<void> {
  if (warm) return Promise.resolve();
  warming ??= (async () => {
    try {
      await seedIfEmpty();
      await ensureDemoUsers();
      await backfillReviewData();
    } catch (err) {
      console.error("[vercel] warmup failed", err);
    } finally {
      warm = true;
    }
  })();
  return warming;
}

const inner = createApp();

// Some static/edge routing layers deliver the request with the rewrite target
// (/api) instead of the original path. Normalize so the Express app mounted at
// /api never sees a bare path it cannot route.
const app = express();
app.use((req, _res, next) => {
  if (!req.url.startsWith("/api")) {
    req.url = `/api${req.url}`;
  }
  next();
});

// Guarantee demo identities + seeded data exist before the inner app routes,
// so /api/auth/login always finds its users even on a cold Function instance.
app.use((_req, _res, next) => {
  warmup()
    .then(() => next())
    .catch(next);
});

app.use(inner);

export default app;