# RetailAnalytics — Backend (Spark ETL + FastAPI)

Real-data backend for the RetailAnalytics project. Architecture:

```
CSV dataset  →  Apache Spark ETL (pipeline.py)  →  serving/*.json  →  FastAPI (:8000)  →  Next.js frontend (:3000)
```

No mock data: every number is computed from the fixed dataset by the Spark job.
FastAPI never touches Spark at request time — it serves the precomputed JSON
artifacts, so responses are instant.

## Requirements
Python 3.11+, Java 17, [uv](https://docs.astral.sh/uv/). PySpark 4.1.1 is pinned.

## Setup
```bash
cd backend
uv venv
uv pip install "pyspark==4.1.1" "fastapi>=0.115" "uvicorn[standard]>=0.32"
```

## 1. Run the ETL (produces serving artifacts)
```bash
./etl/run.sh                       # uses ../DataSet/DataSet by default
./etl/run.sh --input /path/to/data # to ingest new data, same layout
```
Writes `serving/*.json`. Re-running with new/updated CSVs is how
"incorporación de nuevos datos" works — the API picks up the refreshed files
without a restart (artifacts are read per request).

## 2. Run the API
```bash
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Then e.g. `curl http://localhost:8000/api/summary/kpis`.
Interactive docs at http://localhost:8000/docs.

## Endpoints
See [`API_CONTRACT.md`](./API_CONTRACT.md) for full request/response shapes.

## Dataset interpretation rules (graded — applied in `etl/pipeline.py`)
- 1 CSV row = 1 transaction. **Total transacciones = row count** (1,108,987).
- **units**: explode the space-separated basket; each product-code occurrence =
  1 unit. **Total unidades = 10,591,793**.
- **Client identity = composite `(storeId, customerId)`** — the same numeric
  customerId in different stores is a different person. Label `CUST-{store}-{customer}`.
  Clientes únicos = distinct composite (158,413).
- **Product → category**: productCode → `ProductCategory` → deterministic single
  category (**MIN categoryCode**, since the mapping is non-unique) → `Categories`
  name. Unmapped codes → **"Sin categoría"**. Note: of 449 product codes in
  transactions, only 243 have a category; "Sin categoría" is ~50% of units.
- Products have **no names** → labeled `Producto {code}`.
- **KPI deltas**: real % change of the most-recent 30-day window vs the prior
  30-day window, relative to the dataset MAX date (2013-06-30).
- **avgTicket** = total units / total transactions (units per transaction).
- The data has **no time-of-day**, only a date. Any "hour of day" analysis is
  impossible; it is replaced by **weekday distribution** (`/api/viz/weekday-distribution`).
- Dataset date range: **2013-01-01 .. 2013-06-30** (181 days, 4 stores).
