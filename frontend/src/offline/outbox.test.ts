import { describe, expect, it } from "vitest";
import { installMockFetch, jsonRoute } from "../test/mockFetch";
import { setTokens } from "../api/client";
import { enqueueMutation, flushOutbox, listOutbox, removeFromOutbox } from "./outbox";

describe("offline outbox", () => {
  it("replays queued mutations in the order they were created, then empties the queue", async () => {
    setTokens("access-1", "refresh-1");
    const seenPaths: string[] = [];

    installMockFetch([
      {
        match: (url) => url.includes("/transactions"),
        respond: (url) => {
          seenPaths.push(url);
          return { status: 201, body: { transaction: { _id: "real-1" } } };
        },
      },
    ]);

    await enqueueMutation({ method: "POST", path: "/transactions", body: { description: "first" }, description: "first" });
    await enqueueMutation({ method: "POST", path: "/transactions", body: { description: "second" }, description: "second" });

    const result = await flushOutbox();
    expect(result.synced).toBe(2);
    expect(result.remaining).toBe(0);
    expect(await listOutbox()).toHaveLength(0);
  });

  it("stops at the first failure, preserving order rather than skipping ahead", async () => {
    setTokens("access-1", "refresh-1");
    let callCount = 0;

    installMockFetch([
      {
        match: (url) => url.includes("/transactions"),
        respond: () => {
          callCount += 1;
          if (callCount === 1) return { status: 201, body: { transaction: { _id: "real-1" } } };
          return { status: 500, body: { error: "server error" } };
        },
      },
    ]);

    await enqueueMutation({ method: "POST", path: "/transactions", body: {}, description: "first" });
    await enqueueMutation({ method: "POST", path: "/transactions", body: {}, description: "second" });
    await enqueueMutation({ method: "POST", path: "/transactions", body: {}, description: "third" });

    const result = await flushOutbox();
    expect(result.synced).toBe(1); // only the first succeeded
    expect(callCount).toBe(2); // second failed; third was never attempted

    const remaining = await listOutbox();
    expect(remaining).toHaveLength(2);
    expect(remaining[0].description).toBe("second");
    expect(remaining[1].description).toBe("third");
  });

  it("marks an entry failed (not silently dropped) after exceeding the retry limit", async () => {
    setTokens("access-1", "refresh-1");
    installMockFetch([jsonRoute("/transactions", "POST", 500, { error: "server error" })]);

    await enqueueMutation({ method: "POST", path: "/transactions", body: {}, description: "flaky" });

    // Flush repeatedly — each attempt increments retryCount until MAX_RETRIES is hit.
    for (let i = 0; i < 6; i++) {
      await flushOutbox();
    }

    const remaining = await listOutbox();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("failed");
  });

  it("removeFromOutbox lets a caller discard a specific queued item", async () => {
    const entry = await enqueueMutation({ method: "DELETE", path: "/transactions/abc", body: undefined, description: "delete" });
    expect(await listOutbox()).toHaveLength(1);
    await removeFromOutbox(entry.id);
    expect(await listOutbox()).toHaveLength(0);
  });

  it("two concurrent flush calls do not double-send the same queued mutation", async () => {
    setTokens("access-1", "refresh-1");
    const fetchMock = installMockFetch([jsonRoute("/transactions", "POST", 201, { transaction: { _id: "real-1" } })]);

    await enqueueMutation({ method: "POST", path: "/transactions", body: {}, description: "one" });

    await Promise.all([flushOutbox(), flushOutbox()]);

    // The in-flight guard means only one of the two concurrent calls actually flushes.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listOutbox()).toHaveLength(0);
  });
});
