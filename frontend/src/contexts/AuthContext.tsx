import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, LoginResponse } from "../types/user.types";
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (data: LoginResponse) => void;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logout = React.useCallback(() => {
    setUser(null); setToken(null);
    localStorage.removeItem("user"); localStorage.removeItem("access_token"); localStorage.removeItem("token");
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const restore = async () => {
      try {
        const stored = localStorage.getItem("access_token");
        if (!stored) return;
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/me`, { headers: { Authorization: `Bearer ${stored}` }, signal: controller.signal });
        if (!response.ok) throw new Error("Session unavailable");
        const current = await response.json() as User;
        if (active && localStorage.getItem("access_token") === stored) { setUser(current); setToken(stored); localStorage.setItem("user", JSON.stringify(current)); }
      } catch { if (active) logout(); }
      finally { if (active) setLoading(false); }
    };
    restore();
    const expired = () => logout();
    window.addEventListener("auth:expired", expired);
    return () => { active = false; controller.abort(); window.removeEventListener("auth:expired", expired); };
  }, [logout]);
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      const ms = payload.exp * 1000 - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) { logout(); return; }
      const timeout = window.setTimeout(logout, Math.min(ms, 2147483647));
      return () => window.clearTimeout(timeout);
    } catch { logout(); }
  }, [token, logout]);
  const login = (data: LoginResponse) => {
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.removeItem("token");
    setUser(data.user); setToken(data.access_token); setLoading(false);
  };
  return <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!(user && token), loading }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
