import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { AuthState } from "../lib/auth";
import { emptyAuthState } from "../lib/auth";

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(emptyAuthState);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const me = await api.get("/auth/me/", { __mp_skip_refresh_retry: true } as any);
        if (!active) return;
        setState({
          role: (me.data?.role ?? null) as AuthState["role"],
          email: (me.data?.email ?? null) as string | null,
          userId: typeof me.data?.id === "number" ? me.data.id : null,
        });
      } catch {
        if (!active) return;
        setState(emptyAuthState());
      }
    };
    bootstrap();

    const onLost = () => {
      setState(emptyAuthState());
    };
    window.addEventListener("mp_auth_lost", onLost);
    return () => {
      active = false;
      window.removeEventListener("mp_auth_lost", onLost);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await api.post("/auth/token/", { email, password });
    const me = await api.get("/auth/me/", { __mp_skip_refresh_retry: true } as any);
    setState({
      role: (me.data?.role ?? null) as AuthState["role"],
      email: (me.data?.email ?? null) as string | null,
      userId: typeof me.data?.id === "number" ? me.data.id : null,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout/", {});
    } catch {
      // ignore
    }
    setState(emptyAuthState());
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider is missing");
  return ctx;
}

