"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Mock auth persisted to localStorage — NOT real security, mirrors the prototype.

const STORAGE_USERS = "ra.users.v1";
const STORAGE_SESSION = "ra.session.v1";

export type Role = "admin" | "analista" | "visor";

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  password: string;
  createdAt: string;
  lastLogin: string | null;
  status: "active" | "inactive";
}

export const ROLES: Record<Role, { key: Role; label: string; tone: "emerald" | "blue" | "slate"; description: string }> = {
  admin: { key: "admin", label: "Administrador", tone: "emerald", description: "Acceso total · gestiona usuarios" },
  analista: { key: "analista", label: "Analista", tone: "blue", description: "Lectura y exportación de reportes" },
  visor: { key: "visor", label: "Visor", tone: "slate", description: "Solo lectura · sin exportación" },
};

const DEFAULT_USERS: User[] = [
  {
    id: "u-admin",
    name: "Admin ICESI",
    username: "admin",
    email: "admin@retailanalytics.co",
    role: "admin",
    password: "admin123",
    createdAt: "2026-04-12",
    lastLogin: "2026-05-22",
    status: "active",
  },
  {
    id: "u-analista",
    name: "Carolina Méndez",
    username: "analista",
    email: "analista@retailanalytics.co",
    role: "analista",
    password: "analista123",
    createdAt: "2026-04-20",
    lastLogin: "2026-05-21",
    status: "active",
  },
  {
    id: "u-visor",
    name: "Jorge Restrepo",
    username: "visor",
    email: "visor@retailanalytics.co",
    role: "visor",
    password: "visor123",
    createdAt: "2026-05-02",
    lastLogin: "2026-05-19",
    status: "active",
  },
];

interface Session {
  userId: string;
  loggedAt: number;
}

function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS);
    if (raw) return JSON.parse(raw) as User[];
  } catch {}
  return DEFAULT_USERS;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION);
    if (raw) return JSON.parse(raw) as Session;
  } catch {}
  return null;
}

export interface AuthValue {
  ready: boolean;
  currentUser: User | null;
  login: (username: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const isBrowser = typeof window !== "undefined";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Data is read lazily from localStorage (same value on the server's first
  // client render, since the initializer runs once). `ready` stays false until
  // after mount so SSR and the first client render agree (avoids hydration
  // mismatch); consumers gate on it.
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<User[]>(() => (isBrowser ? loadUsers() : DEFAULT_USERS));
  const [session, setSession] = useState<Session | null>(() => (isBrowser ? loadSession() : null));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flip after mount for SSR-safe gating
    setReady(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_SESSION);
  }, [session]);

  const login = useCallback(
    (username: string, password: string) => {
      const u = users.find(
        (x) =>
          (x.username.toLowerCase() === username.toLowerCase() ||
            x.email.toLowerCase() === username.toLowerCase()) &&
          x.password === password &&
          x.status === "active",
      );
      if (!u) return { ok: false, error: "Credenciales inválidas o usuario inactivo." };
      const stamped = { ...u, lastLogin: new Date().toISOString().slice(0, 10) };
      setUsers((prev) => prev.map((x) => (x.id === u.id ? stamped : x)));
      setSession({ userId: u.id, loggedAt: Date.now() });
      return { ok: true };
    },
    [users],
  );

  const logout = useCallback(() => setSession(null), []);

  const currentUser = useMemo(
    () => (session ? users.find((u) => u.id === session.userId) ?? null : null),
    [session, users],
  );

  const value = useMemo<AuthValue>(
    () => ({ ready, currentUser, login, logout }),
    [ready, currentUser, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
