# RetailAnalytics

Solución funcional para análisis de transacciones de supermercado. Incluye ETL con Spark, API FastAPI + DuckDB, dashboard Next.js, segmentación K-Means y recomendador por reglas de asociación.

## Alcance cubierto

- Resumen ejecutivo con KPIs, top productos/clientes, días pico y categorías por volumen.
- Visualizaciones analíticas: serie temporal, boxplot, distribución por día de semana y heatmap de correlación.
- Segmentación de clientes con K-Means sobre frecuencia, volumen, diversidad, canasta promedio y recencia.
- Recomendador producto-producto y cliente-producto por co-ocurrencia, confianza y lift.
- Reprocesamiento de nuevos datos mediante `backend/etl/run.sh`.
- Informe técnico en `reports/Informe_Tecnico_RetailAnalytics.md`.

## Estructura

```text
DataSet/DataSet/                 CSV fuente
backend/etl/                     ETL Spark y builders analíticos
backend/app/                     API FastAPI sobre Parquet con DuckDB
frontend-retail/                 Dashboard web Next.js
reports/                         Informe técnico
```

## Ejecutar backend

Requisitos: Python 3.11+, Java 17 y `uv`.

```bash
cd backend
uv venv
uv pip install "pyspark==4.1.1" "duckdb>=1.5" "fastapi>=0.115" "uvicorn[standard]>=0.32" "numpy>=1.26"
./etl/run.sh
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

API: `http://localhost:8000`  
Swagger: `http://localhost:8000/docs`

## Ejecutar frontend

```bash
cd frontend-retail
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Dashboard: `http://localhost:3000`

Credenciales demo:

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Analista | `analista` | `analista123` |
| Visor | `visor` | `visor123` |

## Regenerar resultados con nuevos datos

Reemplazar o apuntar a una carpeta con la misma estructura:

```text
Transactions/*_Tran.csv
Products/ProductCategory.csv
Products/Categories.csv
```

Luego ejecutar:

```bash
cd backend
./etl/run.sh --input /ruta/a/DataSet
```

El ETL sobreescribe `backend/warehouse/` con los datasets actualizados. La API consulta Parquet en cada request, por lo que los nuevos resultados quedan disponibles sin cambiar el frontend.

## Informe técnico

El informe solicitado está en:

```text
reports/Informe_Tecnico_RetailAnalytics.md
```
