import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();

  // Wait for the async token hydration (native secure storage / localStorage) to resolve before
  // deciding — otherwise a returning user with a valid session flashes the login page every time
  // the app cold-starts, because isAuthenticated briefly reads as false before hydration finishes.
  if (!ready) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
