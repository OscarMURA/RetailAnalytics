"use client";

import { useCallback, useState } from "react";
import { PackageSearch, Sparkles, UserRound, Network, Cpu } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Badge, Card, CardHeader, Segmented } from "@/components/ui";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/states";
import { EntitySearch } from "@/components/entity-search";
import { JobButton } from "@/components/job-button";
import { HorizontalBars } from "@/components/charts/horizontal-bars";
import { useFetch } from "@/lib/use-fetch";
import { useReportExport } from "@/lib/use-report-export";
import { api } from "@/lib/api";
import { PALETTE, formatNumber } from "@/lib/constants";
import type { ProductRecommendationItem } from "@/lib/types";

type Mode = "product" | "customer";

export default function RecomendadorPage() {
  const [mode, setMode] = useState<Mode>("product");
  const [productId, setProductId] = useState<string | undefined>();
  const [clientId, setClientId] = useState<string | undefined>();
  const { rootRef, exporting, exportPdf } = useReportExport();

  const productRecs = useFetch(() => api.productRecommendations(productId, 10), [productId], {
    cacheKey: "productRecs",
  });
  const customerRecs = useFetch(() => api.customerRecommendations(clientId, 10), [clientId], {
    cacheKey: "customerRecs",
  });

  // El origen efectivo es lo elegido en el buscador o, por defecto, el que la API
  // resuelve (top por volumen) y devuelve como semilla del recomendador.
  const selectedProductId = productId ?? productRecs.data?.seed?.code ?? "";
  const selectedClientId = clientId ?? customerRecs.data?.customer?.clientId ?? "";

  const reloadAll = useCallback(() => {
    productRecs.reload();
    customerRecs.reload();
  }, [productRecs, customerRecs]);

  const activeItems = mode === "product" ? productRecs.data?.items : customerRecs.data?.items;

  const handleExport = () =>
    exportPdf({
      title: "Recomendador de productos",
      eyebrow: "Análisis avanzado",
      subtitle:
        "Reglas de asociación por co-ocurrencia en canasta: confianza, lift y score para venta cruzada.",
      filename: "RetailAnalytics-Recomendador.pdf",
      meta: [
        { label: "Generado", value: new Date().toLocaleDateString("es-CO") },
        { label: "Modo", value: mode === "product" ? "Producto → productos" : "Cliente → productos" },
        {
          label: "Origen",
          value:
            mode === "product"
              ? productRecs.data?.seed?.label ?? "—"
              : customerRecs.data?.customer?.clientId ?? "—",
        },
      ],
    });

  return (
    <div className="view-enter" ref={rootRef}>
      <PageHeader
        eyebrow="Análisis avanzado"
        title="Recomendador de productos"
        subtitle="Reglas de asociación por co-ocurrencia en canasta: confianza, lift y score para venta cruzada."
        onRefresh={reloadAll}
        onExport={handleExport}
        exporting={exporting}
        actions={
          <JobButton
            kind="recompute"
            idleLabel="Recalcular"
            runningVerb="Recalculando"
            icon={Cpu}
            onDone={reloadAll}
            title="Re-ejecuta K-Means y las reglas de asociación con Spark (puede tardar unos minutos)."
          />
        }
      />

      <section data-report-section className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <Card accent className="xl:col-span-1">
          <CardHeader
            icon={<Sparkles size={16} />}
            title="Modo de recomendación"
            subtitle="Selecciona producto semilla o cliente objetivo"
            right={
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "product", label: "Producto" },
                  { value: "customer", label: "Cliente" },
                ]}
              />
            }
          />

          {mode === "product" ? (
            <div className="space-y-4">
              <label className="block text-xs font-medium text-slate-600">Producto origen</label>
              <EntitySearch
                mode="product"
                selectedId={selectedProductId}
                selectedLabel={productRecs.data?.seed?.label}
                onSelect={setProductId}
              />
              {productRecs.loading ? (
                <LoadingBlock height={150} />
              ) : productRecs.error ? (
                <ErrorBlock message={productRecs.error} onRetry={productRecs.reload} height={150} />
              ) : productRecs.data?.seed ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <Badge tone="emerald">Semilla</Badge>
                  <h3 className="text-lg font-bold text-slate-900 mt-3">{productRecs.data.seed.label}</h3>
                  <p className="text-xs text-slate-500 mt-1">{productRecs.data.seed.category}</p>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <Metric label="Unidades" value={formatNumber(productRecs.data.seed.units)} />
                    <Metric label="Transacciones" value={formatNumber(productRecs.data.seed.transactions)} />
                  </div>
                </div>
              ) : (
                <EmptyBlock height={150} message="Producto sin datos." />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-xs font-medium text-slate-600">Cliente objetivo</label>
              <EntitySearch
                mode="customer"
                selectedId={selectedClientId}
                selectedLabel={customerRecs.data?.customer?.clientId}
                onSelect={setClientId}
              />
              {customerRecs.loading ? (
                <LoadingBlock height={150} />
              ) : customerRecs.error ? (
                <ErrorBlock message={customerRecs.error} onRetry={customerRecs.reload} height={150} />
              ) : customerRecs.data?.customer ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <Badge tone="blue">{customerRecs.data.customer.segmentName}</Badge>
                  <h3 className="text-lg font-bold text-slate-900 mt-3">{customerRecs.data.customer.clientId}</h3>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <Metric label="Compras" value={formatNumber(customerRecs.data.customer.frequency)} />
                    <Metric label="Unidades" value={formatNumber(customerRecs.data.customer.unitsTotal)} />
                    <Metric label="Productos" value={formatNumber(customerRecs.data.customer.distinctProducts)} />
                    <Metric label="Categorías" value={formatNumber(customerRecs.data.customer.distinctCategories)} />
                  </div>
                </div>
              ) : (
                <EmptyBlock height={150} message="Cliente sin datos." />
              )}
            </div>
          )}
        </Card>

        <Card accent className="xl:col-span-2">
          <CardHeader
            icon={mode === "product" ? <PackageSearch size={16} /> : <UserRound size={16} />}
            title={mode === "product" ? "Productos comprados junto al origen" : "Productos sugeridos para el cliente"}
            subtitle="Ranking por score = confianza x lift"
            right={<Badge tone="slate">reglas de asociación</Badge>}
          />
          {(mode === "product" ? productRecs.loading : customerRecs.loading) ? (
            <LoadingBlock height={330} />
          ) : (mode === "product" ? productRecs.error : customerRecs.error) ? (
            <ErrorBlock message={(mode === "product" ? productRecs.error : customerRecs.error) ?? "Error"} onRetry={mode === "product" ? productRecs.reload : customerRecs.reload} height={330} />
          ) : !activeItems?.length ? (
            <EmptyBlock height={330} />
          ) : (
            <HorizontalBars
              color={mode === "product" ? PALETTE.emerald600 : PALETTE.blue500}
              data={activeItems.map((item) => ({
                label: item.label,
                value: Math.round(item.score * 1000),
                subtitle: `${item.category} · confianza ${(item.confidence * 100).toFixed(1)}% · lift ${item.lift.toFixed(2)}`,
                title: `${item.label} · ${item.category} · ${formatNumber(item.cooccurrences)} co-ocurrencias`,
              }))}
            />
          )}
        </Card>
      </section>

      <section data-report-section>
        <Card accent>
          <CardHeader
            icon={<Network size={16} />}
            title="Detalle de reglas"
            subtitle="Métricas usadas para priorizar las recomendaciones"
          />
          {(mode === "product" ? productRecs.loading : customerRecs.loading) ? (
            <LoadingBlock height={280} />
          ) : !activeItems?.length ? (
            <EmptyBlock height={280} />
          ) : (
            <RecommendationTable items={activeItems} mode={mode} />
          )}
        </Card>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums leading-none">{value}</div>
    </div>
  );
}

function RecommendationTable({ items, mode }: { items: ProductRecommendationItem[]; mode: Mode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
            <th className="py-2 pr-4 font-semibold">Producto</th>
            <th className="py-2 px-4 font-semibold">Categoría</th>
            <th className="py-2 px-4 font-semibold text-right">Co-ocurrencias</th>
            <th className="py-2 px-4 font-semibold text-right">Confianza</th>
            <th className="py-2 px-4 font-semibold text-right">Lift</th>
            <th className="py-2 px-4 font-semibold text-right">Score</th>
            {mode === "customer" && <th className="py-2 pl-4 font-semibold text-right">Evidencia</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.code} className="text-slate-700">
              <td className="py-3 pr-4 font-medium text-slate-900 whitespace-nowrap">{item.label}</td>
              <td className="py-3 px-4 min-w-56"><span className="block truncate">{item.category}</span></td>
              <td className="py-3 px-4 text-right tabular-nums">{formatNumber(item.cooccurrences)}</td>
              <td className="py-3 px-4 text-right tabular-nums">{(item.confidence * 100).toFixed(1)}%</td>
              <td className="py-3 px-4 text-right tabular-nums">{item.lift.toFixed(2)}</td>
              <td className="py-3 px-4 text-right tabular-nums">{item.score.toFixed(3)}</td>
              {mode === "customer" && <td className="py-3 pl-4 text-right tabular-nums">{formatNumber(item.evidenceProducts)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
