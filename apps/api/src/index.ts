import "dotenv/config";
import { createApp } from "./app";
import { seedIfEmpty, seedEnterpriseIfEmpty } from "./services/seed";
import { backfillReviewData } from "./services/reviewService";

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();

app.listen(PORT, async () => {
  console.log(`[nexus-api] listening on http://localhost:${PORT}`);
  try {
    await seedIfEmpty();
    await seedEnterpriseIfEmpty();
    // Migrate any existing AI-generated findings into the Human Review Queue.
    await backfillReviewData();
  } catch (err) {
    console.error("[nexus-api] startup seed/migration failed", err);
  }
});