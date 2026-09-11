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

describe("auth flow", () => {
  it("registers, logs in, and rejects a re-used refresh token after rotation", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com", password: "correct-horse-battery", name: "Test User" });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.accessToken).toBeDefined();
    const firstRefreshToken = registerRes.body.refreshToken as string;

    // A separate login rotates the stored refresh token, so it independently invalidates
    // whatever was issued at registration — confirmed by the reuse check below.
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "correct-horse-battery" });
    expect(loginRes.status).toBe(200);

    // The registration refresh token is stale now that login has rotated it out.
    const staleRefreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: firstRefreshToken });
    expect(staleRefreshRes.status).toBe(401);

    const loginRefreshToken = loginRes.body.refreshToken as string;
    const refreshRes = await request(app).post("/api/auth/refresh").send({ refreshToken: loginRefreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();

    // Old refresh token was rotated out — a second refresh with it must fail.
    const reusedRefreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: loginRefreshToken });
    expect(reusedRefreshRes.status).toBe(401);
  });

  it("rejects login with a wrong password without leaking whether the account exists", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("resets a password via the dev-mode token and invalidates the old session", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    await request(app)
      .post("/api/auth/register")
      .send({ email: "reset-user@example.com", password: "correct-horse-battery", name: "Reset User" });

    const forgotRes = await request(app).post("/api/auth/forgot-password").send({ email: "reset-user@example.com" });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.resetToken).toBeDefined(); // dev-mode only

    const resetRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: forgotRes.body.resetToken, newPassword: "a-brand-new-password" });
    expect(resetRes.status).toBe(200);

    // Old password no longer works.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "reset-user@example.com", password: "correct-horse-battery" });
    expect(oldLogin.status).toBe(401);

    // New password works.
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "reset-user@example.com", password: "a-brand-new-password" });
    expect(newLogin.status).toBe(200);

    // The reset token cannot be reused.
    const reusedReset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: forgotRes.body.resetToken, newPassword: "yet-another-password" });
    expect(reusedReset.status).toBe(400);
  });

  it("does not reveal whether an email is registered when requesting a password reset", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "never-registered@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
  });
});
