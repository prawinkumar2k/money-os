import { describe, expect, it } from "vitest";
import request from "supertest";

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://placeholder/test";
process.env.JWT_SECRET = "test-jwt-secret-please-ignore";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-please-ignore";
process.env.ENCRYPTION_KEY = "test-encryption-key";
// Simulates a real production allowlist: a real frontend domain plus the two origins a Capacitor
// native WebView actually sends — the exact case that broke before CORS_ORIGIN was made a real
// comma-separated allowlist instead of a single hardcoded string.
process.env.CORS_ORIGIN = "https://app.moneyos-example.com,https://localhost,capacitor://localhost";

describe("CORS", () => {
  it("allows the configured production frontend origin", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const res = await request(app).get("/api/health").set("Origin", "https://app.moneyos-example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.moneyos-example.com");
  });

  it("allows the native app origins (Android and iOS Capacitor WebViews)", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const android = await request(app).get("/api/health").set("Origin", "https://localhost");
    expect(android.status).toBe(200);
    expect(android.headers["access-control-allow-origin"]).toBe("https://localhost");

    const ios = await request(app).get("/api/health").set("Origin", "capacitor://localhost");
    expect(ios.status).toBe(200);
    expect(ios.headers["access-control-allow-origin"]).toBe("capacitor://localhost");
  });

  it("rejects a random, unconfigured origin with 403 and no CORS header", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const res = await request(app).get("/api/health").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests with no Origin header (native non-fetch requests, curl, server-to-server)", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });
});
