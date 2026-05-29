"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  LayoutDashboard,
  BarChart3,
  Users,
  Sparkles,
  Shield,
  Database,
  LogOut,
  Menu,
  X,
  RefreshCw,
  Download,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth, ROLES, type Role } from "@/lib/auth";
import { Badge } from "@/components/ui";

interface NavLink {
  href: string;
  label: string;
  icon: ReactNode;
  enabled: boolean;
}

const ANALYTICS_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, enabled: true },
  { href: "/visualizaciones", label: "Visualizaciones", icon: <BarChart3 size={18} />, enabled: true },
  { href: "/segmentacion", label: "Segmentación", icon: <Users size={18} />, enabled: false },
  { href: "/recomendador", label: "Recomendador", icon: <Sparkles size={18} />, enabled: false },
];

const ADMIN_LINKS: NavLink[] = [
  { href: "/usuarios", label: "Usuarios", icon: <Shield size={18} />, enabled: false },
];

function avatarBg(role: Role): string {
  if (role === "admin") return "linear-gradient(135deg,#059669,#14b8a6)";
  if (role === "analista") return "linear-gradient(135deg,#3b82f6,#6366f1)";
  return "linear-gradient(135deg,#64748b,#94a3b8)";
}

function NavItemLink({ link, active, onNavigate }: { link: NavLink; active: boolean; onNavigate: () => void }) {
  const classes = cn(
    "w-full group flex items-center gap-3 pl-4 pr-3 py-2 text-sm rounded-r-lg text-left transition-colors border-l-4",
    active
      ? "bg-emerald-50 border-emerald-600 text-emerald-700 font-semibold"
      : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium",
    !link.enabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-slate-600",
  );
  const iconClass = cn(active ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600");

  if (!link.enabled) {
    return (
      <div className={classes} title="Próximamente">
        <span className={iconClass}>{link.icon}</span>
        <span className="flex-1">{link.label}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">pronto</span>
      </div>
    );
  }

  return (
    <Link href={link.href} onClick={onNavigate} className={classes}>
      <span className={iconClass}>{link.icon}</span>
      {link.label}
    </Link>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { currentUser, logout } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const role = currentUser ? ROLES[currentUser.role] : null;
  const initials = currentUser
    ? currentUser.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  return (
    <>
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "w-64 shrink-0 h-screen bg-white border-r border-slate-200 flex flex-col fixed left-0 top-0 z-40 transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white grid place-items-center shadow-sm shadow-emerald-600/30">
            <ShoppingCart size={18} strokeWidth={2} />
          </div>
          <div className="leading-tight flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 tracking-tight">RetailAnalytics</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Spark · Dataproc</div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 pr-2 space-y-0.5">
          <div className="px-4 mb-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Analítica</div>
          {ANALYTICS_LINKS.map((link) => (
            <NavItemLink
              key={link.href}
              link={link}
              active={pathname === link.href}
              onNavigate={onClose}
            />
          ))}

          {isAdmin && (
            <>
              <div className="px-4 mt-5 mb-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Administración
              </div>
              {ADMIN_LINKS.map((link) => (
                <NavItemLink
                  key={link.href}
                  link={link}
                  active={pathname === link.href}
                  onNavigate={onClose}
                />
              ))}
            </>
          )}

          <div className="mt-5 mx-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <Database size={14} className="text-slate-400" />
                Dataset
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                activo
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Transacciones de supermercado
              <br />
              Procesado con Spark
            </div>
          </div>
        </nav>

        {currentUser && role && (
          <div className="border-t border-slate-200 p-3 shrink-0">
            <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <div
                className="w-9 h-9 rounded-full grid place-items-center text-white text-[11px] font-bold shrink-0"
                style={{ background: avatarBg(currentUser.role) }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{currentUser.name}</div>
                <div className="text-[11px] text-slate-500 truncate inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 rounded text-[10px] font-semibold",
                      role.tone === "emerald" && "text-emerald-700 bg-emerald-50",
                      role.tone === "blue" && "text-blue-700 bg-blue-50",
                      role.tone === "slate" && "text-slate-700 bg-slate-100",
                    )}
                  >
                    {role.label}
                  </span>
                </div>
              </div>
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                <LogOut size={15} />
              </button>
            </div>
            <div className="mt-2 px-2 text-[10px] text-slate-400 leading-tight">
              ICESI · Procesamiento Distribuido de Datos · 2026-1
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  const { currentUser } = useAuth();
  const initials = currentUser
    ? currentUser.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";
  return (
    <header className="lg:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 h-14 px-3 flex items-center gap-2">
      <button
        onClick={onMenu}
        className="p-2 rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white grid place-items-center shadow-sm shadow-emerald-600/30 shrink-0">
          <ShoppingCart size={15} strokeWidth={2} />
        </div>
        <div className="leading-tight min-w-0">
          <div className="text-sm font-semibold text-slate-900 tracking-tight truncate">RetailAnalytics</div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Spark · Dataproc</div>
        </div>
      </div>
      {currentUser && (
        <div
          className="w-8 h-8 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0"
          style={{ background: avatarBg(currentUser.role) }}
          title={currentUser.name}
        >
          {initials}
        </div>
      )}
    </header>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  onRefresh,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onRefresh?: () => void;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-5 sm:pb-6 mb-5 sm:mb-6 border-b border-slate-200">
      <div className="flex-1 min-w-0 basis-[280px]">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-wider text-emerald-600 font-semibold mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
        <Badge tone="emerald" className="py-1! px-2.5!">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium">Datos en vivo</span>
        </Badge>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Refrescar</span>
        </button>
        <button className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors">
          <Download size={14} />
          <span className="hidden sm:inline">Exportar</span>
        </button>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-64 min-h-screen flex flex-col">
        <MobileTopBar onMenu={() => setNavOpen(true)} />
        <main className="flex-1">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
