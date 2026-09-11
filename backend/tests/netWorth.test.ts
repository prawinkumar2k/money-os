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

describe("net worth", () => {
  it("computes assets minus liabilities across bank balance, investments, credit card debt, and loans", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "nw-user@example.com");

    // Asset: ₹40,000 savings account.
    await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Savings", institution: "Bank", type: "savings", balance: 40000 });

    // Liability: credit card with ₹8,000 outstanding.
    await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Visa", institution: "Bank", type: "credit_card", balance: -8000, creditLimit: 50000 });

    // Asset: investment currently worth ₹5,000 (10 units @ ₹500 manual price).
    const invRes = await request(app)
      .post("/api/investments")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Gold ETF", type: "gold", currentPrice: 500 });
    await request(app)
      .post(`/api/investments/${invRes.body.investment._id}/buy`)
      .set("Authorization", `Bearer ${token}`)
      .send({ units: 10, pricePerUnit: 400 });

    // Liability: loan with ₹20,000 remaining principal.
    await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Personal Loan", principal: 20000, interestRate: 10, tenureMonths: 24, startDate: new Date().toISOString() });

    const res = await request(app).get("/api/net-worth").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Assets: 40000 (bank) + 5000 (investment @ current price 500 * 10 units) = 45000
    expect(res.body.totalAssets).toBe(45000);
    // Liabilities: 8000 (credit card) + 20000 (loan) = 28000
    expect(res.body.totalLiabilities).toBe(28000);
    expect(res.body.netWorth).toBe(45000 - 28000);
  });

  it("records a daily snapshot and returns it in history", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "nw-history-user@example.com");
    await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Savings", institution: "Bank", type: "savings", balance: 10000 });

    await request(app).get("/api/net-worth").set("Authorization", `Bearer ${token}`);

    const historyRes = await request(app).get("/api/net-worth/history?days=30").set("Authorization", `Bearer ${token}`);
    expect(historyRes.body.snapshots).toHaveLength(1);
    expect(historyRes.body.snapshots[0].netWorth).toBe(10000);
  });

  it("never leaks one user's net worth data to another", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "nw-a@example.com");
    const tokenB = await registerUser(app, "nw-b@example.com");

    await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Savings", institution: "Bank", type: "savings", balance: 100000 });

    const nwA = await request(app).get("/api/net-worth").set("Authorization", `Bearer ${tokenA}`);
    const nwB = await request(app).get("/api/net-worth").set("Authorization", `Bearer ${tokenB}`);

    expect(nwA.body.netWorth).toBe(100000);
    expect(nwB.body.netWorth).toBe(0);
  });
});
