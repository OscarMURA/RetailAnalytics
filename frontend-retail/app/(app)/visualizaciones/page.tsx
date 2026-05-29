"use client";

import { useState } from "react";
import { TrendingUp, BarChart3, CalendarDays, Link2 } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Card, CardHeader, Segmented } from "@/components/ui";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/states";
import { Interpretation } from "@/components/interpretation";
import { TimeSeriesChart, type SeriesMetric } from "@/components/charts/time-series";
import { Boxplot, UNIT_LABELS } from "@/components/charts/boxplot";
import { WeekdayDistributionChart } from "@/components/charts/weekday-distribution";
import { CorrelationHeatmap } from "@/components/charts/correlation-heatmap";
import { useFetch } from "@/lib/use-fetch";
import { useFilters } from "@/lib/filters";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/constants";
import type { Granularity, BoxplotDimension, CorrelationResponse } from "@/lib/types";

function TimeSeriesCard({ fkey, filters }: { fkey: string; filters: ReturnType<typeof useFilters>["filters"] }) {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [metric, setMetric] = useState<SeriesMetric>("both");
  const ts = useFetch(() => api.timeseries(granularity, filters), [granularity, fkey]);
  const granLabel = granularity === "day" ? "día" : granularity === "week" ? "semana" : "mes";

  return (
    <Card accent>
      <CardHeader
        icon={<TrendingUp size={16} />}
        title="Serie de tiempo · unidades y transacciones"
        subtitle="Agregación y métrica seleccionables sobre el período"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={metric}
              onChange={setMetric}
              options={[
                { value: "units", label: "Unidades" },
                { value: "transactions", label: "Transacc." },
                { value: "both", label: "Ambas" },
              ]}
            />
            <Segmented
              value={granularity}
              onChange={setGranularity}
              options={[
                { value: "day", label: "Día" },
                { value: "week", label: "Semana" },
                { value: "month", label: "Mes" },
              ]}
            />
          </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 mb-5 pb-5 border-b border-slate-100">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Total unidades
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatNumber(ts.data.total)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Total transacc.
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                {formatNumber(ts.data.totalTransactions)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Promedio u/{granLabel}
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                {formatNumber(Math.round(ts.data.avg))}
              </div>
            </div>
          </div>
          <TimeSeriesChart points={ts.data.points} granularity={granularity} metric={metric} />
          <Interpretation>
            La serie muestra la evolución de unidades vendidas (eje izquierdo) y número de transacciones (eje derecho)
            por {granLabel}. El pico de unidades alcanzó {formatNumber(ts.data.peak)} en una sola ventana. Compara ambas
            curvas para distinguir si los aumentos provienen de más transacciones o de canastas más grandes.
          </Interpretation>
        </>
      )}
    </Card>
  );
}

const DIMENSION_LABELS: Record<BoxplotDimension, string> = {
  "units-per-category": "Unidades por categoría",
  "units-per-customer": "Unidades por cliente",
  "transactions-per-customer": "Transacciones por cliente",
};

function BoxplotCard({ fkey, filters }: { fkey: string; filters: ReturnType<typeof useFilters>["filters"] }) {
  const [dimension, setDimension] = useState<BoxplotDimension>("units-per-category");
  const [logScale, setLogScale] = useState(false);
  const box = useFetch(() => api.boxplot(dimension, filters), [dimension, fkey]);

  return (
    <Card accent>
      <CardHeader
        icon={<BarChart3 size={16} />}
        title="Distribución (boxplot)"
        subtitle="min / Q1 / mediana / Q3 / max"
        right={
          <button
            onClick={() => setLogScale((v) => !v)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              logScale
                ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            Escala log
          </button>
        }
      />
      <div className="mb-4">
        <Segmented
          value={dimension}
          onChange={setDimension}
          options={[
            { value: "units-per-category", label: "U / categoría" },
            { value: "units-per-customer", label: "U / cliente" },
            { value: "transactions-per-customer", label: "Tx / cliente" },
          ]}
        />
      </div>
      {box.loading ? (
        <LoadingBlock height={340} />
      ) : box.error ? (
        <ErrorBlock message={box.error} onRetry={box.reload} height={340} />
      ) : !box.data?.boxes.length ? (
        <EmptyBlock height={340} />
      ) : (
        <>
          <Boxplot data={box.data.boxes} logScale={logScale} unit={UNIT_LABELS[dimension]} />
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Conteo</div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {formatNumber(box.data.stats.count)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Media</div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {box.data.stats.mean.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Mediana</div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {box.data.stats.p50.toFixed(1)}
              </div>
            </div>
          </div>
          <Interpretation>
            Cada caja resume la dispersión de <strong>{DIMENSION_LABELS[dimension].toLowerCase()}</strong>: la línea
            central es la mediana y los bigotes el rango. Cajas altas y bigotes largos indican gran variabilidad.
            {logScale
              ? " La escala logarítmica comprime los valores extremos para comparar mejor las distribuciones sesgadas."
              : " Activa la escala logarítmica si unas pocas categorías con valores muy altos aplastan al resto."}
          </Interpretation>
        </>
      )}
    </Card>
  );
}

function WeekdayCard({ fkey, filters }: { fkey: string; filters: ReturnType<typeof useFilters>["filters"] }) {
  const wd = useFetch(() => api.weekdayDistribution(filters), [fkey]);
  return (
    <Card accent>
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

// Strongest off-diagonal correlation pair (by absolute value) for a dynamic insight.
function strongestPair(corr: CorrelationResponse): { a: string; b: string; v: number } | null {
  let best: { a: string; b: string; v: number } | null = null;
  for (let i = 0; i < corr.matrix.length; i++) {
    for (let j = i + 1; j < corr.matrix[i].length; j++) {
      const v = corr.matrix[i][j];
      if (!best || Math.abs(v) > Math.abs(best.v)) best = { a: corr.labels[i], b: corr.labels[j], v };
    }
  }
  return best;
}

function CorrelationCard({ fkey, filters }: { fkey: string; filters: ReturnType<typeof useFilters>["filters"] }) {
  const corr = useFetch(() => api.correlation(filters), [fkey]);
  const pair = corr.data ? strongestPair(corr.data) : null;
  return (
    <Card accent>
      <CardHeader
        icon={<Link2 size={16} />}
        title="Heatmap de correlación"
        subtitle="Matriz entre variables de comportamiento del cliente"
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
        <>
          <CorrelationHeatmap labels={corr.data.labels} matrix={corr.data.matrix} />
          {pair && (
            <Interpretation>
              La relación más fuerte es entre <strong>{pair.a}</strong> y <strong>{pair.b}</strong> (r ={" "}
              {pair.v.toFixed(2)}), una correlación {pair.v >= 0 ? "positiva" : "negativa"}{" "}
              {Math.abs(pair.v) >= 0.7 ? "alta" : Math.abs(pair.v) >= 0.4 ? "moderada" : "baja"}. Valores cercanos a ±1
              indican que las dos variables se mueven juntas (o en sentido opuesto); la recencia suele correlacionar de
              forma inversa con las métricas de actividad.
            </Interpretation>
          )}
        </>
      )}
    </Card>
  );
}

export default function VisualizacionesPage() {
  const { filters } = useFilters();
  const fkey = JSON.stringify(filters);
  const [nonce, setNonce] = useState(0);

  return (
    <div className="view-enter">
      <PageHeader
        eyebrow="Visualizaciones"
        title="Analítica exploratoria"
        subtitle="Evolución temporal, dispersión por dimensión, distribución semanal y correlaciones — con interpretación de cada gráfica."
        onRefresh={() => setNonce((n) => n + 1)}
        showFilters
      />
      <section key={`${fkey}-${nonce}`} className="grid grid-cols-1 gap-4 sm:gap-6">
        <TimeSeriesCard fkey={fkey} filters={filters} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          <BoxplotCard fkey={fkey} filters={filters} />
          <WeekdayCard fkey={fkey} filters={filters} />
        </div>
        <CorrelationCard fkey={fkey} filters={filters} />
      </section>
    </div>
  );
}
