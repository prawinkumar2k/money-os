import type { CapacitorConfig } from "@capacitor/cli";

// Native android/ and ios/ projects have been generated (npx cap add android / ios).
// See readme.md "Mobile / Capacitor" section for exact build blockers on this machine
// and the commands to build once a JDK 17 + Android SDK (and, for iOS, a Mac + Xcode)
// are available.
const config: CapacitorConfig = {
  appId: "com.moneyos.app",
  appName: "Money OS",
  webDir: "dist",
  backgroundColor: "#0f1115",
  android: {
    backgroundColor: "#0f1115",
  },
  ios: {
    backgroundColor: "#0f1115",
  },
};

export default config;
