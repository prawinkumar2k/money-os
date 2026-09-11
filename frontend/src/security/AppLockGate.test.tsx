import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppLockGate } from "./AppLockGate";
import * as biometrics from "../native/biometrics";
import * as appLifecycle from "../native/appLifecycle";
import { setAppLockEnabled, setAppLockTimeoutMinutes } from "./appLockSettings";

describe("AppLockGate", () => {
  beforeEach(() => {
    setAppLockEnabled(false);
    setAppLockTimeoutMinutes(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never locks on a platform with no app-state events (web) — no fake biometric gate", () => {
    // onAppStateChange is a no-op on web (see native/appLifecycle.ts), so no lock can ever trigger.
    render(
      <AppLockGate>
        <div>App content</div>
      </AppLockGate>
    );
    expect(screen.getByText("App content")).toBeInTheDocument();
  });

  it("locks after returning from background past the timeout, when app lock is enabled and biometrics are available", async () => {
    setAppLockEnabled(true);
    setAppLockTimeoutMinutes(0); // lock immediately on any backgrounding, for a deterministic test

    let stateChangeCallback: ((isActive: boolean) => void) | null = null;
    vi.spyOn(appLifecycle, "onAppStateChange").mockImplementation((cb) => {
      stateChangeCallback = cb;
      return () => {};
    });
    vi.spyOn(biometrics, "isBiometricAvailable").mockResolvedValue(true);

    render(
      <AppLockGate>
        <div>App content</div>
      </AppLockGate>
    );
    expect(screen.getByText("App content")).toBeInTheDocument();

    stateChangeCallback!(false); // backgrounded
    stateChangeCallback!(true); // resumed

    await waitFor(() => expect(screen.getByText("Money OS is locked")).toBeInTheDocument());
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
  });

  it("does not lock when app lock is disabled, even past the timeout", async () => {
    setAppLockEnabled(false);

    let stateChangeCallback: ((isActive: boolean) => void) | null = null;
    vi.spyOn(appLifecycle, "onAppStateChange").mockImplementation((cb) => {
      stateChangeCallback = cb;
      return () => {};
    });
    const availableSpy = vi.spyOn(biometrics, "isBiometricAvailable").mockResolvedValue(true);

    render(
      <AppLockGate>
        <div>App content</div>
      </AppLockGate>
    );

    stateChangeCallback!(false);
    stateChangeCallback!(true);

    // Give any pending microtasks a chance to run, then confirm nothing locked.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(availableSpy).not.toHaveBeenCalled();
  });

  it("does not lock on a device with no biometric hardware, even when app lock is enabled", async () => {
    setAppLockEnabled(true);
    setAppLockTimeoutMinutes(0);

    let stateChangeCallback: ((isActive: boolean) => void) | null = null;
    vi.spyOn(appLifecycle, "onAppStateChange").mockImplementation((cb) => {
      stateChangeCallback = cb;
      return () => {};
    });
    vi.spyOn(biometrics, "isBiometricAvailable").mockResolvedValue(false);

    render(
      <AppLockGate>
        <div>App content</div>
      </AppLockGate>
    );

    stateChangeCallback!(false);
    stateChangeCallback!(true);

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("App content")).toBeInTheDocument();
  });

  it("unlocks after a successful biometric verification, and shows an error without unlocking on failure", async () => {
    setAppLockEnabled(true);
    setAppLockTimeoutMinutes(0);

    let stateChangeCallback: ((isActive: boolean) => void) | null = null;
    vi.spyOn(appLifecycle, "onAppStateChange").mockImplementation((cb) => {
      stateChangeCallback = cb;
      return () => {};
    });
    vi.spyOn(biometrics, "isBiometricAvailable").mockResolvedValue(true);
    const verifySpy = vi.spyOn(biometrics, "verifyBiometric").mockRejectedValueOnce(new Error("cancelled")).mockResolvedValueOnce(undefined);

    const { default: userEvent } = await import("@testing-library/user-event");

    render(
      <AppLockGate>
        <div>App content</div>
      </AppLockGate>
    );
    stateChangeCallback!(false);
    stateChangeCallback!(true);
    await waitFor(() => expect(screen.getByText("Money OS is locked")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await waitFor(() => expect(screen.getByText(/failed or was cancelled/i)).toBeInTheDocument());
    expect(screen.getByText("Money OS is locked")).toBeInTheDocument(); // still locked

    await userEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await waitFor(() => expect(screen.getByText("App content")).toBeInTheDocument());
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });
});
