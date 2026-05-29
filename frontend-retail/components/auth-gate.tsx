"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LoadingBlock } from "@/components/states";

export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !currentUser) router.replace("/login");
  }, [ready, currentUser, router]);

  if (!ready || !currentUser) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <LoadingBlock label="Verificando sesión…" />
      </div>
    );
  }

  return <>{children}</>;
}
