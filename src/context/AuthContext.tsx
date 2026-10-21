import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { get, post } from "../lib/api";

export type Me = {
  id: string;
  login: string;
  nickname: string;
  role: string;
  roleLabel: string;
  permissions: string[];
  mustChangePassword: boolean;
  employeeId: string | null;
  divisionId: string | null;
  unreadNotifications: number;
  createdAt: string;
  lastLoginAt: string | null;
  adminSince: string | null;
};

type Ctx = {
  user: Me | null;
  loading: boolean;
  /** Подсказка для интерфейса. Реальная проверка прав всегда выполняется сервером. */
  can: (perm: string) => boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => get<{ user: Me | null }>("/auth/me"),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  const user = data?.user ?? null;

  useEffect(() => {
    const onRequired = () => navigate("/change-password");
    window.addEventListener("umvd:password-change-required", onRequired);
    return () => window.removeEventListener("umvd:password-change-required", onRequired);
  }, [navigate]);

  const can = useCallback((perm: string) => !!user?.permissions.includes(perm), [user]);
  const logout = useCallback(async () => {
    await post("/auth/logout").catch(() => {});
    qc.clear();
    await qc.invalidateQueries();
    navigate("/");
  }, [qc, navigate]);

  const value = useMemo(() => ({ user, loading: isLoading, can, refresh: refetch, logout }), [user, isLoading, can, refetch, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}
