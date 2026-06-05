"""RetailAnalytics ETL orchestrator — domain-oriented Spark job.

Apache Spark job. Reads the raw pipe-delimited CSV dataset, cleans it into two
curated datasets (`purchases` at item level, `baskets` at transaction level),
then runs one builder per analytical dataset, writing everything as Parquet under
``backend/warehouse/`` for DuckDB to serve.

Re-runnable / idempotent: every dataset is overwritten. Point ``--input`` at a
directory with the same ``Transactions/`` + ``Products/`` layout and re-run to
ingest new data ("incorporación de nuevos datos").

  extract  : read raw transaction + product/category CSVs.
  clean    : validate, explode baskets, attach category → purchases + baskets.
  builders : daily_sales, customer_profiles, customer_segments, product_catalog,
             category_breakdown, product_recommendations, overview.

DATA INTERPRETATION RULES (documented in README):
  - 1 CSV row = 1 transaction. units = sum of basket lengths.
  - Client identity = composite (store_id, customer_id); label CUST-{store}-{customer}.
  - Product→category: MIN categoryCode; unmapped → category_id NULL / "Sin categoría".
  - No time-of-day exists → weekday (dow 0=Mon..6=Sun), never hours.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from etl import clean, config, warehouse
from etl.builders import (
    category_breakdown,
    customer_profiles,
    customer_segments,
    daily_sales,
    overview,
    product_catalog,
    product_recommendations,
)
from etl.spark_session import get_spark


def main() -> None:
    parser = argparse.ArgumentParser(description="RetailAnalytics ETL")
    parser.add_argument("--input", default=str(config.DEFAULT_INPUT_DIR), help="Dataset root")
    args = parser.parse_args()
    input_dir = args.input  # str — may be a local path or a gs:// URI

    if not config.is_remote(config.WAREHOUSE_DIR):
        Path(config.WAREHOUSE_DIR).mkdir(parents=True, exist_ok=True)
    spark = get_spark()
    print(f"[ETL] input={input_dir}  warehouse={config.WAREHOUSE_DIR}")

    print("[ETL] extract + clean → purchases, baskets ...")
    baskets, purchases = clean.build_curated(spark, input_dir)

    print("[ETL] builders ...")
    daily_sales.build(baskets, purchases)
    customer_profiles.build(baskets, purchases)
    customer_segments.build(warehouse.read(spark, config.CUSTOMER_PROFILES))
    product_catalog.build(baskets, purchases)
    category_breakdown.build(baskets, purchases)
    product_recommendations.build(purchases)
    overview.build(spark, baskets, purchases)

    tx_n = baskets.count()
    units = purchases.agg({"qty": "sum"}).collect()[0][0]
    dmin = baskets.agg({"date": "min"}).collect()[0][0]
    dmax = baskets.agg({"date": "max"}).collect()[0][0]
    print(f"[ETL] done. transactions={tx_n} units={units} range={dmin}..{dmax}")
    print(f"[ETL] Parquet warehouse written to {config.WAREHOUSE_DIR}")
    spark.stop()


if __name__ == "__main__":
    main()
