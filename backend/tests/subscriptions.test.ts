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

async function createAccount(app: import("express").Express, token: string) {
  const res = await request(app)
    .post("/api/accounts")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Checking", institution: "Test Bank", type: "savings", balance: 50000 });
  return res.body.account;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function seedRecurringTransactions(
  app: import("express").Express,
  token: string,
  accountId: string,
  merchant: string,
  amount: number
) {
  for (const days of [60, 30, 0]) {
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "expense",
        accountId,
        amount: -amount,
        date: daysAgo(days),
        description: `${merchant} charge`,
        merchant,
      });
  }
}

describe("subscription detection", () => {
  it("detects a recurring monthly charge, and confirming it removes it from detected and adds it to the confirmed list", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "sub-user@example.com");
    const account = await createAccount(app, token);
    await seedRecurringTransactions(app, token, account._id, "Netflix", 499);

    const detectedRes = await request(app).get("/api/subscriptions/detected").set("Authorization", `Bearer ${token}`);
    expect(detectedRes.status).toBe(200);
    const netflix = detectedRes.body.detected.find((d: { merchant: string }) => d.merchant === "netflix");
    expect(netflix).toBeDefined();
    expect(netflix.frequency).toBe("monthly");
    expect(netflix.amount).toBeCloseTo(499, 0);
    expect(netflix.monthlyCost).toBeCloseTo(499, 0);
    expect(netflix.occurrences).toBe(3);

    const confirmRes = await request(app)
      .post("/api/subscriptions/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ merchant: netflix.merchant, name: netflix.name, amount: netflix.amount, frequency: netflix.frequency });
    expect(confirmRes.status).toBe(201);

    const detectedAfter = await request(app).get("/api/subscriptions/detected").set("Authorization", `Bearer ${token}`);
    expect(detectedAfter.body.detected.find((d: { merchant: string }) => d.merchant === "netflix")).toBeUndefined();

    const listRes = await request(app).get("/api/subscriptions").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.subscriptions).toHaveLength(1);
    expect(listRes.body.totalMonthlyCost).toBeCloseTo(499, 0);
    expect(listRes.body.totalYearlyCost).toBeCloseTo(499 * 12, 0);
  });

  it("dismissing a detected candidate removes it from future detection results", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "sub-dismiss-user@example.com");
    const account = await createAccount(app, token);
    await seedRecurringTransactions(app, token, account._id, "Spotify", 199);

    const detectedRes = await request(app).get("/api/subscriptions/detected").set("Authorization", `Bearer ${token}`);
    const spotify = detectedRes.body.detected.find((d: { merchant: string }) => d.merchant === "spotify");
    expect(spotify).toBeDefined();

    await request(app)
      .post("/api/subscriptions/dismiss")
      .set("Authorization", `Bearer ${token}`)
      .send({ merchant: spotify.merchant, name: spotify.name });

    const detectedAfter = await request(app).get("/api/subscriptions/detected").set("Authorization", `Bearer ${token}`);
    expect(detectedAfter.body.detected.find((d: { merchant: string }) => d.merchant === "spotify")).toBeUndefined();
  });

  it("does not flag a one-off or highly irregular merchant as a subscription", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "sub-irregular-user@example.com");
    const account = await createAccount(app, token);

    // Only one transaction — not enough data to call it recurring.
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "expense", accountId: account._id, amount: -300, date: daysAgo(10), description: "One-off", merchant: "RandomShop" });

    const detectedRes = await request(app).get("/api/subscriptions/detected").set("Authorization", `Bearer ${token}`);
    expect(detectedRes.body.detected.find((d: { merchant: string }) => d.merchant === "randomshop")).toBeUndefined();
  });

  it("never lets one user cancel another user's confirmed subscription", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "sub-a@example.com");
    const tokenB = await registerUser(app, "sub-b@example.com");
    const accountA = await createAccount(app, tokenA);
    await seedRecurringTransactions(app, tokenA, accountA._id, "Prime Video", 299);

    const detected = await request(app).get("/api/subscriptions/detected").set("Authorization", `Bearer ${tokenA}`);
    const candidate = detected.body.detected[0];

    const confirmRes = await request(app)
      .post("/api/subscriptions/confirm")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ merchant: candidate.merchant, name: candidate.name, amount: candidate.amount, frequency: candidate.frequency });
    const subscriptionId = confirmRes.body.subscription._id;

    const cancelAsB = await request(app)
      .post(`/api/subscriptions/${subscriptionId}/cancel`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(cancelAsB.status).toBe(404);
  });
});
