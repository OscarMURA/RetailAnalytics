"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !currentUser) router.replace("/login");
  }, [ready, currentUser, router]);

  if (!ready || !currentUser) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f6f8fa]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl grid place-items-center text-white shadow-pop animate-pulse"
            style={{ background: "var(--gradient-brand)" }}
          >
            <ShoppingCart size={22} strokeWidth={2} />
          </div>
          <span className="text-xs font-medium text-slate-400">Verificando sesión…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
