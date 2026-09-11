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
    .send({ name: "Checking", institution: "Test Bank", type: "savings", balance: 100000 });
  return res.body.account;
}

describe("budgets", () => {
  it("computes spent/remaining/percentage from real transactions, excluding transfers and offsetting refunds", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "budget-user@example.com");
    const account = await createAccount(app, token);
    const otherAccount = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Savings", institution: "Test Bank", type: "savings", balance: 5000 })
    ).body.account;

    const budgetRes = await request(app)
      .post("/api/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Food", amount: 5000, period: "monthly" });
    expect(budgetRes.status).toBe(201);
    const budgetId = budgetRes.body.budget._id;

    const today = new Date().toISOString();

    // ₹2000 expense in Food.
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "expense", accountId: account._id, amount: -2000, date: today, description: "Groceries", category: "Food" });

    // ₹500 refund in Food — should offset the expense.
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "refund", accountId: account._id, amount: 500, date: today, description: "Refund", category: "Food" });

    // A transfer that happens to touch the same category string — must be excluded entirely.
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "transfer",
        fromAccountId: account._id,
        toAccountId: otherAccount._id,
        amount: 10000,
        date: today,
        description: "Move money",
      });

    const getRes = await request(app).get(`/api/budgets/${budgetId}`).set("Authorization", `Bearer ${token}`);
    expect(getRes.body.budget.spent).toBe(1500); // 2000 - 500
    expect(getRes.body.budget.remaining).toBe(3500);
    expect(getRes.body.budget.percentageUsed).toBe(30);
    expect(getRes.body.budget.alertLevel).toBeNull();
  });

  it("flags alert thresholds correctly as spending approaches the limit", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "budget-alert-user@example.com");
    const account = await createAccount(app, token);

    const budgetRes = await request(app)
      .post("/api/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Shopping", amount: 1000, period: "monthly" });
    const budgetId = budgetRes.body.budget._id;

    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "expense",
        accountId: account._id,
        amount: -950,
        date: new Date().toISOString(),
        description: "Big purchase",
        category: "Shopping",
      });

    const getRes = await request(app).get(`/api/budgets/${budgetId}`).set("Authorization", `Bearer ${token}`);
    expect(getRes.body.budget.percentageUsed).toBe(95);
    expect(getRes.body.budget.alertLevel).toBe(90);
  });

  it("never lets one user read or write another user's budget", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "budget-a@example.com");
    const tokenB = await registerUser(app, "budget-b@example.com");

    const budgetRes = await request(app)
      .post("/api/budgets")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ category: "Food", amount: 1000, period: "monthly" });
    const budgetId = budgetRes.body.budget._id;

    const getAsB = await request(app).get(`/api/budgets/${budgetId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const deleteAsB = await request(app).delete(`/api/budgets/${budgetId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });
});
