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

describe("backup and restore", () => {
  it("creates a backup, deletes all data, then restores everything with remapped references intact", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "backup-user@example.com");
    const accountA = (
      await request(app).post("/api/accounts").set("Authorization", `Bearer ${token}`).send({ name: "Checking", institution: "Bank", type: "savings", balance: 5000 })
    ).body.account;
    const accountB = (
      await request(app).post("/api/accounts").set("Authorization", `Bearer ${token}`).send({ name: "Savings", institution: "Bank", type: "savings", balance: 1000 })
    ).body.account;

    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "transfer", fromAccountId: accountA._id, toAccountId: accountB._id, amount: 500, date: new Date().toISOString(), description: "Move" });

    await request(app)
      .post("/api/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Food", amount: 3000, period: "monthly" });

    const backupRes = await request(app).get("/api/backup").set("Authorization", `Bearer ${token}`);
    expect(backupRes.status).toBe(200);
    const backup = JSON.parse(backupRes.text);
    expect(backup.data.accounts).toHaveLength(2);
    expect(backup.data.transactions).toHaveLength(2); // both transfer legs
    expect(backup.data.budgets).toHaveLength(1);

    // Wipe everything, confirming the destructive action requires the exact confirmation phrase.
    const badDelete = await request(app).post("/api/backup/delete-all").set("Authorization", `Bearer ${token}`).send({ confirmation: "delete" });
    expect(badDelete.status).toBe(400);

    const deleteRes = await request(app).post("/api/backup/delete-all").set("Authorization", `Bearer ${token}`).send({ confirmation: "DELETE ALL MY DATA" });
    expect(deleteRes.status).toBe(204);

    const accountsAfterDelete = await request(app).get("/api/accounts").set("Authorization", `Bearer ${token}`);
    expect(accountsAfterDelete.body.accounts).toHaveLength(0);

    // Restore.
    const restoreRes = await request(app).post("/api/backup/restore").set("Authorization", `Bearer ${token}`).send({ backup });
    expect(restoreRes.status).toBe(201);
    expect(restoreRes.body.restoredCounts.accounts).toBe(2);
    expect(restoreRes.body.restoredCounts.transactions).toBe(2);
    expect(restoreRes.body.restoredCounts.budgets).toBe(1);

    const accountsAfterRestore = await request(app).get("/api/accounts").set("Authorization", `Bearer ${token}`);
    expect(accountsAfterRestore.body.accounts).toHaveLength(2);
    const restoredA = accountsAfterRestore.body.accounts.find((a: { name: string }) => a.name === "Checking");
    expect(restoredA.balance).toBe(4500); // preserved from backup, transfer already applied

    // Transfer legs must still be linked to each other (remapped, not to the original stale group id).
    const txns = await request(app).get(`/api/transactions?accountId=${restoredA._id}`).set("Authorization", `Bearer ${token}`);
    expect(txns.body.transactions).toHaveLength(1);
    expect(txns.body.transactions[0].transferGroupId).toBeTruthy();
  });

  it("rejects a malformed or non-backup JSON payload", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    const token = await registerUser(app, "backup-invalid-user@example.com");

    const res = await request(app)
      .post("/api/backup/restore")
      .set("Authorization", `Bearer ${token}`)
      .send({ backup: { not: "a backup" } });
    expect(res.status).toBe(400);
  });

  it("never lets one user restore data into or read a backup from another user's account", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "backup-a@example.com");
    const tokenB = await registerUser(app, "backup-b@example.com");

    await request(app).post("/api/accounts").set("Authorization", `Bearer ${tokenA}`).send({ name: "Secret", institution: "Bank", type: "savings", balance: 999999 });

    const backupA = JSON.parse((await request(app).get("/api/backup").set("Authorization", `Bearer ${tokenA}`)).text);
    expect(backupA.data.accounts).toHaveLength(1);

    const backupB = JSON.parse((await request(app).get("/api/backup").set("Authorization", `Bearer ${tokenB}`)).text);
    expect(backupB.data.accounts).toHaveLength(0);

    // If B restores A's backup, the data becomes B's own copy — it never lets B read/modify A's actual records.
    await request(app).post("/api/backup/restore").set("Authorization", `Bearer ${tokenB}`).send({ backup: backupA });
    const accountsA = await request(app).get("/api/accounts").set("Authorization", `Bearer ${tokenA}`);
    expect(accountsA.body.accounts).toHaveLength(1); // untouched
  });
});
