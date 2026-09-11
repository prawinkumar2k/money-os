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
    .send({ name: "Checking", institution: "Test Bank", type: "savings", balance: 20000 });
  return res.body.account;
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

describe("bills", () => {
  it("computes overdue/due_soon/upcoming status from the due date", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "bills-status@example.com");
    const account = await createAccount(app, token);

    const overdue = await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Overdue rent", amount: 100, accountId: account._id, frequency: "monthly", dueDate: daysFromNow(-1) });
    expect(overdue.body.bill.status).toBe("overdue");

    const dueSoon = await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Electricity", amount: 100, accountId: account._id, frequency: "monthly", dueDate: daysFromNow(2), reminderDaysBefore: 3 });
    expect(dueSoon.body.bill.status).toBe("due_soon");

    const upcoming = await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Insurance", amount: 100, accountId: account._id, frequency: "yearly", dueDate: daysFromNow(200) });
    expect(upcoming.body.bill.status).toBe("upcoming");
  });

  it("paying a bill creates a real expense transaction, updates the balance, and advances the due date by one period", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "bills-pay@example.com");
    const account = await createAccount(app, token);

    const createRes = await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Internet", amount: 1200, accountId: account._id, frequency: "monthly", dueDate: daysFromNow(1) });
    const bill = createRes.body.bill;
    const originalDueDate = new Date(bill.dueDate);

    const payRes = await request(app).post(`/api/bills/${bill._id}/pay`).set("Authorization", `Bearer ${token}`);
    expect(payRes.status).toBe(201);
    expect(payRes.body.transaction.amount).toBe(-1200);
    expect(payRes.body.transaction.type).toBe("expense");

    const expectedNextDue = new Date(originalDueDate);
    expectedNextDue.setMonth(expectedNextDue.getMonth() + 1);
    expect(new Date(payRes.body.bill.dueDate).toISOString().slice(0, 10)).toBe(expectedNextDue.toISOString().slice(0, 10));
    expect(payRes.body.bill.lastPaidDate).toBeTruthy();

    const accountAfter = await request(app).get(`/api/accounts/${account._id}`).set("Authorization", `Bearer ${token}`);
    expect(accountAfter.body.account.balance).toBe(20000 - 1200);

    const txns = await request(app)
      .get(`/api/transactions?accountId=${account._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(txns.body.transactions.some((t: { description: string }) => t.description.includes("Internet"))).toBe(true);
  });

  it("never lets one user read, pay, or delete another user's bill", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "bills-a@example.com");
    const tokenB = await registerUser(app, "bills-b@example.com");
    const accountA = await createAccount(app, tokenA);

    const billRes = await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Rent", amount: 500, accountId: accountA._id, frequency: "monthly", dueDate: daysFromNow(5) });
    const billId = billRes.body.bill._id;

    const getAsB = await request(app).get(`/api/bills/${billId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const payAsB = await request(app).post(`/api/bills/${billId}/pay`).set("Authorization", `Bearer ${tokenB}`);
    expect(payAsB.status).toBe(404);

    const deleteAsB = await request(app).delete(`/api/bills/${billId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });
});
