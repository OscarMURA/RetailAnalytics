"""Paths and constants for the domain-oriented ETL.

The ETL extracts raw CSVs, cleans them into two curated datasets (`purchases`
at item level, `baskets` at transaction level), then builds analytical datasets
into a Parquet warehouse that DuckDB serves.
"""

from __future__ import annotations

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent

DEFAULT_INPUT_DIR = PROJECT_DIR / "DataSet" / "DataSet"

WAREHOUSE_DIR = BACKEND_DIR / "warehouse"

# Curated datasets
PURCHASES = WAREHOUSE_DIR / "purchases"          # item level
BASKETS = WAREHOUSE_DIR / "baskets"              # transaction level

# Analytical datasets (one builder each)
DAILY_SALES = WAREHOUSE_DIR / "daily_sales"
CUSTOMER_PROFILES = WAREHOUSE_DIR / "customer_profiles"
PRODUCT_CATALOG = WAREHOUSE_DIR / "product_catalog"
CATEGORY_BREAKDOWN = WAREHOUSE_DIR / "category_breakdown"
OVERVIEW = WAREHOUSE_DIR / "overview"

UNMAPPED_CATEGORY = "Sin categoría"

# dayofweek mapping: 0=Mon .. 6=Sun (matches frontend convention)
WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
