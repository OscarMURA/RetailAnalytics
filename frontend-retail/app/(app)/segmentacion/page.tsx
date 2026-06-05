"use client";

import { useCallback, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { BarChart3, Users, Target, Clock } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Badge, Card, CardHeader, Segmented } from "@/components/ui";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/states";
import { useFetch } from "@/lib/use-fetch";
import { api } from "@/lib/api";
import { CHART_COLORS, formatNumber } from "@/lib/constants";
import type { SegmentPoint, SegmentSummary } from "@/lib/types";

const segmentTone = ["slate", "blue", "teal", "emerald"] as const;

function SegmentTooltip({ active, payload }: { active?: boolean; payload?: { payload: SegmentPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white rounded-lg shadow-pop px-3 py-2 text-xs min-w-52">
      <div className="font-semibold mb-1">{p.clientId}</div>
      <div className="text-slate-300">{p.segmentName}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <span className="text-slate-400">Frecuencia</span><span>{formatNumber(p.frequency)}</span>
        <span className="text-slate-400">Unidades</span><span>{formatNumber(p.unitsTotal)}</span>
        <span className="text-slate-400">Productos</span><span>{formatNumber(p.distinctProducts)}</span>
        <span className="text-slate-400">Recencia</span><span>{formatNumber(p.recencyDays)} d</span>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums leading-none">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1 truncate">{hint}</div>}
    </div>
  );
}

export default function SegmentacionPage() {
  const [segmentId, setSegmentId] = useState<"all" | "1" | "2" | "3" | "4">("all");
  const segments = useFetch(() => api.segments(130), []);
  const customers = useFetch(
    () => api.segmentCustomers(segmentId === "all" ? undefined : Number(segmentId), 25),
    [segmentId],
  );

  const reloadAll = useCallback(() => {
    segments.reload();
    customers.reload();
  }, [segments, customers]);

  const selected = segmentId === "all" ? null : segments.data?.segments.find((s) => s.segmentId === Number(segmentId));
  const totalCustomers = segments.data?.segments.reduce((acc, s) => acc + s.customers, 0) ?? 0;

  return (
    <div className="view-enter">
      <PageHeader
        eyebrow="Análisis avanzado"
        title="Segmentación de clientes"
        subtitle="K-Means sobre frecuencia, volumen, diversidad, canasta promedio y recencia para clasificar clientes accionables."
        onRefresh={reloadAll}
      />

      {segments.loading ? (
        <LoadingBlock height={420} />
      ) : segments.error ? (
        <ErrorBlock message={segments.error} onRetry={segments.reload} height={360} />
      ) : !segments.data ? (
        <EmptyBlock height={360} />
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-6">
            {segments.data.segments.map((s) => (
              <Card key={s.segmentId} accent interactive className="p-5!">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <Badge tone={segmentTone[s.segmentId - 1]}>Segmento {s.segmentId}</Badge>
                    <h2 className="text-base font-semibold text-slate-900 mt-3 truncate">{s.name}</h2>
                  </div>
                  <div className="w-9 h-9 rounded-lg grid place-items-center text-white" style={{ background: CHART_COLORS[(s.segmentId - 1) % CHART_COLORS.length] }}>
                    <Users size={17} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Metric label="Clientes" value={formatNumber(s.customers)} hint={`${s.sharePct.toFixed(1)}% del total`} />
                  <Metric label="Frecuencia" value={s.avgFrequency.toFixed(1)} hint="compras prom." />
                  <Metric label="Unidades" value={s.avgUnitsTotal.toFixed(1)} hint="volumen prom." />
                  <Metric label="Canasta" value={s.avgBasketSize.toFixed(1)} hint="productos/tx" />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{s.description}</p>
              </Card>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-6">
            <Card accent className="xl:col-span-2">
              <CardHeader
                icon={<BarChart3 size={16} />}
                title="Mapa de clusters"
                subtitle="Eje X: frecuencia · Eje Y: unidades totales · tamaño: diversidad de productos"
                right={<Badge tone="slate">{formatNumber(totalCustomers)} clientes modelados</Badge>}
              />
              <div className="h-[390px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="frequency" name="Frecuencia" type="number" tick={{ fontSize: 11 }} stroke="#64748b" />
                    <YAxis dataKey="unitsTotal" name="Unidades" type="number" tick={{ fontSize: 11 }} stroke="#64748b" />
                    <ZAxis dataKey="distinctProducts" range={[45, 260]} />
                    <Tooltip content={<SegmentTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                    {segments.data.segments.map((s, i) => (
                      <Scatter
                        key={s.segmentId}
                        name={s.name}
                        data={segments.data!.points.filter((p) => p.segmentId === s.segmentId)}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.78}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card accent>
              <CardHeader icon={<Target size={16} />} title="Perfil seleccionado" subtitle="Descripción operativa del grupo" />
              {selected ? <SegmentDetail segment={selected} /> : <SegmentDetail segment={segments.data.segments[3]} />}
            </Card>
          </section>
        </>
      )}

      <section>
        <Card accent>
          <CardHeader
            icon={<Clock size={16} />}
            title="Clientes destacados"
            subtitle="Ordenados por volumen total y frecuencia de compra"
            right={
              <Segmented
                value={segmentId}
                onChange={setSegmentId}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "1", label: "S1" },
                  { value: "2", label: "S2" },
                  { value: "3", label: "S3" },
                  { value: "4", label: "S4" },
                ]}
              />
            }
          />
          {customers.loading ? (
            <LoadingBlock height={300} />
          ) : customers.error ? (
            <ErrorBlock message={customers.error} onRetry={customers.reload} height={300} />
          ) : !customers.data?.length ? (
            <EmptyBlock height={300} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-4 font-semibold">Cliente</th>
                    <th className="py-2 px-4 font-semibold">Segmento</th>
                    <th className="py-2 px-4 font-semibold text-right">Frecuencia</th>
                    <th className="py-2 px-4 font-semibold text-right">Unidades</th>
                    <th className="py-2 px-4 font-semibold text-right">Productos</th>
                    <th className="py-2 pl-4 font-semibold text-right">Recencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.data.map((c) => (
                    <tr key={c.clientId} className="text-slate-700">
                      <td className="py-3 pr-4 font-medium text-slate-900 whitespace-nowrap">{c.clientId}</td>
                      <td className="py-3 px-4 whitespace-nowrap"><Badge tone={segmentTone[c.segmentId - 1]}>{c.segmentName}</Badge></td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatNumber(c.frequency)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatNumber(c.unitsTotal)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatNumber(c.distinctProducts)}</td>
                      <td className="py-3 pl-4 text-right tabular-nums">{formatNumber(c.recencyDays)} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function SegmentDetail({ segment }: { segment: SegmentSummary }) {
  return (
    <div className="space-y-4">
      <div>
        <Badge tone={segmentTone[segment.segmentId - 1]}>Segmento {segment.segmentId}</Badge>
        <h3 className="text-xl font-bold text-slate-900 mt-3">{segment.name}</h3>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{segment.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
        <Metric label="Participación" value={`${segment.sharePct.toFixed(1)}%`} hint="base clientes" />
        <Metric label="Recencia" value={`${segment.avgRecencyDays.toFixed(1)} d`} hint="promedio" />
        <Metric label="Productos" value={segment.avgDistinctProducts.toFixed(1)} hint="distintos" />
        <Metric label="Categorías" value={segment.avgDistinctCategories.toFixed(1)} hint="distintas" />
      </div>
    </div>
  );
}
