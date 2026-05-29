import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/shell";
import { FiltersProvider } from "@/lib/filters";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <FiltersProvider>
        <AppShell>{children}</AppShell>
      </FiltersProvider>
    </AuthGate>
  );
}
