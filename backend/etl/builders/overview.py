"""overview: single-row global totals and date range.

  date_min, date_max, total_units, total_transactions, unique_customers,
  distinct_products, active_stores
"""

from __future__ import annotations

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

from .. import config, warehouse


def build(spark: SparkSession, baskets: DataFrame, purchases: DataFrame) -> None:
    agg = baskets.agg(
        F.min("date").alias("date_min"),
        F.max("date").alias("date_max"),
        F.count(F.lit(1)).alias("total_transactions"),
        F.countDistinct("client").alias("unique_customers"),
        F.countDistinct("store_id").alias("active_stores"),
    ).collect()[0]
    total_units = purchases.agg(F.sum("qty")).collect()[0][0]
    distinct_products = purchases.select("product_id").distinct().count()
    row = spark.createDataFrame(
        [
            (
                agg["date_min"], agg["date_max"], int(total_units),
                int(agg["total_transactions"]), int(agg["unique_customers"]),
                int(distinct_products), int(agg["active_stores"]),
            )
        ],
        schema="date_min date, date_max date, total_units long, total_transactions long, "
        "unique_customers long, distinct_products long, active_stores long",
    )
    warehouse.write(row, config.OVERVIEW)
