"""RetailAnalytics FastAPI — serves precomputed ETL artifacts.

No Spark at request time: every endpoint reads a JSON file produced by
``backend/etl/pipeline.py`` from ``backend/serving/``. Re-running the ETL
refreshes the artifacts; this layer reloads them per request (cheap, small
files) so new data shows up without a restart.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

SERVING_DIR = Path(__file__).resolve().parents[1] / "serving"

app = FastAPI(title="RetailAnalytics API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def load(name: str):
    path = SERVING_DIR / f"{name}.json"
    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Serving artifact '{name}' missing — run the ETL (backend/etl/run.sh).",
        )
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


@app.get("/api/health")
def health():
    ready = (SERVING_DIR / "kpis.json").exists()
    return {"status": "ok" if ready else "no-data", "servingReady": ready}


# --------------------------------------------------------------------------- #
# Resumen Ejecutivo                                                            #
# --------------------------------------------------------------------------- #


@app.get("/api/summary/kpis")
def summary_kpis():
    return load("kpis")


@app.get("/api/summary/top-products")
def summary_top_products(limit: int = Query(10, ge=1, le=50)):
    return load("top_products")[:limit]


@app.get("/api/summary/top-customers")
def summary_top_customers(limit: int = Query(10, ge=1, le=50)):
    return load("top_customers")[:limit]


@app.get("/api/summary/categories")
def summary_categories():
    return load("categories")


@app.get("/api/summary/calendar")
def summary_calendar(days: int = Query(90, ge=1, le=365)):
    data = load("calendar")
    if days < len(data["days"]):
        trimmed = data["days"][-days:]
        peak = max(trimmed, key=lambda d: d["count"])
        counts = [d["count"] for d in trimmed]
        data = {
            **data,
            "days": trimmed,
            "peakDay": {"date": peak["date"], "count": peak["count"]},
            "dailyAvg": round(sum(counts) / len(counts), 1) if counts else 0.0,
        }
    return data


@app.get("/api/summary/coverage")
def summary_coverage():
    return load("coverage")


# --------------------------------------------------------------------------- #
# Visualizaciones Analíticas                                                   #
# --------------------------------------------------------------------------- #


@app.get("/api/viz/timeseries")
def viz_timeseries(granularity: str = Query("day", pattern="^(day|week|month)$")):
    return load("timeseries")[granularity]


@app.get("/api/viz/boxplot-categories")
def viz_boxplot_categories():
    return load("boxplot_categories")


@app.get("/api/viz/weekday-distribution")
def viz_weekday_distribution():
    return load("weekday_distribution")


@app.get("/api/viz/correlation")
def viz_correlation():
    return load("correlation")
