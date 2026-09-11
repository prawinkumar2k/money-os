const SENSITIVE_KEYS = new Set([
  "password",
  "otp",
  "upiPin",
  "cvv",
  "accessToken",
  "refreshToken",
  "token",
  "cardPin",
  "atmPin",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) =>
        SENSITIVE_KEYS.has(key) ? [key, "[REDACTED]"] : [key, redact(val)]
      )
    );
  }
  return value;
}

function log(level: "info" | "warn" | "error", message: string, meta?: unknown) {
  const entry = { level, message, ...(meta ? { meta: redact(meta) } : {}), timestamp: new Date().toISOString() };
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

export const logger = {
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};
