import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { calculateEmi, generateAmortizationSchedule } from "../src/services/loan.service";

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

describe("loan amortization math (pure functions)", () => {
  it("computes a zero-interest EMI as a simple even split", () => {
    expect(calculateEmi(12000, 0, 12)).toBe(1000);
  });

  it("computes a known reducing-balance EMI (₹100,000 @ 12% for 12 months ≈ ₹8,884.88)", () => {
    expect(calculateEmi(100000, 12, 12)).toBeCloseTo(8884.88, 1);
  });

  it("generates a schedule whose principal components sum to the original principal and ends at zero", () => {
    const schedule = generateAmortizationSchedule(100000, 12, 12);
    expect(schedule).toHaveLength(12);
    const totalPrincipal = schedule.reduce((s, row) => s + row.principalComponent, 0);
    expect(totalPrincipal).toBeCloseTo(100000, 0);
    expect(schedule[11].remainingPrincipal).toBe(0);
    // Interest component should strictly decrease as principal is paid down.
    expect(schedule[0].interestComponent).toBeGreaterThan(schedule[11].interestComponent);
  });
});

describe("loans API", () => {
  it("creates a loan with a computed EMI and records a payment that reduces remaining principal correctly", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "loan-user@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 100000 })
    ).body.account;

    const createRes = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Car Loan", principal: 100000, interestRate: 12, tenureMonths: 12, startDate: new Date().toISOString(), accountId: account._id });
    expect(createRes.status).toBe(201);
    expect(createRes.body.loan.emi).toBeCloseTo(8884.88, 1);
    expect(createRes.body.loan.remainingPrincipal).toBe(100000);

    const loanId = createRes.body.loan._id;
    const payRes = await request(app).post(`/api/loans/${loanId}/pay`).set("Authorization", `Bearer ${token}`).send({});
    expect(payRes.status).toBe(201);

    const expectedInterest = Math.round(100000 * (0.12 / 12) * 100) / 100; // 1000
    expect(payRes.body.loan.payments[0].interestComponent).toBeCloseTo(expectedInterest, 1);
    expect(payRes.body.loan.remainingPrincipal).toBeCloseTo(100000 - (8884.88 - expectedInterest), 0);
    expect(payRes.body.transaction.type).toBe("loan_payment");
    expect(payRes.body.transaction.amount).toBeCloseTo(-8884.88, 1);

    const accountAfter = await request(app).get(`/api/accounts/${account._id}`).set("Authorization", `Bearer ${token}`);
    expect(accountAfter.body.account.balance).toBeCloseTo(100000 - 8884.88, 1);
  });

  it("returns a full amortization schedule independent of recorded payments", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "loan-schedule-user@example.com");
    const createRes = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Personal Loan", principal: 50000, interestRate: 10, tenureMonths: 6, startDate: new Date().toISOString() });
    const loanId = createRes.body.loan._id;

    const scheduleRes = await request(app).get(`/api/loans/${loanId}/amortization-schedule`).set("Authorization", `Bearer ${token}`);
    expect(scheduleRes.status).toBe(200);
    expect(scheduleRes.body.schedule).toHaveLength(6);
    expect(scheduleRes.body.schedule[5].remainingPrincipal).toBe(0);
  });

  it("never lets one user read, pay, or delete another user's loan", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "loan-a@example.com");
    const tokenB = await registerUser(app, "loan-b@example.com");

    const loanRes = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Loan", principal: 10000, interestRate: 10, tenureMonths: 6, startDate: new Date().toISOString() });
    const loanId = loanRes.body.loan._id;

    const getAsB = await request(app).get(`/api/loans/${loanId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const payAsB = await request(app).post(`/api/loans/${loanId}/pay`).set("Authorization", `Bearer ${tokenB}`).send({});
    expect(payAsB.status).toBe(404);

    const deleteAsB = await request(app).delete(`/api/loans/${loanId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });
});
