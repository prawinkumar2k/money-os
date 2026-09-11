import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://placeholder/test";
process.env.JWT_SECRET = "test-jwt-secret-please-ignore";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-please-ignore";
process.env.ENCRYPTION_KEY = "test-encryption-key";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { seedSystemCategories } = await import("../src/db/seedCategories");
  await seedSystemCategories();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerUser(app: import("express").Express, email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "correct-horse-battery", name: "Test User" });
  return res.body.accessToken as string;
}

const CSV = `Date,Description,Merchant,Amount
2026-01-05,Lunch order,Swiggy,-450
2026-01-10,Salary,Employer,50000
2026-01-15,Bad row,,not-a-number
`;

describe("CSV import", () => {
  it("parses a CSV, previews with categorization and duplicate detection, then saves only confirmed rows", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "import-user@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    const previewRes = await request(app)
      .post("/api/import/preview")
      .set("Authorization", `Bearer ${token}`)
      .field("accountId", account._id)
      .attach("file", Buffer.from(CSV), "statement.csv");

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.rowsTotal).toBe(3);
    expect(previewRes.body.rowsWithErrors).toBe(1);

    const goodRows = previewRes.body.rows.filter((r: { errors: string[] }) => r.errors.length === 0);
    expect(goodRows).toHaveLength(2);
    const swiggyRow = goodRows.find((r: { merchant: string }) => r.merchant === "Swiggy");
    expect(swiggyRow.suggestedCategory).toBe("Food");
    expect(swiggyRow.isDuplicate).toBe(false);

    const confirmRes = await request(app)
      .post("/api/import/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({
        accountId: account._id,
        filename: "statement.csv",
        rowsTotal: 3,
        rowsSkippedError: 1,
        rowsSkippedDuplicate: 0,
        transactions: goodRows.map((r: { date: string; description: string; merchant: string; amount: number; suggestedCategory: string | null }) => ({
          date: r.date,
          description: r.description,
          merchant: r.merchant,
          amount: r.amount,
          category: r.suggestedCategory,
        })),
      });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.import.rowsImported).toBe(2);

    const accountAfter = await request(app).get(`/api/accounts/${account._id}`).set("Authorization", `Bearer ${token}`);
    expect(accountAfter.body.account.balance).toBe(10000 - 450 + 50000);

    const txns = await request(app).get(`/api/transactions?accountId=${account._id}`).set("Authorization", `Bearer ${token}`);
    expect(txns.body.transactions.every((t: { source: string }) => t.source === "imported" || t.source === "manual")).toBe(true);
    expect(txns.body.transactions.filter((t: { source: string }) => t.source === "imported")).toHaveLength(2);
  });

  it("flags a re-imported row as a duplicate on the second preview", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "import-dup-user@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    const first = await request(app)
      .post("/api/import/preview")
      .set("Authorization", `Bearer ${token}`)
      .field("accountId", account._id)
      .attach("file", Buffer.from(CSV), "statement.csv");
    const goodRows = first.body.rows.filter((r: { errors: string[] }) => r.errors.length === 0);

    await request(app)
      .post("/api/import/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({
        accountId: account._id,
        transactions: goodRows.map((r: { date: string; description: string; merchant: string; amount: number }) => ({
          date: r.date,
          description: r.description,
          merchant: r.merchant,
          amount: r.amount,
        })),
      });

    const second = await request(app)
      .post("/api/import/preview")
      .set("Authorization", `Bearer ${token}`)
      .field("accountId", account._id)
      .attach("file", Buffer.from(CSV), "statement.csv");

    expect(second.body.rowsDuplicate).toBe(2);
  });

  it("rejects a preview request for another user's account", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "import-a@example.com");
    const tokenB = await registerUser(app, "import-b@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    const res = await request(app)
      .post("/api/import/preview")
      .set("Authorization", `Bearer ${tokenB}`)
      .field("accountId", account._id)
      .attach("file", Buffer.from(CSV), "statement.csv");

    expect(res.status).toBe(404);
  });
});
