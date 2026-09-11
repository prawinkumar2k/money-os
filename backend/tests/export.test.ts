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

describe("export", () => {
  it("exports the user's own transactions as CSV, and never another user's", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "export-a@example.com");
    const tokenB = await registerUser(app, "export-b@example.com");

    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "expense", accountId: account._id, amount: -500, date: new Date().toISOString(), description: "Coffee shop visit" });

    const csvRes = await request(app).get("/api/export/transactions?format=csv").set("Authorization", `Bearer ${tokenA}`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.text).toContain("Coffee shop visit");

    const csvResB = await request(app).get("/api/export/transactions?format=csv").set("Authorization", `Bearer ${tokenB}`);
    expect(csvResB.text).not.toContain("Coffee shop visit");
  });

  it("neutralizes a CSV-formula-injection payload in a transaction description", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "export-injection-user@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "expense",
        accountId: account._id,
        amount: -500,
        date: new Date().toISOString(),
        description: '=HYPERLINK("http://evil.example","click me")',
      });

    const res = await request(app).get("/api/export/transactions?format=csv").set("Authorization", `Bearer ${token}`);
    // The raw formula must never appear as a live leading-= cell — it should be neutralized with a prefix.
    expect(res.text).not.toContain('"=HYPERLINK');
    expect(res.text).toContain("HYPERLINK");
  });

  it("exports transactions as an Excel workbook", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "export-xlsx-user@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "expense", accountId: account._id, amount: -500, date: new Date().toISOString(), description: "Test row" });

    const res = await request(app)
      .get("/api/export/transactions?format=xlsx")
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
