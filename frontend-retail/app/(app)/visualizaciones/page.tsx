"use client";

import { useCallback, useState } from "react";
import { TrendingUp, BarChart3, CalendarDays, Link2 } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Card, CardHeader, Segmented } from "@/components/ui";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/states";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { Boxplot } from "@/components/charts/boxplot";
import { WeekdayDistributionChart } from "@/components/charts/weekday-distribution";
import { CorrelationHeatmap } from "@/components/charts/correlation-heatmap";
import { useFetch } from "@/lib/use-fetch";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/constants";
import type { Granularity } from "@/lib/types";

function TimeSeriesCard() {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const ts = useFetch(() => api.timeseries(granularity), [granularity]);
  const granLabel = granularity === "day" ? "día" : granularity === "week" ? "semana" : "mes";

  return (
    <Card>
      <CardHeader
        icon={<TrendingUp size={16} />}
        title="Serie de tiempo · unidades vendidas"
        subtitle="Agregación seleccionable sobre el período"
        right={
          <Segmented
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: "day", label: "Día" },
              { value: "week", label: "Semana" },
              { value: "month", label: "Mes" },
            ]}
          />
        }
      />
      {ts.loading ? (
        <LoadingBlock height={380} />
      ) : ts.error ? (
        <ErrorBlock message={ts.error} onRetry={ts.reload} height={380} />
      ) : !ts.data?.points.length ? (
        <EmptyBlock height={380} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-5 pb-5 border-b border-slate-100">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Total</div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatNumber(ts.data.total)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Promedio por {granLabel}
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                {formatNumber(Math.round(ts.data.avg))}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pico</div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatNumber(ts.data.peak)}</div>
            </div>
          </div>
          <TimeSeriesChart points={ts.data.points} granularity={granularity} />
        </>
      )}
    </Card>
  );
}

function BoxplotCard() {
  const box = useFetch(() => api.boxplotCategories(), []);
  return (
    <Card>
      <CardHeader
        icon={<BarChart3 size={16} />}
        title="Distribución de unidades por categoría"
        subtitle="Boxplot · min / Q1 / mediana / Q3 / max"
      />
      {box.loading ? (
        <LoadingBlock height={320} />
      ) : box.error ? (
        <ErrorBlock message={box.error} onRetry={box.reload} height={320} />
      ) : !box.data?.length ? (
        <EmptyBlock height={320} />
      ) : (
        <Boxplot data={box.data} />
      )}
    </Card>
  );
}

function WeekdayCard() {
  const wd = useFetch(() => api.weekdayDistribution(), []);
  return (
    <Card>
      <CardHeader
        icon={<CalendarDays size={16} />}
        title="Distribución por día de la semana"
        subtitle="Identifica los picos semanales de actividad"
      />
      <div className="flex items-center justify-end gap-3 text-xs mb-2">
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          Fin de semana
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Entre semana
        </span>
      </div>
      {wd.loading ? (
        <LoadingBlock height={280} />
      ) : wd.error ? (
        <ErrorBlock message={wd.error} onRetry={wd.reload} height={280} />
      ) : !wd.data?.length ? (
        <EmptyBlock height={280} />
      ) : (
        <WeekdayDistributionChart data={wd.data} />
      )}
    </Card>
  );
}

function CorrelationCard() {
  const corr = useFetch(() => api.correlation(), []);
  return (
    <Card>
      <CardHeader
        icon={<Link2 size={16} />}
        title="Heatmap de correlación"
        subtitle="Matriz entre variables de comportamiento"
        right={
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>−1</span>
            <div
              className="w-32 h-2 rounded-full"
              style={{
                background: "linear-gradient(to right, #ef4444, #fff, #059669)",
                border: "1px solid #e2e8f0",
              }}
            />
            <span>+1</span>
          </div>
        }
      />
      {corr.loading ? (
        <LoadingBlock height={300} />
      ) : corr.error ? (
        <ErrorBlock message={corr.error} onRetry={corr.reload} height={300} />
      ) : !corr.data?.labels.length ? (
        <EmptyBlock height={300} />
      ) : (
        <CorrelationHeatmap labels={corr.data.labels} matrix={corr.data.matrix} />
      )}
    </Card>
  );
}

export default function VisualizacionesPage() {
  // Refresh re-mounts the cards via key bump.
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return (
    <div className="view-enter">
      <PageHeader
        eyebrow="Visualizaciones"
        title="Analítica exploratoria"
        subtitle="Cuatro ángulos del comportamiento transaccional: evolución temporal, dispersión por categoría, distribución semanal y correlaciones."
        onRefresh={refresh}
      />
      <section key={nonce} className="grid grid-cols-1 gap-6">
        <TimeSeriesCard />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BoxplotCard />
          <WeekdayCard />
        </div>
        <CorrelationCard />
      </section>
    </div>
  );
}
