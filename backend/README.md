# RetailAnalytics — Backend (Spark ETL + DuckDB FastAPI)

Real-data backend for the RetailAnalytics project. Domain-oriented pipeline:

```
CSV dataset
   → Apache Spark ETL  (extract → clean → builders)        [etl/]
   → Parquet warehouse (backend/warehouse/<dataset>/)
   → FastAPI + DuckDB  (queries Parquet at request time)   [app/]  :8000
   → Next.js frontend                                              :3000
```

No mock data: every number is computed from the fixed dataset. DuckDB queries the
warehouse Parquet **at request time**, so global filters (`stores`, `from`, `to`)
recompute results live.

## Requirements
Python 3.11+, Java 17, [uv](https://docs.astral.sh/uv/). PySpark 4.1.1, DuckDB.

## Setup
```bash
cd backend
uv venv
uv pip install "pyspark==4.1.1" "duckdb>=1.5" "fastapi>=0.115" "uvicorn[standard]>=0.32"
```

## 1. Run the ETL (builds the Parquet warehouse)
```bash
./etl/run.sh                       # uses ../DataSet/DataSet by default
./etl/run.sh --input /path/to/data # to ingest new data, same layout
```
Idempotent: every dataset is overwritten. Re-running with new/updated CSVs is how
"incorporación de nuevos datos" works — DuckDB reads the Parquet per query, so the
API picks up refreshed data without a restart.

## 2. Run the API
```bash
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```
`curl http://localhost:8000/api/summary/kpis` · Swagger at `/docs`.

## Layout
- `etl/config.py` — warehouse paths + constants.
- `etl/spark_session.py` — SparkSession factory.
- `etl/extract.py` — read the raw transaction + product/category CSVs.
- `etl/clean.py` — validate/normalize, explode baskets, attach category →
  produces the curated `purchases` (item level) and `baskets` (transaction level).
- `etl/builders/` — one builder per analytical dataset:
  `daily_sales`, `customer_profiles`, `product_catalog`, `category_breakdown`,
  `overview`.
- `etl/warehouse.py` — Parquet read/write IO.
- `etl/pipeline.py` — orchestrator (`python -m etl.pipeline --input …`).
- `app/db.py` — cached DuckDB connection with lazy views over the warehouse.
- `app/filters.py` — global filter parsing → SQL WHERE + params.
- `app/main.py` — FastAPI endpoints.

## Warehouse datasets (`backend/warehouse/<dataset>/`)
Curated:
- **purchases** (item level): transaction_id, date, store_id, customer_id, client,
  dow, product_id, qty, category_id, category_name.
- **baskets** (transaction level): transaction_id, date, store_id, customer_id,
  client, n_items, dow.

Analytical (one builder each):
- **daily_sales**: date, store_id, units, transactions, customers — drives
  filtered series/KPIs.
- **customer_profiles**: client_id, frequency, units_total, distinct_products,
  distinct_categories, avg_basket_size, recency_days.
- **product_catalog**: product_id, category_id, category_name, units, transactions.
- **category_breakdown**: category_id, category_name, units, transactions, customers.
- **overview**: single row — date_min, date_max, total_units, total_transactions,
  unique_customers, distinct_products, active_stores.

Serving uses `purchases` for boxplot/category/correlation slices and `daily_sales`
for series/KPIs.

## Endpoints + global filters
See [`API_CONTRACT.md`](./API_CONTRACT.md). All data endpoints accept
`stores=102,103`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD`. `GET /api/meta` feeds the
filter UI.

## Dataset interpretation rules (graded)
- 1 CSV row = 1 transaction. **Total transacciones = 1,108,987**.
- **units** = sum of basket lengths. **Total unidades = 10,591,793**.
  (qty per product within a basket is 1 for all but one occurrence in the whole
  dataset, so units ≈ transactions per product — this is real.)
- **Client identity = composite `(store_id, customer_id)`**, label
  `CUST-{store}-{customer}`. Clientes únicos = 158,413.
- **Product → category**: deterministic **MIN categoryCode**; unmapped →
  `category_id` NULL / **"Sin categoría"** (~50% of units; only 20 categories
  actually appear among mapped products).
- Products have **no names** → `Producto {code}`.
- **KPI deltas**: last-30d vs prior-30d within the resolved (filtered) range.
- **avgTicket** = units / transactions.
- **No time-of-day** → weekday distribution (dow 0=Mon..6=Sun), never hours.
- Dataset range: **2013-01-01 .. 2013-06-30** (181 days, 4 stores).
