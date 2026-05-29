"""category_breakdown: per-category units / transactions / customers.

  category_id, category_name, units, transactions, customers
"""

from __future__ import annotations

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from .. import config, warehouse


def build(baskets: DataFrame, purchases: DataFrame) -> None:
    breakdown = purchases.groupBy("category_id", "category_name").agg(
        F.sum("qty").alias("units"),
        F.countDistinct("transaction_id").alias("transactions"),
        F.countDistinct("client").alias("customers"),
    )
    warehouse.write(breakdown, config.CATEGORY_BREAKDOWN)
