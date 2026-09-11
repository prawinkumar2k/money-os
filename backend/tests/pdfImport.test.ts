import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import PDFDocument from "pdfkit";
import fs from "fs";
import os from "os";
import path from "path";
import { parsePdf } from "../src/services/pdfImport.service";

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://placeholder/test";
process.env.JWT_SECRET = "test-jwt-secret-please-ignore";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-please-ignore";
process.env.ENCRYPTION_KEY = "test-encryption-key";

let mongod: MongoMemoryServer;

// Generated once and reused by every test in this file — pdfkit has shown flaky output (an
// occasional malformed xref table pdf-parse rejects with "bad XRef entry") when many
// PDFDocument instances are created back-to-back in one process. Generating a single fixture
// PDF up front avoids that flakiness entirely; it's a test-fixture concern, not something
// production code controls (a real uploaded statement is generated once, by the bank).
let statementPdfBuffer: Buffer;
let statementPdfPath: string;

const STATEMENT_LINES = [
  "Demo Bank — Account Statement",
  "01/01/2026 Opening Balance 10,000.00 Cr",
  "05/01/2026 Swiggy food order 450.00 Dr",
  "10/01/2026 Salary credit 50,000.00 Cr",
  "15/01/2026 Something with no marker 200.00",
];

function generateStatementPdf(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(10);
    for (const line of lines) {
      doc.text(line);
    }
    doc.end();
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { seedSystemCategories } = await import("../src/db/seedCategories");
  await seedSystemCategories();

  statementPdfBuffer = await generateStatementPdf(STATEMENT_LINES);
  statementPdfPath = path.join(os.tmpdir(), `money-os-test-statement-${Date.now()}.pdf`);
  fs.writeFileSync(statementPdfPath, statementPdfBuffer);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  try {
    fs.unlinkSync(statementPdfPath);
  } catch {
    // best-effort cleanup
  }
});

async function registerUser(app: import("express").Express, email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "correct-horse-battery", name: "Test User" });
  return res.body.accessToken as string;
}

describe("PDF statement parsing (pure function, using a real generated PDF)", () => {
  it("extracts date/description/amount and correctly infers direction from Dr/Cr markers", async () => {
    const rows = await parsePdf(statementPdfBuffer);

    const swiggy = rows.find((r) => r.description.includes("Swiggy"));
    expect(swiggy).toBeDefined();
    expect(swiggy!.amount).toBe(-450);
    expect(swiggy!.errors).toHaveLength(0);

    const salary = rows.find((r) => r.description.includes("Salary"));
    expect(salary!.amount).toBe(50000);
    expect(salary!.errors).toHaveLength(0);
  });

  it("flags a line with no Dr/Cr marker as low-confidence rather than guessing the direction", async () => {
    const rows = await parsePdf(statementPdfBuffer);

    const ambiguous = rows.find((r) => r.description.includes("no marker"));
    expect(ambiguous).toBeDefined();
    expect(ambiguous!.amount).toBeNull();
    expect(ambiguous!.errors.length).toBeGreaterThan(0);
  });

  it("skips non-transaction lines (headers) without producing garbage rows", async () => {
    const rows = await parsePdf(statementPdfBuffer);
    expect(rows.some((r) => r.description.includes("Account Statement"))).toBe(false);
  });
});

describe("PDF import via the API", () => {
  it("previews a PDF statement, then confirms only the well-formed rows into real transactions", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const token = await registerUser(app, "pdf-import-user@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    const previewRes = await request(app)
      .post("/api/import/preview")
      .set("Authorization", `Bearer ${token}`)
      .field("accountId", account._id)
      .attach("file", statementPdfPath, "statement.pdf");

    expect(previewRes.status).toBe(200);
    const goodRows = previewRes.body.rows.filter((r: { errors: string[] }) => r.errors.length === 0);
    expect(goodRows.length).toBeGreaterThanOrEqual(2); // opening balance + swiggy + salary, at least the last two

    const confirmRes = await request(app)
      .post("/api/import/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({
        accountId: account._id,
        filename: "statement.pdf",
        transactions: goodRows.map((r: { date: string; description: string; amount: number }) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
        })),
      });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.import.rowsImported).toBe(goodRows.length);
  });

  it("rejects a preview request for another user's account", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const tokenA = await registerUser(app, "pdf-a@example.com");
    const tokenB = await registerUser(app, "pdf-b@example.com");
    const account = (
      await request(app)
        .post("/api/accounts")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Checking", institution: "Bank", type: "savings", balance: 10000 })
    ).body.account;

    const res = await request(app)
      .post("/api/import/preview")
      .set("Authorization", `Bearer ${tokenB}`)
      .field("accountId", account._id)
      .attach("file", statementPdfPath, "statement.pdf");

    expect(res.status).toBe(404);
  });
});
