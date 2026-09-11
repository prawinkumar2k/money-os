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

async function createAccount(app: import("express").Express, token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/accounts")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Test Savings", institution: "Test Bank", type: "savings", balance: 10000, ...overrides });
  return res.body.account;
}

describe("accounts + transactions", () => {
  it("creates a manual expense transaction, auto-categorizes it, and updates the account balance", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "txn-user@example.com");
    const account = await createAccount(app, token);

    const txnRes = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "expense",
        accountId: account._id,
        amount: -450,
        date: new Date().toISOString(),
        description: "Lunch order",
        merchant: "Swiggy",
      });

    expect(txnRes.status).toBe(201);
    expect(txnRes.body.transaction.category).toBe("Food");

    const accountRes = await request(app).get(`/api/accounts/${account._id}`).set("Authorization", `Bearer ${token}`);
    expect(accountRes.body.account.balance).toBe(10000 - 450);
  });

  it("links both legs of a transfer, moves both balances, and deletes both legs together", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "transfer-user@example.com");
    const from = await createAccount(app, token, { name: "From", balance: 5000 });
    const to = await createAccount(app, token, { name: "To", balance: 1000 });

    const transferRes = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "transfer",
        fromAccountId: from._id,
        toAccountId: to._id,
        amount: 2000,
        date: new Date().toISOString(),
        description: "Move to savings",
      });

    expect(transferRes.status).toBe(201);
    expect(transferRes.body.transactions).toHaveLength(2);
    const transferGroupId = transferRes.body.transactions[0].transferGroupId;
    expect(transferGroupId).toBeTruthy();

    const fromAfter = await request(app).get(`/api/accounts/${from._id}`).set("Authorization", `Bearer ${token}`);
    const toAfter = await request(app).get(`/api/accounts/${to._id}`).set("Authorization", `Bearer ${token}`);
    expect(fromAfter.body.account.balance).toBe(5000 - 2000);
    expect(toAfter.body.account.balance).toBe(1000 + 2000);

    const outLegId = transferRes.body.transactions[0]._id;
    const deleteRes = await request(app)
      .delete(`/api/transactions/${outLegId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const remaining = await request(app)
      .get(`/api/transactions?accountId=${from._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(remaining.body.transactions).toHaveLength(0);

    const fromRestored = await request(app).get(`/api/accounts/${from._id}`).set("Authorization", `Bearer ${token}`);
    const toRestored = await request(app).get(`/api/accounts/${to._id}`).set("Authorization", `Bearer ${token}`);
    expect(fromRestored.body.account.balance).toBe(5000);
    expect(toRestored.body.account.balance).toBe(1000);
  });

  it("never lets one user read or write another user's account or transaction", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "user-a@example.com");
    const tokenB = await registerUser(app, "user-b@example.com");

    const accountA = await createAccount(app, tokenA);
    const txnRes = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "income",
        accountId: accountA._id,
        amount: 1000,
        date: new Date().toISOString(),
        description: "Freelance payment",
      });
    const txnA = txnRes.body.transaction;

    const getAccountAsB = await request(app)
      .get(`/api/accounts/${accountA._id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(getAccountAsB.status).toBe(404);

    const getTxnAsB = await request(app).get(`/api/transactions/${txnA._id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getTxnAsB.status).toBe(404);

    const createTxnOnAAsB = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        type: "expense",
        accountId: accountA._id,
        amount: -100,
        date: new Date().toISOString(),
        description: "Should be rejected",
      });
    expect(createTxnOnAAsB.status).toBe(404);

    const deleteAsB = await request(app).delete(`/api/transactions/${txnA._id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });

  it("attaches and removes a receipt image, rejects non-image payloads, and never lets another user touch it", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "receipt-user@example.com");
    const account = await createAccount(app, token);
    const txnRes = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "expense", accountId: account._id, amount: -75, date: new Date().toISOString(), description: "Lunch" });
    const txn = txnRes.body.transaction;

    // A tiny, real 1x1 PNG, base64-encoded.
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    const rejectBadMime = await request(app)
      .put(`/api/transactions/${txn._id}/receipt`)
      .set("Authorization", `Bearer ${token}`)
      .send({ image: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" });
    expect(rejectBadMime.status).toBe(400);

    const attach = await request(app)
      .put(`/api/transactions/${txn._id}/receipt`)
      .set("Authorization", `Bearer ${token}`)
      .send({ image: tinyPng });
    expect(attach.status).toBe(200);
    expect(attach.body.transaction.receiptImage).toBe(tinyPng);

    const fetched = await request(app).get(`/api/transactions/${txn._id}`).set("Authorization", `Bearer ${token}`);
    expect(fetched.body.transaction.receiptImage).toBe(tinyPng);

    const tokenB = await registerUser(app, "receipt-other@example.com");
    const attachAsB = await request(app)
      .put(`/api/transactions/${txn._id}/receipt`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ image: tinyPng });
    expect(attachAsB.status).toBe(404);
    const deleteAsB = await request(app)
      .delete(`/api/transactions/${txn._id}/receipt`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);

    const remove = await request(app)
      .delete(`/api/transactions/${txn._id}/receipt`)
      .set("Authorization", `Bearer ${token}`);
    expect(remove.status).toBe(200);
    expect(remove.body.transaction.receiptImage).toBeNull();
  });
});
