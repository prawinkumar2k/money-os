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

describe("connected accounts", () => {
  it("connects the mock provider, syncs through the connection, then disconnects and blocks further sync", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "conn-user@example.com");

    const availableBefore = await request(app).get("/api/connections/available-providers").set("Authorization", `Bearer ${token}`);
    expect(availableBefore.body.providers.map((p: { id: string }) => p.id)).toContain("mock");

    const createRes = await request(app).post("/api/connections").set("Authorization", `Bearer ${token}`).send({ provider: "mock" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.connection.status).toBe("connected");
    const connectionId = createRes.body.connection._id;

    // Connecting the same provider twice while already connected is rejected, not silently re-faked.
    const dupRes = await request(app).post("/api/connections").set("Authorization", `Bearer ${token}`).send({ provider: "mock" });
    expect(dupRes.status).toBe(409);

    const syncRes = await request(app).post(`/api/connections/${connectionId}/sync`).set("Authorization", `Bearer ${token}`);
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.job.status).toBe("completed");
    expect(syncRes.body.job.accountsSynced).toBeGreaterThan(0);

    const listRes = await request(app).get("/api/connections").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.connections[0].lastSyncedAt).toBeTruthy();

    const disconnectRes = await request(app).delete(`/api/connections/${connectionId}`).set("Authorization", `Bearer ${token}`);
    expect(disconnectRes.body.connection.status).toBe("disconnected");

    const syncAfterDisconnect = await request(app).post(`/api/connections/${connectionId}/sync`).set("Authorization", `Bearer ${token}`);
    expect(syncAfterDisconnect.status).toBe(409);

    const reconnectRes = await request(app).post(`/api/connections/${connectionId}/reconnect`).set("Authorization", `Bearer ${token}`);
    expect(reconnectRes.body.connection.status).toBe("connected");
  });

  it("rejects connecting an unknown provider", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    const token = await registerUser(app, "conn-unknown-user@example.com");

    const res = await request(app).post("/api/connections").set("Authorization", `Bearer ${token}`).send({ provider: "some-fake-bank" });
    expect(res.status).toBe(400);
  });

  it("never lets one user sync or disconnect another user's connection", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "conn-a@example.com");
    const tokenB = await registerUser(app, "conn-b@example.com");

    const createRes = await request(app).post("/api/connections").set("Authorization", `Bearer ${tokenA}`).send({ provider: "mock" });
    const connectionId = createRes.body.connection._id;

    const syncAsB = await request(app).post(`/api/connections/${connectionId}/sync`).set("Authorization", `Bearer ${tokenB}`);
    expect(syncAsB.status).toBe(404);

    const disconnectAsB = await request(app).delete(`/api/connections/${connectionId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(disconnectAsB.status).toBe(404);

    const listB = await request(app).get("/api/connections").set("Authorization", `Bearer ${tokenB}`);
    expect(listB.body.connections).toHaveLength(0);
  });
});
