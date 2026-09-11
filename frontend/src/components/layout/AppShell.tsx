import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { OfflineBanner } from "../../offline/OfflineBanner";
import { AppLockGate } from "../../security/AppLockGate";
import { useIsMobile } from "../../hooks/useIsMobile";

export function AppShell() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <AppLockGate>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />

        {isMobile && mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 90 }}
          />
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {isMobile && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <button
                aria-label="Open menu"
                onClick={() => setMobileNavOpen(true)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}
              >
                ☰
              </button>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Money OS</div>
            </div>
          )}
          <OfflineBanner />
          <main style={{ flex: 1, padding: isMobile ? 16 : 32 }}>
            <Outlet />
          </main>
        </div>
      </div>
    </AppLockGate>
  );
}
