import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { accountsRouter } from "./routes/accounts.routes";
import { transactionsRouter } from "./routes/transactions.routes";
import { categoriesRouter } from "./routes/categories.routes";
import { budgetsRouter } from "./routes/budgets.routes";
import { goalsRouter } from "./routes/goals.routes";
import { billsRouter } from "./routes/bills.routes";
import { subscriptionsRouter } from "./routes/subscriptions.routes";
import { creditCardsRouter } from "./routes/creditCards.routes";
import { loansRouter } from "./routes/loans.routes";
import { investmentsRouter } from "./routes/investments.routes";
import { netWorthRouter } from "./routes/netWorth.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { reportsRouter } from "./routes/reports.routes";
import { importRouter } from "./routes/import.routes";
import { exportRouter } from "./routes/export.routes";
import { backupRouter } from "./routes/backup.routes";
import { notificationsRouter } from "./routes/notifications.routes";
import { connectionsRouter } from "./routes/connections.routes";
import { syncRouter } from "./routes/sync.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { errorHandler, HttpError, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  // Any real production host (Render, Railway, Fly.io, a Nginx/Caddy reverse proxy) sits the app
  // behind exactly one proxy hop, which rewrites the client's real IP into X-Forwarded-For.
  // Without this, express-rate-limit keys every request off the proxy's own IP (one shared bucket
  // for every user — either locks everyone out together or, if trust proxy is misconfigured the
  // other way, becomes spoofable via a client-supplied X-Forwarded-For). `1` means "trust exactly
  // one hop," not "trust any proxy" — safe for a single reverse-proxy/PaaS deployment.
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header (native apps' non-fetch requests, curl, server-to-server) — allow.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new HttpError(403, "Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  // 4mb accommodates a base64-encoded receipt image (capped at ~2.2MB binary — see
  // receiptImageSchema in transactions.controller.ts); every other endpoint's body is far smaller.
  app.use(express.json({ limit: "4mb" }));
  app.use(mongoSanitize());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/budgets", budgetsRouter);
  app.use("/api/goals", goalsRouter);
  app.use("/api/bills", billsRouter);
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/credit-cards", creditCardsRouter);
  app.use("/api/loans", loansRouter);
  app.use("/api/investments", investmentsRouter);
  app.use("/api/net-worth", netWorthRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/import", importRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/backup", backupRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/connections", connectionsRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
