import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { listNotifications } from "../../api/notifications";
import { useIsMobile } from "../../hooks/useIsMobile";

const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/net-worth", label: "Net Worth" },
      { to: "/analytics", label: "Analytics" },
      { to: "/reports", label: "Reports" },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/accounts", label: "Accounts" },
      { to: "/transactions", label: "Transactions" },
      { to: "/budgets", label: "Budgets" },
      { to: "/goals", label: "Goals" },
    ],
  },
  {
    label: "Recurring",
    items: [
      { to: "/bills", label: "Bills" },
      { to: "/subscriptions", label: "Subscriptions" },
    ],
  },
  {
    label: "Credit & Investing",
    items: [
      { to: "/credit-cards", label: "Credit Cards" },
      { to: "/loans", label: "Loans" },
      { to: "/investments", label: "Investments" },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/connections", label: "Connected Accounts" },
      { to: "/import-export", label: "Import / Export" },
      { to: "/notifications", label: "Notifications" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

export function Sidebar({ mobileOpen = false, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    listNotifications()
      .then((d) => setUnreadCount(d.unreadCount))
      .catch(() => {});
  }, []);

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        padding: 20,
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        overflowY: "auto",
        // Mobile: a fixed-position slide-in drawer instead of a permanent rail — a 220px-wide
        // rail simply doesn't fit a phone viewport (flexbox compresses it and clips labels,
        // confirmed via real device testing). Desktop keeps the original in-flow layout.
        ...(isMobile
          ? {
              position: "fixed" as const,
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: 100,
              background: "var(--color-bg)",
              boxShadow: mobileOpen ? "2px 0 16px rgba(0,0,0,0.25)" : "none",
              transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.2s ease",
            }
          : {}),
      }}
      onClick={(e) => {
        if (isMobile && (e.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 18 }}>Money OS</div>

      {navGroups.map((group) => (
        <div key={group.label}>
          <div className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            {group.label}
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                style={({ isActive }) => ({
                  padding: "7px 10px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: isActive ? "var(--color-primary-contrast)" : "var(--color-text)",
                  background: isActive ? "var(--color-primary)" : "transparent",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                })}
              >
                <span>{item.label}</span>
                {item.to === "/notifications" && unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}

      <div style={{ marginTop: "auto", fontSize: 13 }}>
        <div className="text-muted">{user?.email}</div>
        <button className="btn btn-secondary" style={{ marginTop: 8, width: "100%" }} onClick={() => logout()}>
          Log out
        </button>
      </div>
    </aside>
  );
}
