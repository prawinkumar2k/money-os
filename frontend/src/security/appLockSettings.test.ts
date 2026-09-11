import { beforeEach, describe, expect, it } from "vitest";
import {
  getAppLockTimeoutMinutes,
  isAppLockEnabled,
  setAppLockEnabled,
  setAppLockTimeoutMinutes,
} from "./appLockSettings";

describe("appLockSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to disabled with a 1 minute timeout", () => {
    expect(isAppLockEnabled()).toBe(false);
    expect(getAppLockTimeoutMinutes()).toBe(1);
  });

  it("persists the enabled flag", () => {
    setAppLockEnabled(true);
    expect(isAppLockEnabled()).toBe(true);
    setAppLockEnabled(false);
    expect(isAppLockEnabled()).toBe(false);
  });

  it("persists the timeout minutes", () => {
    setAppLockTimeoutMinutes(15);
    expect(getAppLockTimeoutMinutes()).toBe(15);
    setAppLockTimeoutMinutes(0);
    expect(getAppLockTimeoutMinutes()).toBe(0);
  });
});
