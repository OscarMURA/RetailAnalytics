# RetailAnalytics API Contract

Base URL: `http://localhost:8000`  ·  Prefix: `/api`  ·  All responses JSON, UTF-8.
CORS enabled for `http://localhost:3000`. No auth.

Data is REAL, computed by an Apache Spark ETL from the fixed CSV dataset
(supermarket transactions, 4 stores, **date range 2013-01-01 .. 2013-06-30**, no
prices, no time-of-day). FastAPI just serves precomputed JSON artifacts — fast,
no Spark at request time.

## IMPORTANT substitution for the frontend
The dataset has **no time-of-day**, only a date. So the planned "Distribución por
hora del día" chart is **impossible** and would be fabricated. It is **replaced**
by **`GET /api/viz/weekday-distribution`** ("Distribución por día de la semana",
Lun→Dom). Please render that instead of an hourly chart.

Also note: product codes have **no names** in the data — products are labeled
`Producto {code}`. Many product codes (~206 of 449) have no category mapping and
are bucketed as `"Sin categoría"`. These are real data characteristics.

---

## Endpoints

### `GET /api/health`
```json
{ "status": "ok" }
```

### `GET /api/summary/kpis`
4 KPIs. `delta` = real % change of the most-recent 30-day window vs the prior
30-day window (relative to dataset max date). `direction` ∈ up|down|flat.
```json
{ "kpis": [
  { "key": "totalUnits",        "label": "Unidades vendidas",   "value": 0, "delta": 0.0, "direction": "up",   "icon": "package" },
  { "key": "totalTransactions", "label": "Transacciones",       "value": 0, "delta": 0.0, "direction": "down", "icon": "activity" },
  { "key": "uniqueCustomers",   "label": "Clientes únicos",     "value": 0, "delta": 0.0, "direction": "flat", "icon": "users" },
  { "key": "distinctProducts",  "label": "Productos distintos", "value": 0, "delta": 0.0, "direction": "up",   "icon": "box" }
] }
```

### `GET /api/summary/top-products?limit=10`
```json
[ { "rank": 1, "code": "49", "label": "Producto 49", "category": "LACTEOS", "units": 12345 } ]
```

### `GET /api/summary/top-customers?limit=10`
```json
[ { "rank": 1, "id": "CUST-103-587", "units": 842 } ]
```

### `GET /api/summary/categories`
`value` = % of total units. Top 6 categories + "Otros".
```json
{ "items": [ { "name": "LACTEOS", "value": 18.2 } ], "activeCount": 49, "totalCount": 49 }
```

### `GET /api/summary/calendar?days=90`
Last N days of the dataset's own range. `dow`: 0=Mon..6=Sun. `intensity`: 0..1.
```json
{ "days": [ { "date": "2013-06-30", "count": 1200, "intensity": 0.87, "dow": 6 } ],
  "peakDay": { "date": "2013-06-15", "count": 1380 },
  "dailyAvg": 1100.4,
  "trend30": { "pct": 3.2, "direction": "up" } }
```

### `GET /api/summary/coverage`
```json
{ "activeCategories": 49, "totalCategories": 49, "rotatingProducts": 449,
  "activeStores": 4, "avgTicket": 2.71 }
```

### `GET /api/viz/timeseries?granularity=day|week|month`
Units over the full date range.
```json
{ "total": 0, "avg": 0.0, "peak": 0, "points": [ { "date": "2013-01-01", "units": 9876 } ] }
```

### `GET /api/viz/boxplot-categories`
Units-per-transaction distribution, top ~6 categories (approxQuantile).
```json
[ { "category": "LACTEOS", "min": 1, "q1": 1, "median": 2, "q3": 3, "max": 8 } ]
```

### `GET /api/viz/weekday-distribution`   (replaces hourly)
```json
[ { "dow": 0, "label": "Lun", "units": 50000, "transactions": 20000 } ]
```
`dow`: 0=Mon..6=Sun.

### `GET /api/viz/correlation`
Per-client features → 5x5 Pearson correlation.
```json
{ "labels": ["Frecuencia","Cant. promedio","Div. productos","Div. categorías","Recencia"],
  "matrix": [[1.0, 0.2, 0.5, 0.4, -0.1], ... ] }
```
