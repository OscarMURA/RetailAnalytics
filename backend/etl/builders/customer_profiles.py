"""customer_profiles: per-client behavioural features (Pearson correlation source).

  client_id, frequency, units_total, distinct_products, distinct_categories,
  avg_basket_size, recency_days
"""

from __future__ import annotations

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from .. import config, warehouse


def build(baskets: DataFrame, purchases: DataFrame) -> None:
    max_date = baskets.agg(F.max("date")).collect()[0][0]
    per_basket = baskets.groupBy("client").agg(
        F.count(F.lit(1)).alias("frequency"),
        F.avg("n_items").alias("avg_basket_size"),
        F.max("date").alias("last_date"),
    )
    per_item = purchases.groupBy("client").agg(
        F.sum("qty").alias("units_total"),
        F.countDistinct("product_id").alias("distinct_products"),
        F.countDistinct("category_id").alias("distinct_categories"),
    )
    profiles = (
        per_basket.join(per_item, on="client", how="left")
        .withColumn("recency_days", F.datediff(F.lit(max_date), F.col("last_date")))
        .select(
            F.col("client").alias("client_id"),
            "frequency", "units_total", "distinct_products", "distinct_categories",
            "avg_basket_size", "recency_days",
        )
        .fillna(0)
    )
    warehouse.write(profiles, config.CUSTOMER_PROFILES)
