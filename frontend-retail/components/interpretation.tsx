import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function Interpretation({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-start gap-2.5 rounded-lg bg-gradient-to-br from-emerald-50/80 to-slate-50 border border-emerald-100/70 px-3.5 py-3">
        <span className="w-6 h-6 rounded-md bg-emerald-100/70 text-emerald-600 grid place-items-center shrink-0 mt-px">
          <Info size={14} />
        </span>
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-emerald-700">Interpretación. </span>
          {children}
        </div>
      </div>
    </div>
  );
}
