// Typed contract for the RetailAnalytics FastAPI backend.
// Mirrors the shapes documented in backend/API_CONTRACT.md.

export type KpiIcon = "package" | "activity" | "users" | "box";
export type KpiDirection = "up" | "down" | "flat";

export interface Kpi {
  key: string;
  label: string;
  value: number;
  delta: number;
  direction: KpiDirection;
  icon: KpiIcon;
}

export interface KpisResponse {
  kpis: Kpi[];
}

export interface TopProduct {
  rank: number;
  code: string;
  label: string;
  category: string;
  units: number;
}

export interface TopCustomer {
  rank: number;
  id: string;
  units: number;
}

export interface CategoryItem {
  name: string;
  value: number;
}

export interface CategoriesResponse {
  items: CategoryItem[];
  activeCount: number;
  totalCount: number;
}

export interface CalendarDay {
  date: string; // ISO YYYY-MM-DD
  count: number;
  intensity: number; // 0..1
  dow: number; // 0=Mon .. 6=Sun
}

export interface CalendarResponse {
  days: CalendarDay[];
  peakDay: { date: string; count: number } | null;
  dailyAvg: number;
  trend30: { pct: number; direction: KpiDirection };
}

export interface CoverageResponse {
  activeCategories: number;
  totalCategories: number;
  rotatingProducts: number;
  activeStores: number;
  avgTicket: number;
}

export type Granularity = "day" | "week" | "month";

export interface TimeSeriesPoint {
  date: string;
  units: number;
}

export interface TimeSeriesResponse {
  total: number;
  avg: number;
  peak: number;
  points: TimeSeriesPoint[];
}

export interface BoxplotCategory {
  category: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export interface WeekdayDistribution {
  dow: number;
  label: string;
  units: number;
  transactions: number;
}

export interface CorrelationResponse {
  labels: string[];
  matrix: number[][];
}
