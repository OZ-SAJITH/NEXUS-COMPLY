import "dotenv/config";
import express from "express";
import cors from "cors";
import { apiRouter } from "./routes";
import { ApiError } from "./services/reviewService";
import { attachSystemUser } from "./services/auth";

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // No authentication: every request acts as the built-in system reviewer so
  // review decisions and audit-trail entries are always recorded.
  app.use("/api", attachSystemUser);

  app.use("/api", apiRouter);

  // Structured error handling for known failures (validation / authorization /
  // invalid transitions / multer), plus a safe 500 fallback.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: err.message });
    }
    const message = err.message ?? "Internal server error";
    if (/file type|file too large|LIMIT/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    console.error("[api] unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}