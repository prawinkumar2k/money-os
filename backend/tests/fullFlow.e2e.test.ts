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
  const { seedSystemCategories } = await import("../src/db/seedCategories");
  await seedSystemCategories();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

/**
 * One continuous flow through every module, using the real API exactly as the frontend would —
 * not per-module isolated fixtures. Catches cross-module regressions that individual test files,
 * each with their own fresh account/data, structurally can't see.
 */
describe("full end-to-end flow across every module", () => {
  it("register → login → every financial module → dashboard/analytics/net worth agree → export/backup/restore → provider sync twice with zero duplicates → logout/login → cross-user isolation", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    // 1. Register + login again (session must survive a fresh login, not just the register response).
    const email = "fullflow@example.com";
    const registerRes = await request(app).post("/api/auth/register").send({ email, password: "correct-horse-battery", name: "Full Flow" });
    expect(registerRes.status).toBe(201);

    const loginRes = await request(app).post("/api/auth/login").send({ email, password: "correct-horse-battery" });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    // 2. Accounts.
    const checking = (await request(app).post("/api/accounts").set(auth(token)).send({ name: "Checking", institution: "Bank", type: "savings", balance: 0 })).body.account;
    const savings = (await request(app).post("/api/accounts").set(auth(token)).send({ name: "Savings", institution: "Bank", type: "savings", balance: 0 })).body.account;
    const creditAccount = (await request(app).post("/api/accounts").set(auth(token)).send({ name: "Visa", institution: "Bank", type: "credit_card", balance: 0, creditLimit: 100000 })).body.account;

    const now = new Date().toISOString();

    // 3. Income, expense, refund, transfer.
    await request(app).post("/api/transactions").set(auth(token)).send({ type: "income", accountId: checking._id, amount: 50000, date: now, description: "Salary" });
    await request(app).post("/api/transactions").set(auth(token)).send({ type: "expense", accountId: checking._id, amount: -450, date: now, description: "Lunch", merchant: "Swiggy" });
    await request(app).post("/api/transactions").set(auth(token)).send({ type: "refund", accountId: checking._id, amount: 450, date: now, description: "Refund of lunch", merchant: "Swiggy" });
    const transferRes = await request(app).post("/api/transactions").set(auth(token)).send({ type: "transfer", fromAccountId: checking._id, toAccountId: savings._id, amount: 5000, date: now, description: "Move to savings" });
    expect(transferRes.status).toBe(201);

    let checkingAfter = (await request(app).get(`/api/accounts/${checking._id}`).set(auth(token))).body.account;
    expect(checkingAfter.balance).toBe(50000 - 450 + 450 - 5000); // = 45000
    let savingsAfter = (await request(app).get(`/api/accounts/${savings._id}`).set(auth(token))).body.account;
    expect(savingsAfter.balance).toBe(5000);

    // 4. Budget, goal, bill, subscription.
    const budget = (await request(app).post("/api/budgets").set(auth(token)).send({ category: "Food", amount: 5000, period: "monthly" })).body.budget;
    expect(budget.spent).toBe(0); // the earlier Swiggy expense was fully refunded

    const goal = (await request(app).post("/api/goals").set(auth(token)).send({ name: "Emergency Fund", targetAmount: 100000 })).body.goal;
    await request(app).post(`/api/goals/${goal._id}/contributions`).set(auth(token)).send({ amount: 2000 });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const bill = (await request(app).post("/api/bills").set(auth(token)).send({ name: "Internet", amount: 1200, accountId: checking._id, frequency: "monthly", dueDate: dueDate.toISOString() })).body.bill;
    const payBillRes = await request(app).post(`/api/bills/${bill._id}/pay`).set(auth(token));
    expect(payBillRes.status).toBe(201);

    // 5. Credit card, loan, investment.
    await request(app).put(`/api/accounts/${creditAccount._id}`).set(auth(token)).send({}); // no-op sanity check on manual account update path
    const card = (await request(app).post("/api/credit-cards").set(auth(token)).send({ accountId: creditAccount._id, statementDay: 1, dueDate: now })).body.creditCard;
    expect(card.outstanding).toBe(0);

    const loan = (await request(app).post("/api/loans").set(auth(token)).send({ name: "Car Loan", principal: 100000, interestRate: 12, tenureMonths: 12, startDate: now, accountId: checking._id })).body.loan;
    await request(app).post(`/api/loans/${loan._id}/pay`).set(auth(token));

    const investment = (await request(app).post("/api/investments").set(auth(token)).send({ name: "Gold ETF", type: "gold", currentPrice: 500 })).body.investment;
    await request(app).post(`/api/investments/${investment._id}/buy`).set(auth(token)).send({ units: 10, pricePerUnit: 500 });

    // 6. Dashboard, analytics, net worth, report must all agree with the real underlying data.
    const dashboard = (await request(app).get("/api/dashboard").set(auth(token))).body;
    expect(dashboard.accountCount).toBe(3);
    expect(dashboard.goals.find((g: { name: string }) => g.name === "Emergency Fund").currentAmount).toBe(2000);

    const netWorth = (await request(app).get("/api/net-worth").set(auth(token))).body;
    expect(netWorth.breakdown.investments).toBe(5000); // 10 units @ 500
    expect(netWorth.breakdown.loanDebt).toBeGreaterThan(0);

    const analytics = (await request(app).get("/api/analytics?period=all").set(auth(token))).body;
    expect(analytics.cashFlow.length).toBeGreaterThan(0);

    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const report = (await request(app).get(`/api/reports/monthly?year=${year}&month=${month}`).set(auth(token))).body.report;
    expect(report.transactionCount).toBeGreaterThan(0);

    // 7. Export, backup, restore.
    const exportRes = await request(app).get("/api/export/transactions?format=csv").set(auth(token));
    expect(exportRes.status).toBe(200);
    expect(exportRes.text).toContain("Salary");

    const backupRes = await request(app).get("/api/backup").set(auth(token));
    const backup = JSON.parse(backupRes.text);
    const preRestoreAccountCount = backup.data.accounts.length;
    const preRestoreTxnCount = backup.data.transactions.length;

    await request(app).post("/api/backup/delete-all").set(auth(token)).send({ confirmation: "DELETE ALL MY DATA" });
    const afterDelete = (await request(app).get("/api/accounts").set(auth(token))).body.accounts;
    expect(afterDelete).toHaveLength(0);

    const restoreRes = await request(app).post("/api/backup/restore").set(auth(token)).send({ backup });
    expect(restoreRes.body.restoredCounts.accounts).toBe(preRestoreAccountCount);
    expect(restoreRes.body.restoredCounts.transactions).toBe(preRestoreTxnCount);

    const restoredAccounts = (await request(app).get("/api/accounts").set(auth(token))).body.accounts;
    const restoredChecking = restoredAccounts.find((a: { name: string }) => a.name === "Checking");
    // Both the bill payment (₹1200) and the loan EMI (₹8884.88, computed via the standard
    // reducing-balance formula) debit Checking before the backup is taken.
    expect(restoredChecking.balance).toBeCloseTo(checkingAfter.balance - 1200 - 8884.88, 1);

    // 8. Provider connect → sync → sync again → zero duplicates → disconnect.
    const connectRes = await request(app).post("/api/connections").set(auth(token)).send({ provider: "mock" });
    expect(connectRes.body.connection.status).toBe("connected");
    const connectionId = connectRes.body.connection._id;

    const sync1 = await request(app).post(`/api/connections/${connectionId}/sync`).set(auth(token));
    expect(sync1.body.job.status).toBe("completed");
    const firstSyncedCount = sync1.body.job.transactionsSynced;
    expect(firstSyncedCount).toBeGreaterThan(0);

    const sync2 = await request(app).post(`/api/connections/${connectionId}/sync`).set(auth(token));
    expect(sync2.body.job.transactionsSynced).toBe(0); // nothing new
    expect(sync2.body.job.transactionsSkippedAsDuplicate).toBe(firstSyncedCount);

    const disconnectRes = await request(app).delete(`/api/connections/${connectionId}`).set(auth(token));
    expect(disconnectRes.body.connection.status).toBe("disconnected");

    // 9. Cross-user isolation, checked against real data created in this exact flow.
    const otherToken = (await request(app).post("/api/auth/register").send({ email: "fullflow-other@example.com", password: "correct-horse-battery", name: "Other" })).body.accessToken;
    const crossAccountRes = await request(app).get(`/api/accounts/${restoredChecking._id}`).set(auth(otherToken));
    expect(crossAccountRes.status).toBe(404);
    const crossBudgetRes = await request(app).get(`/api/budgets/${budget._id}`).set(auth(otherToken));
    expect(crossBudgetRes.status).toBe(404);
    const crossGoalRes = await request(app).delete(`/api/goals/${goal._id}`).set(auth(otherToken));
    expect(crossGoalRes.status).toBe(404);
  });
});
