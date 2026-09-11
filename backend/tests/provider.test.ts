import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/services/providers/MockProvider";

describe("MockProvider", () => {
  it("flags every account and transaction as mock data", async () => {
    const provider = new MockProvider();
    const { connectionId } = await provider.connect("user-1");
    const { accounts, transactions } = await provider.refresh(connectionId);

    expect(provider.isMockData).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);
    expect(transactions.length).toBeGreaterThan(0);
  });

  it("returns deterministic external ids so repeated syncs can dedupe by them", async () => {
    const provider = new MockProvider();
    const { connectionId } = await provider.connect("user-1");

    const first = await provider.refresh(connectionId);
    const second = await provider.refresh(connectionId);

    expect(first.transactions.map((t) => t.externalTransactionId)).toEqual(
      second.transactions.map((t) => t.externalTransactionId)
    );
    expect(first.accounts.map((a) => a.externalAccountId)).toEqual(
      second.accounts.map((a) => a.externalAccountId)
    );
  });
});
