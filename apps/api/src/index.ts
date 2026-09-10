import "dotenv/config";
import { createApp } from "./app";
import { seedIfEmpty } from "./services/seed";
import { ensureDemoUsers } from "./services/auth";
import { backfillReviewData } from "./services/reviewService";

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();

app.listen(PORT, async () => {
  console.log(`[nexus-api] listening on http://localhost:${PORT}`);
  try {
    await seedIfEmpty();
    // Demo users (Security Analyst / Security Review Lead) + migrate any
    // existing AI-generated findings into the Human Review Queue.
    await ensureDemoUsers();
    await backfillReviewData();
  } catch (err) {
    console.error("[nexus-api] startup seed/migration failed", err);
  }
});