import type {
  KpisResponse,
  TopProduct,
  TopCustomer,
  CustomerSortBy,
  CategoriesResponse,
  CalendarResponse,
  CoverageResponse,
  PeakTimeseriesResponse,
  Granularity,
  TimeSeriesResponse,
  BoxplotDimension,
  BoxplotResponse,
  WeekdayDistribution,
  CorrelationResponse,
  MetaResponse,
  DataFilters,
  SegmentsResponse,
  SegmentPoint,
  RecommendationSeedsResponse,
  RecommendationSearchResponse,
  ProductRecommendationsResponse,
  CustomerRecommendationsResponse,
  JobStatus,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  /** Seconds to wait before retrying, from the `Retry-After` header (429). */
  retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

type ParamValue = string | number | undefined | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string, params?: Record<string, ParamValue>): Promise<T> {
  const url = new URL(`/api${path}`, API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  // Retry transient failures (network drop / 5xx / 503 while the Parquet is being
  // overwritten by a recompute) a couple of times with a short backoff.
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
    } catch {
      if (attempt < attempts) {
        await sleep(400 * attempt);
        continue;
      }
      throw new ApiError("No se pudo conectar con el servidor de datos.", 0);
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < attempts) {
        await sleep(400 * attempt);
        continue;
      }
      throw new ApiError(`Error ${res.status} al consultar ${path}.`, res.status);
    }
    return (await res.json()) as T;
  }
  // Unreachable — the loop either returns or throws.
  throw new ApiError("No se pudo consultar el servidor.", 0);
}

async function post<T>(path: string): Promise<T> {
  const url = new URL(`/api${path}`, API_BASE);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor de datos.", 0);
  }
  if (!res.ok) {
    let detail = `Error ${res.status} al ejecutar ${path}.`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // non-JSON error body — keep the default message
    }
    const ra = res.headers.get("Retry-After");
    throw new ApiError(detail, res.status, ra ? Number(ra) : undefined);
  }
  return (await res.json()) as T;
}

// Translate global filters into query params shared by every data endpoint.
function filterParams(f?: DataFilters): Record<string, ParamValue> {
  if (!f) return {};
  return {
    stores: f.stores.length ? f.stores.join(",") : undefined,
    from: f.from ?? undefined,
    to: f.to ?? undefined,
  };
}

export const api = {
  meta: () => get<MetaResponse>("/meta"),

  kpis: (f?: DataFilters) => get<KpisResponse>("/summary/kpis", filterParams(f)),
  topProducts: (limit = 10, f?: DataFilters) =>
    get<TopProduct[]>("/summary/top-products", { limit, ...filterParams(f) }),
  topCustomers: (limit = 10, by: CustomerSortBy = "transactions", f?: DataFilters) =>
    get<TopCustomer[]>("/summary/top-customers", { limit, by, ...filterParams(f) }),
  categories: (f?: DataFilters) => get<CategoriesResponse>("/summary/categories", filterParams(f)),
  calendar: (days = 90, f?: DataFilters) =>
    get<CalendarResponse>("/summary/calendar", { days, ...filterParams(f) }),
  peakTimeseries: (f?: DataFilters) =>
    get<PeakTimeseriesResponse>("/summary/peak-timeseries", filterParams(f)),
  coverage: (f?: DataFilters) => get<CoverageResponse>("/summary/coverage", filterParams(f)),

  timeseries: (granularity: Granularity, f?: DataFilters) =>
    get<TimeSeriesResponse>("/viz/timeseries", { granularity, ...filterParams(f) }),
  boxplot: (dimension: BoxplotDimension, f?: DataFilters) =>
    get<BoxplotResponse>("/viz/boxplot", { dimension, ...filterParams(f) }),
  weekdayDistribution: (f?: DataFilters) =>
    get<WeekdayDistribution[]>("/viz/weekday-distribution", filterParams(f)),
  correlation: (f?: DataFilters) => get<CorrelationResponse>("/viz/correlation", filterParams(f)),

  segments: (pointsPerSegment = 120) =>
    get<SegmentsResponse>("/advanced/segments", { points_per_segment: pointsPerSegment }),
  segmentCustomers: (segmentId?: number, limit = 25) =>
    get<SegmentPoint[]>("/advanced/segments/customers", { segment_id: segmentId, limit }),
  recommendationSeeds: (limit = 20) =>
    get<RecommendationSeedsResponse>("/advanced/recommendations/seeds", { limit }),
  recommendationSearch: (mode: "product" | "customer", q: string, limit = 20) =>
    get<RecommendationSearchResponse>("/advanced/recommendations/search", { mode, q, limit }),

  // Async Spark jobs: recompute models (from curated Parquet) / reingest dataset.
  startRecompute: () => post<JobStatus>("/advanced/recompute"),
  startReingest: () => post<JobStatus>("/admin/reingest"),
  jobStatus: () => get<JobStatus>("/jobs/status"),
  productRecommendations: (productId?: string, limit = 8) =>
    get<ProductRecommendationsResponse>("/advanced/recommendations/products", { product_id: productId, limit }),
  customerRecommendations: (clientId?: string, limit = 8) =>
    get<CustomerRecommendationsResponse>("/advanced/recommendations/customers", { client_id: clientId, limit }),
};
