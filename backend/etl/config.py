"""Paths and constants for the domain-oriented ETL.

The ETL extracts raw CSVs, cleans them into two curated datasets (`purchases`
at item level, `baskets` at transaction level), then builds analytical datasets
into a Parquet warehouse that DuckDB serves.

Input and warehouse roots are env-overridable and may be local paths OR
``gs://`` URIs, so the exact same builders run locally (subprocess Spark) and on
Dataproc Serverless (reading/writing GCS):

  RETAIL_INPUT      dataset root (Transactions/ + Products/)
  RETAIL_WAREHOUSE  Parquet warehouse root
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent

# Strings (not Path) so gs:// URIs survive — Path() would collapse "gs://" → "gs:/".
DEFAULT_INPUT_DIR = os.environ.get("RETAIL_INPUT", str(PROJECT_DIR / "DataSet" / "DataSet"))
WAREHOUSE_DIR = os.environ.get("RETAIL_WAREHOUSE", str(BACKEND_DIR / "warehouse"))


def _w(name: str) -> str:
    return f"{WAREHOUSE_DIR.rstrip('/')}/{name}"


def is_remote(path: str) -> bool:
    return str(path).startswith("gs://")


# Curated datasets
PURCHASES = _w("purchases")  # item level
BASKETS = _w("baskets")  # transaction level

# Analytical datasets (one builder each)
DAILY_SALES = _w("daily_sales")
CUSTOMER_PROFILES = _w("customer_profiles")
PRODUCT_CATALOG = _w("product_catalog")
CATEGORY_BREAKDOWN = _w("category_breakdown")
OVERVIEW = _w("overview")
CUSTOMER_SEGMENTS = _w("customer_segments")
SEGMENT_SUMMARY = _w("segment_summary")
PRODUCT_RECOMMENDATIONS = _w("product_recommendations")
CUSTOMER_PRODUCT_HISTORY = _w("customer_product_history")

UNMAPPED_CATEGORY = "Sin categoría"

# dayofweek mapping: 0=Mon .. 6=Sun (matches frontend convention)
WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
