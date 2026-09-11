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

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

describe("notifications", () => {
  it("generates an overdue-bill notification and a budget-alert notification from real data, without duplicating on repeated calls", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "notif-user@example.com");
    const account = (
      await request(app).post("/api/accounts").set("Authorization", `Bearer ${token}`).send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Overdue Rent", amount: 500, accountId: account._id, frequency: "monthly", dueDate: daysFromNow(-2) });

    await request(app)
      .post("/api/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Food", amount: 1000, period: "monthly" });
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "expense", accountId: account._id, amount: -950, date: new Date().toISOString(), description: "Big grocery run", category: "Food" });

    const firstRes = await request(app).get("/api/notifications").set("Authorization", `Bearer ${token}`);
    expect(firstRes.status).toBe(200);
    const types = firstRes.body.notifications.map((n: { type: string }) => n.type);
    expect(types).toContain("bill_overdue");
    expect(types).toContain("budget_alert");
    const countAfterFirst = firstRes.body.notifications.length;

    // Calling again immediately must not create duplicate notifications for the same conditions.
    const secondRes = await request(app).get("/api/notifications").set("Authorization", `Bearer ${token}`);
    expect(secondRes.body.notifications).toHaveLength(countAfterFirst);
  });

  it("marks a notification as read", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "notif-read-user@example.com");
    const account = (
      await request(app).post("/api/accounts").set("Authorization", `Bearer ${token}`).send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;
    await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Overdue Bill", amount: 100, accountId: account._id, frequency: "monthly", dueDate: daysFromNow(-1) });

    const listRes = await request(app).get("/api/notifications").set("Authorization", `Bearer ${token}`);
    const notificationId = listRes.body.notifications[0]._id;

    const readRes = await request(app).put(`/api/notifications/${notificationId}/read`).set("Authorization", `Bearer ${token}`);
    expect(readRes.body.notification.read).toBe(true);
  });

  it("never lets one user read or mark another user's notifications", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "notif-a@example.com");
    const tokenB = await registerUser(app, "notif-b@example.com");
    const account = (
      await request(app).post("/api/accounts").set("Authorization", `Bearer ${tokenA}`).send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;
    await request(app)
      .post("/api/bills")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Overdue Bill", amount: 100, accountId: account._id, frequency: "monthly", dueDate: daysFromNow(-1) });

    const listA = await request(app).get("/api/notifications").set("Authorization", `Bearer ${tokenA}`);
    const notificationId = listA.body.notifications[0]._id;

    const readAsB = await request(app).put(`/api/notifications/${notificationId}/read`).set("Authorization", `Bearer ${tokenB}`);
    expect(readAsB.status).toBe(404);

    const listB = await request(app).get("/api/notifications").set("Authorization", `Bearer ${tokenB}`);
    expect(listB.body.notifications).toHaveLength(0);
  });
});
