import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isSignedIn } from "../session";

export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!isSignedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}