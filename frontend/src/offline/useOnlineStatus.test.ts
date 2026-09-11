import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOnlineStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("on web, reflects navigator.onLine and updates on online/offline events", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);

    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("on native, queries and subscribes to @capacitor/network instead of browser events", async () => {
    vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));

    let changeListener: ((status: { connected: boolean; connectionType: string }) => void) | null = null;
    vi.doMock("@capacitor/network", () => ({
      Network: {
        getStatus: vi.fn().mockResolvedValue({ connected: false, connectionType: "none" }),
        addListener: vi.fn((_event: string, cb: (status: { connected: boolean; connectionType: string }) => void) => {
          changeListener = cb;
          return Promise.resolve({ remove: vi.fn() });
        }),
      },
    }));

    const { useOnlineStatus: nativeUseOnlineStatus } = await import("./useOnlineStatus");
    const { result } = renderHook(() => nativeUseOnlineStatus());

    await waitFor(() => expect(result.current).toBe(false));

    act(() => changeListener!({ connected: true, connectionType: "wifi" }));
    expect(result.current).toBe(true);
  });

  it("on native, treats an active interface as online even when Android's generic internet validation hasn't passed", async () => {
    // Real bug found via device testing: Capacitor's `connected` requires NET_CAPABILITY_VALIDATED
    // (a successful ping to a generic external endpoint), which can be false even though this
    // app's own API is fully reachable — e.g. a captive portal, a restrictive network, or a
    // LAN-only backend. `connectionType` reflects interface presence independent of validation,
    // which is what this hook must key off instead.
    vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock("@capacitor/network", () => ({
      Network: {
        getStatus: vi.fn().mockResolvedValue({ connected: false, connectionType: "wifi" }),
        addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
      },
    }));

    const { useOnlineStatus: nativeUseOnlineStatus } = await import("./useOnlineStatus");
    const { result } = renderHook(() => nativeUseOnlineStatus());

    await waitFor(() => expect(result.current).toBe(true));
  });
});
