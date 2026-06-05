"""RetailAnalytics FastAPI — DuckDB over the Parquet warehouse.

Every data endpoint runs parametrized SQL at request time (no precomputed JSON)
against the warehouse datasets, so global filters (stores / from / to) recompute
results live. Re-running the ETL refreshes the Parquet; new queries see it
without a restart.

Filters (optional, on all data endpoints):
  stores=102,103   from=YYYY-MM-DD   to=YYYY-MM-DD
"""

from __future__ import annotations

import os
import re
from datetime import date, timedelta

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app import db, recompute
from app.filters import Filters, parse_filters

WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
ICONS = {
    "totalUnits": "package",
    "totalTransactions": "activity",
    "uniqueCustomers": "users",
    "distinctProducts": "box",
    "activeStores": "store",
}

_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
# Extra origins (e.g. the deployed frontend domain) via CORS_ORIGINS=a,b,c.
_EXTRA_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

app = FastAPI(title="RetailAnalytics API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEFAULT_ORIGINS + _EXTRA_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)


@app.on_event("startup")
def _limit_threadpool() -> None:
    # FastAPI runs sync `def` handlers in AnyIO's threadpool. DuckDB's Python
    # client segfaults the process if touched from multiple threads at once, so
    # cap the pool to a single worker: all handlers (and thus all DuckDB queries)
    # run one-at-a-time. Queries are sub-second, so this is fine for the demo.
    import anyio.to_thread

    limiter = anyio.to_thread.current_default_thread_limiter()
    limiter.total_tokens = 1


@app.on_event("startup")
def _cloud_bootstrap() -> None:
    # In the cloud deployment, pull the GCS warehouse to the local copy DuckDB
    # serves and push the current ETL code to the staging bucket for Dataproc.
    if os.environ.get("JOB_BACKEND") != "dataproc":
        return
    from app import cloud

    try:
        n = cloud.sync_warehouse()
        print(f"[startup] synced {n} warehouse files from {cloud.WAREHOUSE_URI}")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] WARNING: warehouse sync failed: {exc}")
    try:
        cloud.upload_job_artifacts()
        print("[startup] uploaded Dataproc job artifacts")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] WARNING: job artifact upload failed: {exc}")


def filters_dep(
    stores: str | None = Query(None, description="csv store ids; absent = all"),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
) -> Filters:
    return parse_filters(stores, date_from, date_to)


def _require_warehouse():
    if not db.warehouse_ready():
        raise HTTPException(503, "Parquet warehouse missing — run the ETL (backend/etl/run.sh).")


# --------------------------------------------------------------------------- #
# Health / meta                                                                #
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    ready = db.warehouse_ready()
    return {"status": "ok" if ready else "no-data", "warehouseReady": ready}


@app.get("/api/meta")
def meta():
    _require_warehouse()
    k = db.query_one("SELECT date_min, date_max FROM overview")
    stores = [
        r["store_id"]
        for r in db.query("SELECT DISTINCT store_id FROM daily_sales ORDER BY store_id")
    ]
    return {
        "stores": stores,
        "dateMin": k["date_min"].isoformat(),
        "dateMax": k["date_max"].isoformat(),
    }


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _resolved_range(f: Filters) -> tuple[date, date]:
    """Effective [min,max] dates given the filters (clipped to data)."""
    where, params = f.where()
    row = db.query_one(
        f"SELECT min(date) AS lo, max(date) AS hi FROM daily_sales{where}", params
    )
    if not row or row["lo"] is None:
        k = db.query_one("SELECT date_min AS lo, date_max AS hi FROM overview")
        return k["lo"], k["hi"]
    return row["lo"], row["hi"]


def _delta(cur: float, prev: float) -> tuple[float, str]:
    if prev == 0:
        return 0.0, "flat"
    d = round((cur - prev) / prev * 100.0, 1)
    return d, ("up" if d > 0.05 else "down" if d < -0.05 else "flat")


def _product_label(product_id: str, product_name: str | None) -> str:
    cleaned = product_name.strip() if isinstance(product_name, str) else ""
    return cleaned or f"Producto {product_id}"


# --------------------------------------------------------------------------- #
# Resumen Ejecutivo                                                            #
# --------------------------------------------------------------------------- #


@app.get("/api/summary/kpis")
def summary_kpis(f: Filters = Depends(filters_dep)):
    _require_warehouse()
    where, params = f.where()

    if not (f.stores or f.date_from or f.date_to):
        # No filters → global totals straight from the precomputed overview row.
        ov = db.query_one(
            "SELECT total_units, total_transactions, unique_customers, "
            "distinct_products, active_stores FROM overview"
        )
        totals = {"units": ov["total_units"], "transactions": ov["total_transactions"]}
        customers = ov["unique_customers"]
        distinct_products = ov["distinct_products"]
        active_stores = ov["active_stores"]
    else:
        totals = db.query_one(
            f"""SELECT coalesce(sum(units),0) AS units,
                       coalesce(sum(transactions),0) AS transactions
                FROM daily_sales{where}""",
            params,
        )
        iwhere, iparams = f.where()
        customers = db.query_one(
            f"SELECT count(DISTINCT client) AS c FROM purchases{iwhere}", iparams
        )["c"]
        distinct_products = db.query_one(
            f"SELECT count(DISTINCT product_id) AS c FROM purchases{iwhere}", iparams
        )["c"]
        active_stores = db.query_one(
            f"SELECT count(DISTINCT store_id) AS c FROM daily_sales{where}", params
        )["c"]

    # Deltas: last 30d vs prior 30d within the resolved range (robust clip).
    hi = _resolved_range(f)[1]
    cur_lo = hi - timedelta(days=29)
    prev_hi = hi - timedelta(days=30)
    prev_lo = hi - timedelta(days=59)

    def window(lo: date, hi_: date):
        w, p = f.where()
        glue = " AND" if w else " WHERE"
        sd = db.query_one(
            f"SELECT coalesce(sum(units),0) u, coalesce(sum(transactions),0) t "
            f"FROM daily_sales{w}{glue} date BETWEEN ? AND ?",
            p + [lo.isoformat(), hi_.isoformat()],
        )
        iw, ip = f.where()
        iglue = " AND" if iw else " WHERE"
        cu = db.query_one(
            f"SELECT count(DISTINCT client) c, count(DISTINCT product_id) pr "
            f"FROM purchases{iw}{iglue} date BETWEEN ? AND ?",
            ip + [lo.isoformat(), hi_.isoformat()],
        )
        return sd["u"], sd["t"], cu["c"], cu["pr"]

    cu_u, cu_t, cu_c, cu_p = window(cur_lo, hi)
    pv_u, pv_t, pv_c, pv_p = window(prev_lo, prev_hi)

    def kpi(key, label, value, cur, prev):
        d, direction = _delta(cur, prev)
        return {"key": key, "label": label, "value": int(value), "delta": d,
                "direction": direction, "icon": ICONS[key]}

    return {
        "kpis": [
            kpi("totalUnits", "Unidades vendidas", totals["units"], cu_u, pv_u),
            kpi("totalTransactions", "Transacciones", totals["transactions"], cu_t, pv_t),
            kpi("uniqueCustomers", "Clientes únicos", customers, cu_c, pv_c),
            kpi("distinctProducts", "Productos distintos", distinct_products, cu_p, pv_p),
            kpi("activeStores", "Tiendas activas", active_stores, active_stores, active_stores),
        ]
    }


@app.get("/api/summary/top-products")
def summary_top_products(limit: int = Query(10, ge=1, le=50), f: Filters = Depends(filters_dep)):
    _require_warehouse()
    where, params = f.where()
    if not (f.stores or f.date_from or f.date_to):
        # No filters → precomputed product_catalog (instant).
        rows = db.query(
            f"""SELECT product_id, product_name, category_name AS category, units, transactions
                FROM product_catalog ORDER BY units DESC LIMIT {int(limit)}"""
        )
    else:
        rows = db.query(
            f"""SELECT product_id, any_value(product_name) AS product_name, any_value(category_name) AS category,
                       sum(qty) AS units, count(DISTINCT transaction_id) AS transactions
                FROM purchases{where}
                GROUP BY product_id ORDER BY units DESC LIMIT {int(limit)}""",
            params,
        )
    return [
        {"rank": i + 1, "code": r["product_id"], "label": _product_label(r["product_id"], r.get("product_name")),
         "productName": r.get("product_name"), "category": r["category"], "units": int(r["units"]),
         "transactions": int(r["transactions"])}
        for i, r in enumerate(rows)
    ]


@app.get("/api/summary/top-customers")
def summary_top_customers(
    limit: int = Query(10, ge=1, le=50),
    by: str = Query("transactions", pattern="^(transactions|units)$"),
    f: Filters = Depends(filters_dep),
):
    _require_warehouse()
    where, params = f.where()
    order = "transactions" if by == "transactions" else "units"
    if not (f.stores or f.date_from or f.date_to):
        # No filters → precomputed customer_profiles (instant).
        rows = db.query(
            f"""SELECT client_id AS client, units_total AS units,
                       frequency AS transactions
                FROM customer_profiles ORDER BY {order} DESC LIMIT {int(limit)}"""
        )
    else:
        rows = db.query(
            f"""SELECT client, sum(qty) AS units,
                       count(DISTINCT transaction_id) AS transactions
                FROM purchases{where}
                GROUP BY client ORDER BY {order} DESC LIMIT {int(limit)}""",
            params,
        )
    return [
        {"rank": i + 1, "id": r["client"], "units": int(r["units"]),
         "transactions": int(r["transactions"])}
        for i, r in enumerate(rows)
    ]


@app.get("/api/summary/categories")
def summary_categories(f: Filters = Depends(filters_dep)):
    _require_warehouse()
    where, params = f.where()
    if not (f.stores or f.date_from or f.date_to):
        # No filters → precomputed category_breakdown (instant).
        rows = db.query(
            """SELECT category_name AS name, units, transactions, customers
               FROM category_breakdown ORDER BY units DESC"""
        )
    else:
        rows = db.query(
            f"""SELECT category_name AS name, sum(qty) AS units,
                       count(DISTINCT transaction_id) AS transactions,
                       count(DISTINCT client) AS customers
                FROM purchases{where}
                GROUP BY category_name ORDER BY units DESC""",
            params,
        )
    total_units = sum(r["units"] for r in rows) or 1
    items = [
        {"name": r["name"], "units": int(r["units"]), "transactions": int(r["transactions"]),
         "customers": int(r["customers"]),
         "value": round(r["units"] / total_units * 100.0, 1)}
        for r in rows
    ]
    active = len([r for r in rows if r["name"] != "Sin categoría"])
    total = db.query_one(
        "SELECT count(*) c FROM category_breakdown WHERE category_id IS NOT NULL"
    )["c"]
    return {"items": items, "activeCount": active, "totalCount": int(total)}


@app.get("/api/summary/coverage")
def summary_coverage(f: Filters = Depends(filters_dep)):
    _require_warehouse()
    where, params = f.where()
    sd = db.query_one(
        f"SELECT coalesce(sum(units),0) u, coalesce(sum(transactions),0) t, "
        f"count(DISTINCT store_id) s FROM daily_sales{where}", params
    )
    total_cats = db.query_one(
        "SELECT count(*) c FROM category_breakdown WHERE category_id IS NOT NULL"
    )["c"]
    if not (f.stores or f.date_from or f.date_to):
        # No filters → product_catalog / category_breakdown (instant).
        prod = db.query_one("SELECT count(DISTINCT product_id) c FROM product_catalog")["c"]
        active_cats = total_cats
    else:
        iw, ip = f.where()
        prod = db.query_one(f"SELECT count(DISTINCT product_id) c FROM purchases{iw}", ip)["c"]
        active_cats = db.query_one(
            f"SELECT count(DISTINCT category_id) c FROM purchases{iw}"
            + (" AND" if iw else " WHERE") + " category_id IS NOT NULL", ip
        )["c"]
    avg_ticket = round(sd["u"] / sd["t"], 2) if sd["t"] else 0.0
    return {
        "activeCategories": int(active_cats),
        "totalCategories": int(total_cats),
        "rotatingProducts": int(prod),
        "activeStores": int(sd["s"]),
        "avgTicket": avg_ticket,
    }


@app.get("/api/summary/calendar")
def summary_calendar(days: int = Query(90, ge=1, le=365), f: Filters = Depends(filters_dep)):
    _require_warehouse()
    hi = _resolved_range(f)[1]
    lo = hi - timedelta(days=days - 1)
    where, params = f.where()
    glue = " AND" if where else " WHERE"
    rows = db.query(
        f"""SELECT date, sum(transactions) AS count
            FROM daily_sales{where}{glue} date BETWEEN ? AND ?
            GROUP BY date""",
        params + [lo.isoformat(), hi.isoformat()],
    )
    by_date = {r["date"]: int(r["count"]) for r in rows}
    seq = []
    d = lo
    while d <= hi:
        seq.append((d, by_date.get(d, 0)))
        d += timedelta(days=1)
    counts = [c for _, c in seq]
    max_count = max(counts) if counts else 0
    days_out, peak = [], {"date": None, "count": 0}
    for dd, c in seq:
        days_out.append({"date": dd.isoformat(), "count": c,
                         "intensity": round(c / max_count, 3) if max_count else 0.0,
                         "dow": dd.weekday()})
        if c > peak["count"]:
            peak = {"date": dd.isoformat(), "count": c}
    daily_avg = round(sum(counts) / len(counts), 1) if counts else 0.0
    cur = [c for dd, c in seq if dd > hi - timedelta(days=30)]
    prev = [c for dd, c in seq if hi - timedelta(days=60) < dd <= hi - timedelta(days=30)]
    pct, direction = _delta(sum(cur), sum(prev))
    top5 = [x["date"] for x in sorted(days_out, key=lambda x: x["count"], reverse=True)[:5]]
    return {"days": days_out, "peakDay": peak, "dailyAvg": daily_avg,
            "trend30": {"pct": pct, "direction": direction}, "top5": top5}


@app.get("/api/summary/peak-timeseries")
def summary_peak_timeseries(f: Filters = Depends(filters_dep)):
    _require_warehouse()
    where, params = f.where()
    rows = db.query(
        f"""SELECT date, sum(transactions) AS transactions
            FROM daily_sales{where} GROUP BY date ORDER BY date""",
        params,
    )
    points = [{"date": r["date"].isoformat(), "transactions": int(r["transactions"])} for r in rows]
    top5 = [p["date"] for p in sorted(points, key=lambda p: p["transactions"], reverse=True)[:5]]
    return {"points": points, "top5": top5}


# --------------------------------------------------------------------------- #
# Visualizaciones Analíticas                                                   #
# --------------------------------------------------------------------------- #


@app.get("/api/viz/timeseries")
def viz_timeseries(
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    f: Filters = Depends(filters_dep),
):
    _require_warehouse()
    where, params = f.where()
    if granularity == "day":
        bucket = "date"
    elif granularity == "week":
        bucket = "CAST(date_trunc('week', date) AS DATE)"
    else:
        bucket = "CAST(date_trunc('month', date) AS DATE)"
    rows = db.query(
        f"""SELECT {bucket} AS bucket, sum(units) AS units, sum(transactions) AS transactions
            FROM daily_sales{where} GROUP BY bucket ORDER BY bucket""",
        params,
    )
    points = [
        {"date": r["bucket"].isoformat(), "units": int(r["units"]),
         "transactions": int(r["transactions"])}
        for r in rows
    ]
    units = [p["units"] for p in points]
    txns = [p["transactions"] for p in points]
    n = len(points)
    return {
        "total": sum(units),
        "avg": round(sum(units) / n, 1) if n else 0.0,
        "peak": max(units) if units else 0,
        "totalTransactions": sum(txns),
        "avgTransactions": round(sum(txns) / n, 1) if n else 0.0,
        "peakTransactions": max(txns) if txns else 0,
        "points": points,
    }


@app.get("/api/viz/boxplot")
def viz_boxplot(
    dimension: str = Query(
        "units-per-category",
        pattern="^(units-per-category|units-per-customer|transactions-per-customer)$",
    ),
    f: Filters = Depends(filters_dep),
):
    _require_warehouse()
    where, params = f.where()
    qs = "[0.0, 0.25, 0.5, 0.75, 1.0]"

    if dimension == "units-per-category":
        # Units-per-transaction within each category, quantiles for the top 8
        # categories by total units — one grouped scan instead of N per-category
        # passes.
        glue = "AND" if where else "WHERE"
        rows = db.query(
            f"""WITH per_tx AS (
                    SELECT category_name, transaction_id, sum(qty) v
                    FROM purchases{where} {glue} category_id IS NOT NULL
                    GROUP BY category_name, transaction_id),
                 totals AS (
                    SELECT category_name, sum(v) AS tot FROM per_tx GROUP BY category_name
                    ORDER BY tot DESC LIMIT 8)
                SELECT p.category_name AS label,
                       quantile_cont(p.v, {qs}) AS q, count(*) AS n, avg(p.v) AS m
                FROM per_tx p JOIN totals t USING (category_name)
                GROUP BY p.category_name
                ORDER BY sum(p.v) DESC""",
            params,
        )
        boxes, all_vals = [], []
        for r in rows:
            q = r["q"]
            boxes.append({"label": r["label"], "min": q[0], "q1": q[1], "median": q[2],
                          "q3": q[3], "max": q[4]})
            all_vals.append((r["n"], r["m"]))
        n = sum(v[0] for v in all_vals)
        mean = round(sum(v[0] * v[1] for v in all_vals) / n, 2) if n else 0.0
        median = boxes[0]["median"] if boxes else 0
        return {"dimension": dimension, "boxes": boxes,
                "stats": {"count": int(n), "mean": mean, "median": median, "p50": median}}

    # per-customer dimensions: a single box over all clients.
    metric = "sum(qty)" if dimension == "units-per-customer" else "count(DISTINCT transaction_id)"
    row = db.query_one(
        f"""WITH per_c AS (
                SELECT client, {metric} v FROM purchases{where} GROUP BY client)
            SELECT quantile_cont(v, {qs}) AS q, count(*) n, avg(v) m, median(v) p50 FROM per_c""",
        params,
    )
    label = "Unidades por cliente" if dimension == "units-per-customer" else "Transacciones por cliente"
    if not row or row["n"] == 0:
        return {"dimension": dimension, "boxes": [],
                "stats": {"count": 0, "mean": 0, "median": 0, "p50": 0}}
    q = row["q"]
    boxes = [{"label": label, "min": q[0], "q1": q[1], "median": q[2], "q3": q[3], "max": q[4]}]
    return {"dimension": dimension, "boxes": boxes,
            "stats": {"count": int(row["n"]), "mean": round(row["m"], 2),
                      "median": row["p50"], "p50": row["p50"]}}


@app.get("/api/viz/weekday-distribution")
def viz_weekday_distribution(f: Filters = Depends(filters_dep)):
    _require_warehouse()
    where, params = f.where()
    units = {r["dow"]: int(r["u"]) for r in db.query(
        f"SELECT dow, sum(qty) u FROM purchases{where} GROUP BY dow", params)}
    txns = {r["dow"]: int(r["t"]) for r in db.query(
        f"SELECT dow, count(DISTINCT transaction_id) t FROM purchases{where} GROUP BY dow",
        params)}
    return [
        {"dow": d, "label": WEEKDAY_LABELS[d], "units": units.get(d, 0),
         "transactions": txns.get(d, 0)}
        for d in range(7)
    ]


# Feature columns, in the labels' order. Pearson is computed in DuckDB (vectorized
# corr()), one aggregate over the per-client features.
_CORR_COLS = ["frequency", "volume", "avg_basket", "distinct_products",
              "distinct_categories", "recency"]
# Same six features as exposed by the precomputed `customer_profiles` dataset.
_CORR_PROFILE_COLS = {
    "frequency": "frequency", "volume": "units_total", "avg_basket": "avg_basket_size",
    "distinct_products": "distinct_products", "distinct_categories": "distinct_categories",
    "recency": "recency_days",
}


@app.get("/api/viz/correlation")
def viz_correlation(f: Filters = Depends(filters_dep)):
    _require_warehouse()
    cols = _CORR_COLS
    n = len(cols)

    # The per-client feature source: precomputed profiles when unfiltered, else
    # recomputed from purchases under the filter.
    if not (f.stores or f.date_from or f.date_to):
        sel = ", ".join(f"{_CORR_PROFILE_COLS[c]} AS {c}" for c in cols)
        feats_sql = f"SELECT {sel} FROM customer_profiles"
        feats_params: list = []
    else:
        where_i, p_i = f.where()
        where_t, p_t = f.where()
        feats_sql = f"""
            SELECT i.client,
                   count(DISTINCT i.transaction_id)::DOUBLE AS frequency,
                   sum(i.qty)::DOUBLE AS volume,
                   (sum(i.qty)::DOUBLE / count(DISTINCT i.transaction_id)) AS avg_basket,
                   count(DISTINCT i.product_id)::DOUBLE AS distinct_products,
                   count(DISTINCT i.category_id)::DOUBLE AS distinct_categories,
                   date_diff('day', max(i.date),
                             (SELECT max(date) FROM daily_sales{where_t}))::DOUBLE AS recency
            FROM purchases i{where_i}
            GROUP BY i.client"""
        feats_params = p_i + p_t

    # Pearson via plain SQL sum-aggregates (count, sum, sum-of-squares, sum-of-
    # products) over the feature set — returns ~30 scalars, never the 158k rows.
    # DuckDB's native corr() aggregate segfaults on this platform, so we build the
    # coefficient from these safe primitives instead.
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
    aggs = ["count(*) AS m"]
    aggs += [f"sum({c}) AS s_{i}" for i, c in enumerate(cols)]
    aggs += [f"sum({c}*{c}) AS q_{i}" for i, c in enumerate(cols)]
    aggs += [f"sum({cols[i]}*{cols[j]}) AS p_{i}_{j}" for i, j in pairs]
    row = db.query_one(f"WITH feats AS ({feats_sql}) SELECT {', '.join(aggs)} FROM feats",
                       feats_params)

    matrix = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    m = (row or {}).get("m") or 0
    if m and m > 1:
        for i, j in pairs:
            si, sj, pij = row[f"s_{i}"], row[f"s_{j}"], row[f"p_{i}_{j}"]
            qi, qj = row[f"q_{i}"], row[f"q_{j}"]
            cov = pij - si * sj / m
            vi = qi - si * si / m
            vj = qj - sj * sj / m
            denom = (vi * vj) ** 0.5
            c = round(cov / denom, 3) if denom > 0 else 0.0
            matrix[i][j] = matrix[j][i] = c
    return {
        "labels": ["Frecuencia", "Volumen total", "Cant. promedio", "Div. productos",
                   "Div. categorías", "Recencia"],
        "matrix": matrix,
    }

# --------------------------------------------------------------------------- #
# Análisis Avanzado: Segmentación + Recomendador                              #
# --------------------------------------------------------------------------- #


@app.get("/api/advanced/segments")
def advanced_segments(points_per_segment: int = Query(120, ge=20, le=300)):
    _require_warehouse()
    summaries = db.query(
        """SELECT segment_id, segment_name, customers, share_pct,
                  avg_frequency, avg_units_total, avg_distinct_products,
                  avg_distinct_categories, avg_basket_size, avg_recency_days,
                  description
           FROM segment_summary ORDER BY segment_id"""
    )
    points = db.query(
        """SELECT client_id, segment_id, segment_name, frequency, units_total,
                  distinct_products, distinct_categories, avg_basket_size, recency_days
           FROM (
             SELECT *, row_number() OVER (
                 PARTITION BY segment_id ORDER BY units_total DESC, frequency DESC, client_id
             ) AS rn
             FROM customer_segments
           ) s
           WHERE rn <= ?
           ORDER BY segment_id, units_total DESC""",
        [points_per_segment],
    )
    return {
        "segments": [
            {
                "segmentId": int(r["segment_id"]),
                "name": r["segment_name"],
                "customers": int(r["customers"]),
                "sharePct": round(float(r["share_pct"]), 2),
                "avgFrequency": round(float(r["avg_frequency"]), 2),
                "avgUnitsTotal": round(float(r["avg_units_total"]), 2),
                "avgDistinctProducts": round(float(r["avg_distinct_products"]), 2),
                "avgDistinctCategories": round(float(r["avg_distinct_categories"]), 2),
                "avgBasketSize": round(float(r["avg_basket_size"]), 2),
                "avgRecencyDays": round(float(r["avg_recency_days"]), 2),
                "description": r["description"],
            }
            for r in summaries
        ],
        "points": [
            {
                "clientId": r["client_id"],
                "segmentId": int(r["segment_id"]),
                "segmentName": r["segment_name"],
                "frequency": int(r["frequency"]),
                "unitsTotal": int(r["units_total"]),
                "distinctProducts": int(r["distinct_products"]),
                "distinctCategories": int(r["distinct_categories"]),
                "avgBasketSize": round(float(r["avg_basket_size"]), 2),
                "recencyDays": int(r["recency_days"]),
            }
            for r in points
        ],
    }


@app.get("/api/advanced/segments/customers")
def advanced_segment_customers(
    segment_id: int | None = Query(None, ge=1, le=4),
    limit: int = Query(25, ge=1, le=100),
):
    _require_warehouse()
    if segment_id is None:
        rows = db.query(
            f"""SELECT client_id, segment_id, segment_name, frequency, units_total,
                       distinct_products, distinct_categories, avg_basket_size, recency_days
                FROM customer_segments
                ORDER BY units_total DESC, frequency DESC LIMIT {int(limit)}"""
        )
    else:
        rows = db.query(
            f"""SELECT client_id, segment_id, segment_name, frequency, units_total,
                       distinct_products, distinct_categories, avg_basket_size, recency_days
                FROM customer_segments
                WHERE segment_id = ?
                ORDER BY units_total DESC, frequency DESC LIMIT {int(limit)}""",
            [segment_id],
        )
    return [
        {
            "clientId": r["client_id"],
            "segmentId": int(r["segment_id"]),
            "segmentName": r["segment_name"],
            "frequency": int(r["frequency"]),
            "unitsTotal": int(r["units_total"]),
            "distinctProducts": int(r["distinct_products"]),
            "distinctCategories": int(r["distinct_categories"]),
            "avgBasketSize": round(float(r["avg_basket_size"]), 2),
            "recencyDays": int(r["recency_days"]),
        }
        for r in rows
    ]


@app.get("/api/advanced/recommendations/seeds")
def advanced_recommendation_seeds(limit: int = Query(20, ge=5, le=50)):
    _require_warehouse()
    products = db.query(
        f"""SELECT product_id, product_name, category_name, units, transactions
            FROM product_catalog ORDER BY units DESC LIMIT {int(limit)}"""
    )
    customers = db.query(
        f"""SELECT client_id, segment_id, segment_name, frequency, units_total
            FROM customer_segments ORDER BY units_total DESC, frequency DESC LIMIT {int(limit)}"""
    )
    return {
        "products": [
            {
                "code": r["product_id"],
                "label": _product_label(r["product_id"], r.get("product_name")),
                "productName": r.get("product_name"),
                "category": r["category_name"],
                "units": int(r["units"]),
                "transactions": int(r["transactions"]),
            }
            for r in products
        ],
        "customers": [
            {
                "clientId": r["client_id"],
                "segmentId": int(r["segment_id"]),
                "segmentName": r["segment_name"],
                "frequency": int(r["frequency"]),
                "unitsTotal": int(r["units_total"]),
            }
            for r in customers
        ],
    }


@app.get("/api/advanced/recommendations/search")
def advanced_recommendation_search(
    mode: str = Query("product", pattern="^(product|customer)$"),
    q: str = Query("", description="texto libre: id, nombre o categoría"),
    limit: int = Query(20, ge=1, le=50),
):
    """Buscador libre sobre TODO el catálogo / base de clientes (no solo semillas).

    Permite elegir cualquier producto o cliente como origen del recomendador,
    sin importar a qué cluster pertenezca. Cuando `q` está vacío devuelve el top
    por volumen (mismas sugerencias por defecto que las semillas).
    """
    _require_warehouse()
    term = (q or "").strip()
    like = f"%{term}%"

    if mode == "product":
        # "Producto 5" es solo una etiqueta sintética (no hay nombre real en el
        # dataset) → al buscar por id se ignora ese prefijo para casar el código.
        id_token = re.sub(r"(?i)^producto\s+", "", term).strip()
        rows = db.query(
            f"""SELECT product_id, product_name, category_name, units, transactions
                FROM product_catalog
                WHERE ? = ''
                   OR product_id ILIKE ?
                   OR coalesce(product_name, '') ILIKE ?
                   OR category_name ILIKE ?
                ORDER BY (product_id = ?) DESC, (product_id ILIKE ?) DESC, units DESC
                LIMIT {int(limit)}""",
            [term, f"%{id_token}%", like, like, id_token, f"{id_token}%"],
        )
        return {
            "mode": "product",
            "items": [
                {
                    "id": r["product_id"],
                    "label": _product_label(r["product_id"], r.get("product_name")),
                    "sub": r["category_name"],
                    "units": int(r["units"]),
                    "transactions": int(r["transactions"]),
                }
                for r in rows
            ],
        }

    rows = db.query(
        f"""SELECT client_id, segment_name, frequency, units_total
            FROM customer_segments
            WHERE ? = '' OR client_id ILIKE ? OR segment_name ILIKE ?
            ORDER BY (client_id = ?) DESC, units_total DESC, frequency DESC
            LIMIT {int(limit)}""",
        [term, like, like, term],
    )
    return {
        "mode": "customer",
        "items": [
            {
                "id": r["client_id"],
                "label": r["client_id"],
                "sub": r["segment_name"],
                "units": int(r["units_total"]),
                "transactions": int(r["frequency"]),
            }
            for r in rows
        ],
    }


@app.get("/api/advanced/recommendations/products")
def advanced_product_recommendations(
    product_id: str | None = Query(None),
    limit: int = Query(8, ge=1, le=20),
):
    _require_warehouse()
    seed = product_id
    if not seed:
        top = db.query_one("SELECT product_id FROM product_catalog ORDER BY units DESC LIMIT 1")
        seed = top["product_id"] if top else None
    if not seed:
        return {"seed": None, "items": []}

    seed_row = db.query_one(
        """SELECT product_id, product_name, category_name, units, transactions
           FROM product_catalog WHERE product_id = ?""",
        [seed],
    )
    rows = db.query(
        f"""SELECT recommended_product_id, recommended_product_name, recommended_category, recommended_units,
                   cooccurrences, confidence, lift, score, rank
            FROM product_recommendations
            WHERE antecedent_product_id = ?
            ORDER BY rank LIMIT {int(limit)}""",
        [seed],
    )
    return {
        "seed": None if not seed_row else {
            "code": seed_row["product_id"],
            "label": _product_label(seed_row["product_id"], seed_row.get("product_name")),
            "productName": seed_row.get("product_name"),
            "category": seed_row["category_name"],
            "units": int(seed_row["units"]),
            "transactions": int(seed_row["transactions"]),
        },
        "items": [
            {
                "rank": int(r["rank"]),
                "code": r["recommended_product_id"],
                "label": _product_label(r["recommended_product_id"], r.get("recommended_product_name")),
                "productName": r.get("recommended_product_name"),
                "category": r["recommended_category"],
                "units": int(r["recommended_units"]),
                "cooccurrences": int(r["cooccurrences"]),
                "confidence": round(float(r["confidence"]), 4),
                "lift": round(float(r["lift"]), 4),
                "score": round(float(r["score"]), 4),
            }
            for r in rows
        ],
    }


@app.get("/api/advanced/recommendations/customers")
def advanced_customer_recommendations(
    client_id: str | None = Query(None),
    limit: int = Query(8, ge=1, le=20),
):
    _require_warehouse()
    client = client_id
    if not client:
        top = db.query_one("SELECT client_id FROM customer_segments ORDER BY units_total DESC LIMIT 1")
        client = top["client_id"] if top else None
    if not client:
        return {"customer": None, "items": []}

    customer = db.query_one(
        """SELECT client_id, segment_id, segment_name, frequency, units_total,
                  distinct_products, distinct_categories
           FROM customer_segments WHERE client_id = ?""",
        [client],
    )
    rows = db.query(
        f"""WITH owned AS (
                SELECT product_id FROM customer_product_history WHERE client = ?
             ), candidates AS (
                SELECT pr.recommended_product_id, pr.recommended_product_name, pr.recommended_category,
                       pr.recommended_units, pr.antecedent_product_id,
                       pr.cooccurrences, pr.confidence, pr.lift, pr.score
                FROM owned o
                JOIN product_recommendations pr ON pr.antecedent_product_id = o.product_id
                LEFT JOIN owned already ON already.product_id = pr.recommended_product_id
                WHERE already.product_id IS NULL
             )
            SELECT recommended_product_id, max(recommended_product_name) AS recommended_product_name,
                   recommended_category, max(recommended_units) AS units,
                   sum(score) AS score, max(confidence) AS confidence, max(lift) AS lift,
                   sum(cooccurrences) AS cooccurrences,
                   count(DISTINCT antecedent_product_id) AS evidence_products
            FROM candidates
            GROUP BY recommended_product_id, recommended_category
            ORDER BY score DESC, cooccurrences DESC LIMIT {int(limit)}""",
        [client],
    )
    return {
        "customer": None if not customer else {
            "clientId": customer["client_id"],
            "segmentId": int(customer["segment_id"]),
            "segmentName": customer["segment_name"],
            "frequency": int(customer["frequency"]),
            "unitsTotal": int(customer["units_total"]),
            "distinctProducts": int(customer["distinct_products"]),
            "distinctCategories": int(customer["distinct_categories"]),
        },
        "items": [
            {
                "code": r["recommended_product_id"],
                "label": _product_label(r["recommended_product_id"], r.get("recommended_product_name")),
                "productName": r.get("recommended_product_name"),
                "category": r["recommended_category"],
                "units": int(r["units"]),
                "cooccurrences": int(r["cooccurrences"]),
                "confidence": round(float(r["confidence"]), 4),
                "lift": round(float(r["lift"]), 4),
                "score": round(float(r["score"]), 4),
                "evidenceProducts": int(r["evidence_products"]),
            }
            for r in rows
        ],
    }


# --------------------------------------------------------------------------- #
# Recompute (re-run Spark K-Means + association-rule builders, async)         #
# --------------------------------------------------------------------------- #


def _start_job(kind: str) -> dict:
    res = recompute.start(kind)
    if not res["ok"]:
        headers = None
        if res.get("retryAfter") is not None:
            headers = {"Retry-After": str(int(res["retryAfter"]) + 1)}
        raise HTTPException(res["code"], res["reason"], headers=headers)
    return recompute.status()


@app.post("/api/advanced/recompute")
def advanced_recompute():
    """Re-run the Spark K-Means + association-rule builders from curated Parquet.

    Single-flight (409) and cooldown rate-limited (429 + Retry-After).
    """
    _require_warehouse()
    return _start_job("recompute")


@app.post("/api/admin/reingest")
def admin_reingest():
    """Run the FULL ETL (extract → clean → all builders) from the raw dataset,
    regenerating the entire warehouse. Same single-flight + cooldown as recompute.
    """
    return _start_job("reingest")


@app.get("/api/jobs/status")
def jobs_status():
    return recompute.status()


# Back-compat alias for the recompute status path.
@app.get("/api/advanced/recompute/status")
def advanced_recompute_status():
    return recompute.status()
