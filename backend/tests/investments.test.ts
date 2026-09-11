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

describe("investments", () => {
  it("computes weighted average buy price, invested amount, current value, and P/L across multiple buys", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "inv-user@example.com");

    const createRes = await request(app)
      .post("/api/investments")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "NIFTYBEES", type: "etf", currentPrice: 250 });
    expect(createRes.body.investment.isManualPrice).toBe(true);
    const id = createRes.body.investment._id;

    // Buy 10 units @ 200, then 10 units @ 300 -> avg buy price 250, 20 units, invested 5000.
    await request(app).post(`/api/investments/${id}/buy`).set("Authorization", `Bearer ${token}`).send({ units: 10, pricePerUnit: 200 });
    const buy2 = await request(app).post(`/api/investments/${id}/buy`).set("Authorization", `Bearer ${token}`).send({ units: 10, pricePerUnit: 300 });

    expect(buy2.body.investment.units).toBe(20);
    expect(buy2.body.investment.avgBuyPrice).toBe(250);
    expect(buy2.body.investment.investedAmount).toBe(5000);

    // Current price 250 -> currentValue 5000, P/L 0.
    expect(buy2.body.investment.currentValue).toBe(5000);
    expect(buy2.body.investment.profitLoss).toBe(0);

    // Bump manual price to 300 -> currentValue 6000, P/L +1000, return 20%.
    const priceRes = await request(app).post(`/api/investments/${id}/price`).set("Authorization", `Bearer ${token}`).send({ currentPrice: 300 });
    expect(priceRes.body.investment.currentValue).toBe(6000);
    expect(priceRes.body.investment.profitLoss).toBe(1000);
    expect(priceRes.body.investment.returnPercent).toBe(20);
  });

  it("selling reduces units and invested amount by cost basis, and moves real money when linked to an account", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "inv-sell-user@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    const createRes = await request(app)
      .post("/api/investments")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Gold ETF", type: "gold", currentPrice: 100, accountId: account._id });
    const id = createRes.body.investment._id;

    // Buy 10 @ 100 -> invested 1000, account debited 1000.
    await request(app).post(`/api/investments/${id}/buy`).set("Authorization", `Bearer ${token}`).send({ units: 10, pricePerUnit: 100 });
    const afterBuy = await request(app).get(`/api/accounts/${account._id}`).set("Authorization", `Bearer ${token}`);
    expect(afterBuy.body.account.balance).toBe(9000);

    // Sell 4 @ 120 -> cost basis removed = 4*100=400, remaining invested 600, units 6, account credited 480.
    const sellRes = await request(app)
      .post(`/api/investments/${id}/sell`)
      .set("Authorization", `Bearer ${token}`)
      .send({ units: 4, pricePerUnit: 120 });
    expect(sellRes.body.investment.units).toBe(6);
    expect(sellRes.body.investment.investedAmount).toBe(600);

    const afterSell = await request(app).get(`/api/accounts/${account._id}`).set("Authorization", `Bearer ${token}`);
    expect(afterSell.body.account.balance).toBe(9480);
  });

  it("rejects selling more units than currently held", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "inv-oversell-user@example.com");
    const createRes = await request(app)
      .post("/api/investments")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "TCS", type: "stock", currentPrice: 3500 });
    const id = createRes.body.investment._id;

    const sellRes = await request(app).post(`/api/investments/${id}/sell`).set("Authorization", `Bearer ${token}`).send({ units: 1, pricePerUnit: 3500 });
    expect(sellRes.status).toBe(400);
  });

  it("never lets one user read, trade, or delete another user's investment", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "inv-a@example.com");
    const tokenB = await registerUser(app, "inv-b@example.com");

    const createRes = await request(app)
      .post("/api/investments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "SBI Mutual Fund", type: "mutual_fund", currentPrice: 50 });
    const id = createRes.body.investment._id;

    const getAsB = await request(app).get(`/api/investments/${id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const buyAsB = await request(app).post(`/api/investments/${id}/buy`).set("Authorization", `Bearer ${tokenB}`).send({ units: 1, pricePerUnit: 50 });
    expect(buyAsB.status).toBe(404);

    const deleteAsB = await request(app).delete(`/api/investments/${id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });
});
