import type {
  KpisResponse,
  TopProduct,
  TopCustomer,
  CategoriesResponse,
  CalendarResponse,
  CoverageResponse,
  Granularity,
  TimeSeriesResponse,
  BoxplotCategory,
  WeekdayDistribution,
  CorrelationResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`/api${path}`, API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor de datos.", 0);
  }
  if (!res.ok) {
    throw new ApiError(`Error ${res.status} al consultar ${path}.`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  kpis: () => get<KpisResponse>("/summary/kpis"),
  topProducts: (limit = 10) => get<TopProduct[]>("/summary/top-products", { limit }),
  topCustomers: (limit = 10) => get<TopCustomer[]>("/summary/top-customers", { limit }),
  categories: () => get<CategoriesResponse>("/summary/categories"),
  calendar: (days = 90) => get<CalendarResponse>("/summary/calendar", { days }),
  coverage: () => get<CoverageResponse>("/summary/coverage"),
  timeseries: (granularity: Granularity) =>
    get<TimeSeriesResponse>("/viz/timeseries", { granularity }),
  boxplotCategories: () => get<BoxplotCategory[]>("/viz/boxplot-categories"),
  weekdayDistribution: () => get<WeekdayDistribution[]>("/viz/weekday-distribution"),
  correlation: () => get<CorrelationResponse>("/viz/correlation"),
};
