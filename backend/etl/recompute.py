"""On-demand recompute of the advanced analytical datasets.

Re-runs the Spark builders for **customer segmentation (K-Means)** and the
**product recommender (association rules)** starting from the already-curated
``purchases`` / ``customer_profiles`` Parquet — so it does NOT re-extract or
re-clean the raw CSVs, only the expensive models are rebuilt.

Invoked as a detached subprocess by the API (``app/recompute.py``):

    python -m etl.recompute --target all

It overwrites the corresponding warehouse datasets in place; the API serves the
fresh Parquet on the next request without a restart.
"""

from __future__ import annotations

import argparse

from etl import config, warehouse
from etl.builders import customer_segments, product_recommendations
from etl.spark_session import get_spark


def main() -> None:
    parser = argparse.ArgumentParser(description="RetailAnalytics recompute (segments + recommendations)")
    parser.add_argument("--target", default="all", choices=["all", "segments", "recommendations"])
    args = parser.parse_args()

    spark = get_spark("RetailAnalyticsRecompute")
    print(f"[recompute] target={args.target}")

    if args.target in ("all", "segments"):
        print("[recompute] K-Means customer segmentation ...")
        profiles = warehouse.read(spark, config.CUSTOMER_PROFILES)
        customer_segments.build(profiles)

    if args.target in ("all", "recommendations"):
        print("[recompute] association-rule recommendations ...")
        purchases = warehouse.read(spark, config.PURCHASES)
        product_recommendations.build(purchases)

    spark.stop()
    print("[recompute] done.")


if __name__ == "__main__":
    main()
