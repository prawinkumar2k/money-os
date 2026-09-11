import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountsPage } from "./pages/AccountsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { GoalsPage } from "./pages/GoalsPage";
import { BillsPage } from "./pages/BillsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { CreditCardsPage } from "./pages/CreditCardsPage";
import { LoansPage } from "./pages/LoansPage";
import { InvestmentsPage } from "./pages/InvestmentsPage";
import { NetWorthPage } from "./pages/NetWorthPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ImportExportPage } from "./pages/ImportExportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "accounts", element: <AccountsPage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "budgets", element: <BudgetsPage /> },
      { path: "goals", element: <GoalsPage /> },
      { path: "bills", element: <BillsPage /> },
      { path: "subscriptions", element: <SubscriptionsPage /> },
      { path: "credit-cards", element: <CreditCardsPage /> },
      { path: "loans", element: <LoansPage /> },
      { path: "investments", element: <InvestmentsPage /> },
      { path: "net-worth", element: <NetWorthPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "import-export", element: <ImportExportPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "connections", element: <ConnectionsPage /> },
    ],
  },
]);
