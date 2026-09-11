import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { installMockFetch, jsonRoute, MockRoute } from "../test/mockFetch";
import { setTokens } from "../api/client";
import { listOutbox } from "../offline/outbox";
import { TransactionsPage } from "./TransactionsPage";

vi.mock("../utils/imageCompress", () => ({
  fileToCompressedDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,FAKECOMPRESSEDIMAGE"),
}));

const ACCOUNT = { _id: "acc-1", name: "Checking", institution: "Bank", type: "savings", balance: 1000, availableBalance: 1000, creditLimit: null, currency: "INR", provider: "manual", isMockData: false, lastSyncedAt: null };

const BASE_TXN = {
  _id: "txn-1",
  accountId: "acc-1",
  amount: -75,
  currency: "INR",
  date: new Date().toISOString(),
  description: "Lunch",
  merchant: null,
  category: null,
  subcategory: null,
  type: "expense",
  provider: "manual",
  isMockData: false,
  source: "manual" as const,
  transferGroupId: null,
  receiptImage: null as string | null,
};

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

function renderPage() {
  render(
    <MemoryRouter>
      <TransactionsPage />
    </MemoryRouter>
  );
}

describe("TransactionsPage", () => {
  afterEach(() => setOnline(true));

  it("shows a loading state, then an empty state when there are no transactions", async () => {
    setTokens("access-1", "refresh-1");
    installMockFetch([
      jsonRoute("/accounts", "GET", 200, { accounts: [ACCOUNT] }),
      jsonRoute("/transactions", "GET", 200, { transactions: [], pagination: { page: 1, limit: 25, total: 0 } }),
    ]);

    renderPage();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No transactions match these filters.")).toBeInTheDocument());
  });

  it("shows an error message when the transactions request fails and there is no cache to fall back to", async () => {
    setTokens("access-1", "refresh-1");
    installMockFetch([
      jsonRoute("/accounts", "GET", 200, { accounts: [ACCOUNT] }),
      jsonRoute("/transactions", "GET", 500, { error: "Internal server error" }),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Internal server error")).toBeInTheDocument());
  });

  it("queues an offline transaction as a visible pending-sync row instead of failing", async () => {
    setTokens("access-1", "refresh-1");
    installMockFetch([
      jsonRoute("/accounts", "GET", 200, { accounts: [ACCOUNT] }),
      jsonRoute("/transactions", "GET", 200, { transactions: [], pagination: { page: 1, limit: 25, total: 0 } }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText("No transactions match these filters.")).toBeInTheDocument());

    setOnline(false);

    await userEvent.click(screen.getByText("Add transaction"));

    const form = document.querySelector("form") as HTMLFormElement;
    const amountInput = within(form).getByRole("spinbutton") as HTMLInputElement; // the number input (amount)
    const textboxes = within(form).getAllByRole("textbox");
    const description = textboxes.find((el) => !el.getAttribute("placeholder")) as HTMLInputElement; // merchant has a placeholder, description doesn't

    await userEvent.type(amountInput, "250");
    await userEvent.type(description, "Offline grocery run");
    await userEvent.click(screen.getByText("Save transaction"));

    await waitFor(() => expect(screen.getByText("pending sync")).toBeInTheDocument());
    expect(screen.getByText("Offline grocery run")).toBeInTheDocument();
  });

  it("keeps a queued offline transaction visible after the app reloads while still offline", async () => {
    setTokens("access-1", "refresh-1");
    installMockFetch([
      jsonRoute("/accounts", "GET", 200, { accounts: [ACCOUNT] }),
      jsonRoute("/transactions", "GET", 200, { transactions: [], pagination: { page: 1, limit: 25, total: 0 } }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText("No transactions match these filters.")).toBeInTheDocument());

    setOnline(false);
    await userEvent.click(screen.getByText("Add transaction"));
    const form = document.querySelector("form") as HTMLFormElement;
    const amountInput = within(form).getByRole("spinbutton") as HTMLInputElement;
    const textboxes = within(form).getAllByRole("textbox");
    const description = textboxes.find((el) => !el.getAttribute("placeholder")) as HTMLInputElement;
    await userEvent.type(amountInput, "250");
    await userEvent.type(description, "Offline grocery run");
    await userEvent.click(screen.getByText("Save transaction"));
    await waitFor(() => expect(screen.getByText("pending sync")).toBeInTheDocument());

    // Confirm it's really durable, not just in React state: the outbox entry exists independent of the mounted component.
    const queued = await listOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].status).toBe("pending");

    // Simulate an app reload: unmount everything (in-memory state is gone), stay offline, mount fresh.
    cleanup();
    installMockFetch([
      jsonRoute("/accounts", "GET", 200, { accounts: [ACCOUNT] }),
      // No transactions route configured here — going through it would mean the page tried a
      // live fetch; while offline it must fall back to cache/outbox without erroring.
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText("pending sync")).toBeInTheDocument());
    expect(screen.getByText("Offline grocery run")).toBeInTheDocument();
  });

  it("attaches a receipt via the web file-picker fallback, then removes it", async () => {
    setTokens("access-1", "refresh-1");
    let currentTxn = { ...BASE_TXN };
    const routes: MockRoute[] = [
      jsonRoute("/accounts", "GET", 200, { accounts: [ACCOUNT] }),
      {
        match: (url, init) => url.includes("/transactions") && !url.includes("/receipt") && (init?.method ?? "GET") === "GET",
        respond: () => ({ status: 200, body: { transactions: [currentTxn], pagination: { page: 1, limit: 25, total: 1 } } }),
      },
      {
        match: (url, init) => url.includes("/receipt") && init?.method === "PUT",
        respond: () => {
          currentTxn = { ...currentTxn, receiptImage: "data:image/jpeg;base64,FAKECOMPRESSEDIMAGE" };
          return { status: 200, body: { transaction: currentTxn } };
        },
      },
      {
        match: (url, init) => url.includes("/receipt") && init?.method === "DELETE",
        respond: () => {
          currentTxn = { ...currentTxn, receiptImage: null };
          return { status: 200, body: { transaction: currentTxn } };
        },
      },
    ];
    installMockFetch(routes);

    renderPage();
    await waitFor(() => expect(screen.getByText("Lunch")).toBeInTheDocument());

    // Native camera isn't available in jsdom (Capacitor.isNativePlatform() is false), so this
    // exercises the web fallback: clicking "Add receipt" arms the hidden file input, which the
    // test then "selects" a file into directly, exactly as a real file picker would.
    await userEvent.click(screen.getByText("Add receipt"));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-image-bytes"], "receipt.jpg", { type: "image/jpeg" });
    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(screen.getByText("Remove receipt")).toBeInTheDocument());
    expect(screen.getByAltText("Receipt")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Remove receipt"));
    await waitFor(() => expect(screen.getByText("Add receipt")).toBeInTheDocument());
    expect(screen.queryByAltText("Receipt")).not.toBeInTheDocument();
  });
});
