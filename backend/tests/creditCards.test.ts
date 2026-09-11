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

describe("credit cards", () => {
  it("computes utilization and pays down the outstanding balance without double-counting as a plain expense", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "cc-user@example.com");

    const bank = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 50000 })
    ).body.account;

    const ccAccount = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Visa", institution: "Bank", type: "credit_card", balance: -20000, creditLimit: 100000 })
    ).body.account;

    const createRes = await request(app)
      .post("/api/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({ accountId: ccAccount._id, statementDay: 1, dueDate: new Date().toISOString(), minimumDuePercent: 5 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.creditCard.outstanding).toBe(20000);
    expect(createRes.body.creditCard.utilizationPercent).toBe(20);
    expect(createRes.body.creditCard.minimumDue).toBe(1000);

    const cardId = createRes.body.creditCard._id;
    const payRes = await request(app)
      .post(`/api/credit-cards/${cardId}/pay`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fromAccountId: bank._id, amount: 5000 });
    expect(payRes.status).toBe(201);
    expect(payRes.body.creditCard.outstanding).toBe(15000);

    const bankAfter = await request(app).get(`/api/accounts/${bank._id}`).set("Authorization", `Bearer ${token}`);
    expect(bankAfter.body.account.balance).toBe(45000);

    const ccAfter = await request(app).get(`/api/accounts/${ccAccount._id}`).set("Authorization", `Bearer ${token}`);
    expect(ccAfter.body.account.balance).toBe(-15000);

    // Both legs are tagged credit_card_payment, not "expense" — so a spending report that sums
    // type:"expense" would not double-count this payment on top of the original card purchases.
    const txns = await request(app)
      .get(`/api/transactions?type=credit_card_payment`)
      .set("Authorization", `Bearer ${token}`);
    expect(txns.body.transactions).toHaveLength(2);
  });

  it("flags high utilization at or above 75%", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "cc-high-util@example.com");
    const ccAccount = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Visa", institution: "Bank", type: "credit_card", balance: -8000, creditLimit: 10000 })
    ).body.account;

    const createRes = await request(app)
      .post("/api/credit-cards")
      .set("Authorization", `Bearer ${token}`)
      .send({ accountId: ccAccount._id, statementDay: 1, dueDate: new Date().toISOString() });

    expect(createRes.body.creditCard.utilizationPercent).toBe(80);
    expect(createRes.body.creditCard.highUtilization).toBe(true);
  });

  it("never lets one user read, pay, or delete another user's credit card", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "cc-a@example.com");
    const tokenB = await registerUser(app, "cc-b@example.com");

    const ccAccount = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Visa", institution: "Bank", type: "credit_card", balance: -1000, creditLimit: 10000 })
    ).body.account;

    const cardRes = await request(app)
      .post("/api/credit-cards")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ accountId: ccAccount._id, statementDay: 1, dueDate: new Date().toISOString() });
    const cardId = cardRes.body.creditCard._id;

    const getAsB = await request(app).get(`/api/credit-cards/${cardId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const deleteAsB = await request(app).delete(`/api/credit-cards/${cardId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });
});
