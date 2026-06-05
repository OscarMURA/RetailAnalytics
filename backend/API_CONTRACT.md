# RetailAnalytics API Contract (v0.2 — DuckDB + global filters)

Base URL: `http://localhost:8000`  ·  Prefix: `/api`  ·  All responses JSON, UTF-8.
CORS enabled for `http://localhost:3000`. No auth.

Data is REAL. An **Apache Spark ETL** (extract → clean → builders) writes a
**Parquet warehouse** (`backend/warehouse/`); FastAPI queries it with **DuckDB at
request time**, so filters recompute results live. Dataset: 4 stores,
**2013-01-01 .. 2013-06-30**, no prices, no time-of-day.

## GLOBAL FILTERS (optional query params on EVERY data endpoint)
- `stores` — csv of store ids, e.g. `stores=102,103`. Absent = all stores.
- `from` — `YYYY-MM-DD` inclusive lower bound.
- `to` — `YYYY-MM-DD` inclusive upper bound.
Use `GET /api/meta` to populate the filter UI. Filters compose (AND).

## Real-data realities (design around, not bugs)
- Product labels use catalog product names when available; otherwise fallback to `Producto {code}`. `units ≈ transactions` per
  product because a product code almost never repeats inside one basket (qty is 1
  for all but a single occurrence in the whole dataset).
- ~206 of 449 product codes have no category → `"Sin categoría"` (~50% of units).
- NO hourly chart possible → use `weekday-distribution` (dow 0=Mon..6=Sun).

---

## Health / meta

### `GET /api/health`  → `{ "status":"ok", "lakeReady": true }`

### `GET /api/meta`  (no filters)
```json
{ "stores": ["102","103","107","110"], "dateMin": "2013-01-01", "dateMax": "2013-06-30" }
```

## Resumen Ejecutivo

### `GET /api/summary/kpis`  → now **5** KPIs (added `activeStores`)
`delta` = real % change last-30d vs prior-30d within the resolved (filtered)
range; robustly clipped. `direction` ∈ up|down|flat.
```json
{ "kpis": [
  { "key":"totalUnits","label":"Unidades vendidas","value":10591793,"delta":7.5,"direction":"up","icon":"package" },
  { "key":"totalTransactions","label":"Transacciones","value":1108987,"delta":6.9,"direction":"up","icon":"activity" },
  { "key":"uniqueCustomers","label":"Clientes únicos","value":158413,"delta":6.1,"direction":"up","icon":"users" },
  { "key":"distinctProducts","label":"Productos distintos","value":449,"delta":0.0,"direction":"flat","icon":"box" },
  { "key":"activeStores","label":"Tiendas activas","value":4,"delta":0.0,"direction":"flat","icon":"store" }
] }
```

### `GET /api/summary/top-products?limit=10`  (added `transactions`)
```json
[ { "rank":1,"code":"5","label":"Producto 5","category":"AROMATICAS CONDIMENTOS","units":300526,"transactions":300526 } ]
```

### `GET /api/summary/top-customers?limit=10&by=transactions`
`by` ∈ `transactions` (default — brief says "mayor número de compras") | `units`.
Returns BOTH metrics.
```json
[ { "rank":1,"id":"CUST-103-336296","units":1270,"transactions":165 } ]
```

### `GET /api/summary/categories`  (items now carry units/transactions/customers)
`value` = % of total units (filtered). Items are ALL categories sorted by units
(frontend does donut top8 + bars top15; no server-side "Otros" collapse anymore).
```json
{ "items":[ { "name":"Sin categoría","units":5330800,"transactions":1002557,"customers":149025,"value":50.3 } ],
  "activeCount":20, "totalCount":20 }
```

### `GET /api/summary/coverage`
```json
{ "activeCategories":20,"totalCategories":20,"rotatingProducts":449,"activeStores":4,"avgTicket":9.55 }
```

### `GET /api/summary/calendar?days=90`  (added `top5`)
`days` clipped to the filtered range's last N. `dow` 0=Mon..6=Sun.
```json
{ "days":[ { "date":"2013-06-30","count":1200,"intensity":0.87,"dow":6 } ],
  "peakDay":{ "date":"2013-06-15","count":9476 }, "dailyAvg":6195.5,
  "trend30":{ "pct":6.9,"direction":"up" },
  "top5":["2013-06-15","2013-05-11","2013-06-01","2013-04-28","2013-04-07"] }
```

### `GET /api/summary/peak-timeseries`  (NEW — "Días pico" series)
```json
{ "points":[ { "date":"2013-01-01","transactions":2860 } ],
  "top5":["2013-06-15","2013-05-11","2013-02-03","2013-03-03","2013-06-01"] }
```

## Visualizaciones Analíticas

### `GET /api/viz/timeseries?granularity=day|week|month`  (added `transactions`)
`point.date` = ISO `YYYY-MM-DD`. Returns the granularity object directly.
`total`/`avg`/`peak` are units; `totalTransactions`/`avgTransactions`/`peakTransactions`
are the same aggregates for transactions.
```json
{ "total":10591793,"avg":1765298.8,"peak":1835406,
  "totalTransactions":1108987,"avgTransactions":184831.2,"peakTransactions":193156,
  "points":[ { "date":"2013-01-01","units":1777635,"transactions":184916 } ] }
```

### `GET /api/viz/boxplot?dimension=units-per-category|units-per-customer|transactions-per-customer`
Replaces `/api/viz/boxplot-categories` (that path is removed). DuckDB
`quantile_cont`.
- `units-per-category`: one box per top ~8 categories (units-per-transaction within
  the category).
- `units-per-customer` / `transactions-per-customer`: a SINGLE box over all clients.
```json
{ "dimension":"units-per-category",
  "boxes":[ { "label":"VERDURAS RAIZ,TUBERCULO Y BULBOS","min":1,"q1":1,"median":2,"q3":3,"max":21 } ],
  "stats":{ "count":2814678,"mean":1.79,"median":2.0,"p50":2.0 } }
```
`stats` is global (`median` == `p50`, both provided). Invalid `dimension` → HTTP 422.

### `GET /api/viz/weekday-distribution`  (dow 0=Mon..6=Sun)
```json
[ { "dow":0,"label":"Lun","units":1301747,"transactions":142445 } ]
```

### `GET /api/viz/correlation`  → now **6 variables** (6x6)
```json
{ "labels":["Frecuencia","Volumen total","Cant. promedio","Div. productos","Div. categorías","Recencia"],
  "matrix":[ [1.0,0.844,0.154,0.723,0.616,-0.435], … 6 rows ] }
```
Pearson over per-client features (the `customer_profiles` dataset; recomputed
under filters). Variables: frequency(#transactions), total volume(units), avg
basket size, distinct products, distinct categories, recency(days vs filtered max
date).

---

## Análisis Avanzado

### `GET /api/advanced/segments?points_per_segment=120`

Devuelve el resumen de los cuatro clusters K-Means y una muestra de puntos para visualizar frecuencia vs volumen.

```json
{
  "segments": [
    { "segmentId": 1, "name": "Ocasionales", "customers": 46650, "sharePct": 29.45,
      "avgFrequency": 1.25, "avgUnitsTotal": 4.7, "avgDistinctProducts": 4.55,
      "avgDistinctCategories": 2.48, "avgBasketSize": 3.84, "avgRecencyDays": 108.68,
      "description": "Baja frecuencia..." }
  ],
  "points": [
    { "clientId": "CUST-102-530", "segmentId": 1, "frequency": 1, "unitsTotal": 3,
      "distinctProducts": 3, "distinctCategories": 2, "avgBasketSize": 3.0, "recencyDays": 180 }
  ]
}
```

### `GET /api/advanced/segments/customers?segment_id=4&limit=25`

Clientes destacados por volumen/frecuencia, opcionalmente filtrados por segmento.

### `GET /api/advanced/recommendations/seeds?limit=20`

Productos y clientes sugeridos para usar como semillas en la interfaz del recomendador.

### `GET /api/advanced/recommendations/products?product_id=5&limit=8`

Recomendaciones producto-producto por co-ocurrencia. Métricas: `cooccurrences`, `confidence`, `lift`, `score`.

### `GET /api/advanced/recommendations/customers?client_id=CUST-103-336296&limit=8`

Recomendaciones cliente-producto. Excluye productos ya comprados por el cliente y agrega evidencia desde sus productos históricos.
