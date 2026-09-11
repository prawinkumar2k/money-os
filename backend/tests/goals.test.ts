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

describe("savings goals", () => {
  it("tracks progress, computes required monthly contribution, and clamps withdrawals at zero", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "goal-user@example.com");

    const targetDate = new Date();
    targetDate.setFullYear(targetDate.getFullYear() + 1); // ~12 months out

    const createRes = await request(app)
      .post("/api/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Emergency Fund", targetAmount: 12000, targetDate: targetDate.toISOString() });
    expect(createRes.status).toBe(201);
    const goalId = createRes.body.goal._id;
    expect(createRes.body.goal.progressPercentage).toBe(0);

    const contributeRes = await request(app)
      .post(`/api/goals/${goalId}/contributions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 2000, note: "First contribution" });
    expect(contributeRes.status).toBe(201);
    expect(contributeRes.body.goal.currentAmount).toBe(2000);
    expect(contributeRes.body.goal.remaining).toBe(10000);
    expect(contributeRes.body.goal.progressPercentage).toBeCloseTo((2000 / 12000) * 100, 0);
    // ~10000 remaining over ~12 months ≈ 833/month.
    expect(contributeRes.body.goal.requiredMonthlyContribution).toBeGreaterThan(800);
    expect(contributeRes.body.goal.requiredMonthlyContribution).toBeLessThan(870);

    // Withdrawal larger than current amount clamps to 0, never negative.
    const withdrawRes = await request(app)
      .post(`/api/goals/${goalId}/contributions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: -5000, note: "Emergency withdrawal" });
    expect(withdrawRes.status).toBe(201);
    expect(withdrawRes.body.goal.currentAmount).toBe(0);

    const getRes = await request(app).get(`/api/goals/${goalId}`).set("Authorization", `Bearer ${token}`);
    expect(getRes.body.goal.contributions).toHaveLength(2);
  });

  it("returns null required monthly contribution when the target date has already passed", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "goal-past-user@example.com");

    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);

    const createRes = await request(app)
      .post("/api/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Overdue Goal", targetAmount: 1000, targetDate: pastDate.toISOString() });

    expect(createRes.body.goal.requiredMonthlyContribution).toBeNull();
  });

  it("never lets one user read, contribute to, or delete another user's goal", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "goal-a@example.com");
    const tokenB = await registerUser(app, "goal-b@example.com");

    const goalRes = await request(app)
      .post("/api/goals")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Laptop", targetAmount: 80000 });
    const goalId = goalRes.body.goal._id;

    const getAsB = await request(app).get(`/api/goals/${goalId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const contributeAsB = await request(app)
      .post(`/api/goals/${goalId}/contributions`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ amount: 1000 });
    expect(contributeAsB.status).toBe(404);

    const deleteAsB = await request(app).delete(`/api/goals/${goalId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });
});
