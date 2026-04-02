import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Role } from "../lib/auth";

export type ForbiddenRedirectState = { accessDenied?: string };

export function RequireRole({
  roles,
  redirectTo = "/orders",
  forbiddenMessage,
}: {
  roles: Role[];
  /** Where to send users whose role is not allowed (default: /orders). */
  redirectTo?: string;
  /** If set, passed in navigation state as `accessDenied` for the target page to show a snackbar. */
  forbiddenMessage?: string;
}) {
  const { state } = useAuth();

  if (!state.role) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(state.role)) {
    const navState: ForbiddenRedirectState | undefined = forbiddenMessage
      ? { accessDenied: forbiddenMessage }
      : undefined;
    return <Navigate to={redirectTo} replace state={navState} />;
  }

  return <Outlet />;
}

