"""Association-rule style recommendations from basket co-occurrence.

Outputs:
  product_recommendations: top consequents per antecedent product.
  customer_product_history: compact client-product history for customer recs.
"""

from __future__ import annotations

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F

from .. import config, warehouse


def build(purchases: DataFrame, max_rules_per_product: int = 12) -> None:
    # One row per transaction-product keeps duplicate product codes inside the
    # same basket from inflating association strength.
    tx_products = purchases.select("transaction_id", "product_id").distinct()
    total_transactions = purchases.select("transaction_id").distinct().count() or 1

    product_stats = tx_products.groupBy("product_id").agg(F.count("transaction_id").alias("product_transactions"))

    left = tx_products.select("transaction_id", F.col("product_id").alias("antecedent_product_id"))
    right = tx_products.select("transaction_id", F.col("product_id").alias("recommended_product_id"))

    pair_counts = (
        left.join(right, on="transaction_id")
        .where(F.col("antecedent_product_id") != F.col("recommended_product_id"))
        .groupBy("antecedent_product_id", "recommended_product_id")
        .agg(F.count("transaction_id").alias("cooccurrences"))
    )

    antecedent_stats = product_stats.select(
        F.col("product_id").alias("antecedent_product_id"),
        F.col("product_transactions").alias("antecedent_transactions"),
    )
    recommended_stats = product_stats.select(
        F.col("product_id").alias("recommended_product_id"),
        F.col("product_transactions").alias("recommended_transactions"),
    )
    catalog = purchases.groupBy("product_id").agg(
        F.first("product_name", ignorenulls=True).alias("product_name"),
        F.first("category_name", ignorenulls=True).alias("category_name"),
        F.sum("qty").alias("units"),
    )
    ant_catalog = catalog.select(
        F.col("product_id").alias("antecedent_product_id"),
        F.col("product_name").alias("antecedent_product_name"),
        F.col("category_name").alias("antecedent_category"),
        F.col("units").alias("antecedent_units"),
    )
    rec_catalog = catalog.select(
        F.col("product_id").alias("recommended_product_id"),
        F.col("product_name").alias("recommended_product_name"),
        F.col("category_name").alias("recommended_category"),
        F.col("units").alias("recommended_units"),
    )

    rules = (
        pair_counts.join(antecedent_stats, on="antecedent_product_id")
        .join(recommended_stats, on="recommended_product_id")
        .join(ant_catalog, on="antecedent_product_id", how="left")
        .join(rec_catalog, on="recommended_product_id", how="left")
        .withColumn("confidence", F.col("cooccurrences") / F.col("antecedent_transactions"))
        .withColumn(
            "lift",
            (F.col("cooccurrences") * F.lit(total_transactions))
            / (F.col("antecedent_transactions") * F.col("recommended_transactions")),
        )
        .withColumn("score", F.col("confidence") * F.col("lift"))
    )

    ranked = rules.withColumn(
        "rank",
        F.row_number().over(
            Window.partitionBy("antecedent_product_id").orderBy(
                F.desc("score"), F.desc("cooccurrences"), F.asc("recommended_product_id")
            )
        ),
    ).where(F.col("rank") <= F.lit(max_rules_per_product))

    out = ranked.select(
        "antecedent_product_id",
        "antecedent_product_name",
        "antecedent_category",
        "antecedent_units",
        "rank",
        "recommended_product_id",
        "recommended_product_name",
        "recommended_category",
        "recommended_units",
        "cooccurrences",
        "confidence",
        "lift",
        "score",
    )

    history = purchases.groupBy("client", "product_id").agg(
        F.sum("qty").alias("units"),
        F.countDistinct("transaction_id").alias("transactions"),
        F.max("date").alias("last_purchase_date"),
        F.first("product_name", ignorenulls=True).alias("product_name"),
        F.first("category_name", ignorenulls=True).alias("category_name"),
    )

    warehouse.write(out, config.PRODUCT_RECOMMENDATIONS)
    warehouse.write(history, config.CUSTOMER_PRODUCT_HISTORY)
