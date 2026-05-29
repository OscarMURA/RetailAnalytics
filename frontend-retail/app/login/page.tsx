"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, UserPlus, Lock, Eye, EyeOff, Info, ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui";

const DEMO = [
  { u: "admin", p: "admin123", role: "Administrador", tone: "emerald" as const },
  { u: "analista", p: "analista123", role: "Analista", tone: "blue" as const },
  { u: "visor", p: "visor123", role: "Visor", tone: "slate" as const },
];

export default function LoginPage() {
  const { ready, currentUser, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && currentUser) router.replace("/dashboard");
  }, [ready, currentUser, router]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      const r = login(username.trim(), password);
      if (!r.ok) {
        setError(r.error ?? "Error al iniciar sesión.");
        setLoading(false);
      } else {
        router.replace("/dashboard");
      }
    }, 380);
  };

  const fillDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError("");
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 grid grid-cols-1 lg:grid-cols-[1fr_520px]">
      <aside className="hidden lg:flex relative overflow-hidden bg-slate-900 text-white flex-col p-12">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(5,150,105,0.32) 0%, transparent 60%)" }}
        />
        <div
          className="absolute -bottom-40 right-0 w-[520px] h-[520px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(20,184,166,0.20) 0%, transparent 60%)" }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 grid place-items-center shadow-lg shadow-emerald-600/40">
            <ShoppingCart size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">RetailAnalytics</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Spark · Dataproc</div>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-md">
          <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold mb-3">
            Plataforma analítica
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-[1.1]">
            Analítica transaccional procesada con <span className="text-emerald-400">Apache Spark</span> sobre Google
            Cloud Dataproc.
          </h1>
          <p className="text-sm text-slate-400 mt-5 leading-relaxed">
            KPIs en tiempo real, segmentación K-Means de clientes y recomendaciones FP-Growth sobre las transacciones de
            la red de supermercados.
          </p>
        </div>

        <div className="relative z-10 mt-12 flex items-center justify-between text-[11px] text-slate-500">
          <span>ICESI · Procesamiento Distribuido de Datos · 2026-1</span>
          <span className="font-mono">v0.4.2</span>
        </div>
      </aside>

      <main className="flex flex-col px-6 sm:px-12 py-10">
        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white grid place-items-center">
            <ShoppingCart size={18} strokeWidth={2} />
          </div>
          <div className="text-sm font-semibold tracking-tight text-slate-900">RetailAnalytics</div>
        </div>

        <div className="m-auto w-full max-w-sm">
          <div className="text-[11px] uppercase tracking-wider text-emerald-600 font-semibold mb-3">
            Acceso a la plataforma
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Inicia sesión</h2>
          <p className="text-sm text-slate-500 mt-1.5">
            Ingresa con tus credenciales asignadas por el administrador.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Usuario o correo</label>
              <div className="relative">
                <UserPlus size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="admin"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">Contraseña</label>
                <button type="button" className="text-[11px] text-slate-400 hover:text-slate-600">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 fade-in">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all",
                loading ? "bg-emerald-500 cursor-wait" : "bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/20",
              )}
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  Iniciar sesión <ArrowUpRight size={15} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              Credenciales de demostración
            </div>
            <div className="space-y-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.u}
                  type="button"
                  onClick={() => fillDemo(d.u, d.p)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <Badge tone={d.tone} className="py-0.5!">
                      {d.role}
                    </Badge>
                    <span className="font-mono text-xs text-slate-600">{d.u}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-xs text-slate-400">{d.p}</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-emerald-600 transition-colors" />
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
              Toca una fila para autocompletar. Los usuarios se almacenan localmente.
            </p>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 text-center mt-auto pt-10">
          © 2026 RetailAnalytics · Universidad ICESI
        </div>
      </main>
    </div>
  );
}
