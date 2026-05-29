"""Clean: validate + normalize raw transactions, explode baskets, attach category.

Produces the two curated datasets every analytical builder reads from:

  baskets   (transaction level, one row per basket):
    transaction_id, date, store_id, customer_id, client, n_items, dow

  purchases (item level, one row per (transaction, product)):
    transaction_id, date, store_id, customer_id, client, dow,
    product_id, qty, category_id, category_name

`client` is the composite identity CUST-{store}-{customer} (the same numeric
customer_id in different stores is a different person). `qty` = occurrences of a
product code inside one basket. Category: product_id → ProductCategory →
deterministic MIN(categoryCode) → Categories name; unmapped → category_id NULL,
category_name "Sin categoría".
"""

from __future__ import annotations

from pathlib import Path

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

from . import config, extract, warehouse


def _category_map(spark: SparkSession, input_dir: Path) -> DataFrame:
    pc = (
        extract.read_product_category(spark, input_dir)
        .filter(F.col("productCode").isNotNull() & F.col("categoryCode").isNotNull())
        .withColumn("product_id", F.trim("productCode"))
        .withColumn("category_id", F.trim("categoryCode").cast(T.IntegerType()))
        .filter(F.col("category_id").isNotNull())
    )
    deterministic = pc.groupBy("product_id").agg(F.min("category_id").alias("category_id"))
    categories = extract.read_categories(spark, input_dir).withColumn(
        "category_name", F.trim("categoryName")
    )
    return deterministic.join(
        categories.select(F.col("categoryCode").alias("category_id"), "category_name"),
        on="category_id",
        how="left",
    ).select("product_id", "category_id", "category_name")


def build_curated(spark: SparkSession, input_dir: Path):
    raw = extract.read_transactions(spark, input_dir)

    # Validate + normalize, parse the basket into a product-code array.
    baskets = (
        raw.withColumn("date", F.to_date("date", "yyyy-MM-dd"))
        .withColumn("store_id", F.trim("storeId"))
        .withColumn("customer_id", F.trim("customerId"))
        .withColumn("basket_raw", F.trim("productCodes"))
        .filter(F.col("date").isNotNull())
        .filter(F.col("basket_raw").isNotNull() & (F.col("basket_raw") != ""))
        .withColumn("product_codes", F.expr("filter(split(basket_raw, '\\\\s+'), x -> x != '')"))
        .withColumn("n_items", F.size("product_codes"))
        .filter(F.col("n_items") > 0)
        .withColumn(
            "transaction_id",
            F.sha2(
                F.concat_ws("|", "date", "store_id", "customer_id",
                            F.concat_ws(" ", "product_codes")),
                256,
            ),
        )
        .withColumn("client", F.concat_ws("-", F.lit("CUST"), "store_id", "customer_id"))
        .withColumn("dow", (F.dayofweek("date") + 5) % 7)  # 0=Mon..6=Sun
        .select(
            "transaction_id", "date", "store_id", "customer_id", "client",
            "n_items", "dow", "product_codes",
        )
    )

    cat_map = _category_map(spark, input_dir)

    purchases = (
        baskets.withColumn("product_id", F.explode("product_codes"))
        .groupBy("transaction_id", "date", "store_id", "customer_id", "client", "dow", "product_id")
        .agg(F.count(F.lit(1)).alias("qty"))
        .join(F.broadcast(cat_map), on="product_id", how="left")
        .withColumn(
            "category_name",
            F.coalesce(F.col("category_name"), F.lit(config.UNMAPPED_CATEGORY)),
        )
        .select(
            "transaction_id", "date", "store_id", "customer_id", "client", "dow",
            "product_id", "qty", "category_id", "category_name",
        )
    )

    baskets_out = baskets.drop("product_codes")
    warehouse.write(baskets_out, config.BASKETS)
    warehouse.write(purchases, config.PURCHASES)

    return (
        warehouse.read(spark, config.BASKETS),
        warehouse.read(spark, config.PURCHASES),
    )
