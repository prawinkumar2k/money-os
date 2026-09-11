import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
  // Comma-separated list of allowed origins. Defaults cover the web dev server plus the two
  // origins a Capacitor native WebView actually sends (https://localhost on Android by default,
  // capacitor://localhost on iOS) — without these, every request from the mobile app is blocked
  // by CORS before it ever reaches a route, surfacing to the user as a generic "Failed to fetch".
  CORS_ORIGIN: z.string().default("http://localhost:5173,https://localhost,capacitor://localhost"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
