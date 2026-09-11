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

async function setupUserWithTransactions(app: import("express").Express, email: string) {
  const token = await registerUser(app, email);
  const account = (
    await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Checking", institution: "Bank", type: "savings", balance: 0 })
  ).body.account;

  const account2 = (
    await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Savings", institution: "Bank", type: "savings", balance: 0 })
  ).body.account;

  const now = new Date().toISOString();
  await request(app).post("/api/transactions").set("Authorization", `Bearer ${token}`).send({
    type: "income", accountId: account._id, amount: 50000, date: now, description: "Salary",
  });
  await request(app).post("/api/transactions").set("Authorization", `Bearer ${token}`).send({
    type: "expense", accountId: account._id, amount: -450, date: now, description: "Lunch", merchant: "Swiggy", category: "Food",
  });
  await request(app).post("/api/transactions").set("Authorization", `Bearer ${token}`).send({
    type: "expense", accountId: account._id, amount: -1200, date: now, description: "Electricity", category: "Bills",
  });
  await request(app).post("/api/transactions").set("Authorization", `Bearer ${token}`).send({
    type: "transfer", fromAccountId: account._id, toAccountId: account2._id, amount: 10000, date: now, description: "Move",
  });

  return { token, account };
}

describe("analytics", () => {
  it("aggregates spending by category and merchant, and excludes transfers from cash flow", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    const { token } = await setupUserWithTransactions(app, "analytics-user@example.com");

    const res = await request(app).get("/api/analytics?period=30d").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const foodCategory = res.body.spendingByCategory.find((c: { category: string }) => c.category === "Food");
    expect(foodCategory.total).toBe(450);

    const swiggy = res.body.spendingByMerchant.find((m: { merchant: string }) => m.merchant === "Swiggy");
    expect(swiggy.total).toBe(450);

    expect(res.body.cashFlow).toHaveLength(1);
    expect(res.body.cashFlow[0].income).toBe(50000);
    expect(res.body.cashFlow[0].expenses).toBe(1650); // 450 + 1200, transfer excluded

    expect(res.body.savingsRateTrend[0].savingsRate).toBe(Math.round(((50000 - 1650) / 50000) * 100 * 100) / 100);
  });

  it("never lets one user see another user's analytics", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    await setupUserWithTransactions(app, "analytics-a@example.com");
    const tokenB = await registerUser(app, "analytics-b@example.com");

    const res = await request(app).get("/api/analytics?period=all").set("Authorization", `Bearer ${tokenB}`);
    expect(res.body.spendingByCategory).toHaveLength(0);
    expect(res.body.cashFlow).toHaveLength(0);
  });
});

describe("reports", () => {
  it("generates a monthly report with income, expenses, savings, and category breakdown from real transactions", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    const { token } = await setupUserWithTransactions(app, "report-user@example.com");

    const now = new Date();
    const res = await request(app)
      .get(`/api/reports/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.report.totalIncome).toBe(50000);
    expect(res.body.report.totalExpenses).toBe(1650);
    expect(res.body.report.netSavings).toBe(48350);
    expect(res.body.report.byCategory.find((c: { category: string }) => c.category === "Bills").total).toBe(1200);
  });

  it("generates a yearly report that sums to the same totals as the monthly report for that month", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    const { token } = await setupUserWithTransactions(app, "report-yearly-user@example.com");

    const now = new Date();
    const res = await request(app).get(`/api/reports/yearly?year=${now.getFullYear()}`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.report.totalIncome).toBe(50000);
    expect(res.body.report.totalExpenses).toBe(1650);
    expect(res.body.report.months).toHaveLength(12);
  });

  it("never lets one user pull another user's report data", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    await setupUserWithTransactions(app, "report-a@example.com");
    const tokenB = await registerUser(app, "report-b@example.com");

    const now = new Date();
    const res = await request(app)
      .get(`/api/reports/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.body.report.totalIncome).toBe(0);
    expect(res.body.report.transactionCount).toBe(0);
  });
});
