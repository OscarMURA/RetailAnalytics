"""product_catalog: product → category with its units and transactions.

  product_id, product_name, category_id, category_name, units, transactions
"""

from __future__ import annotations

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from .. import config, warehouse


def build(baskets: DataFrame, purchases: DataFrame) -> None:
    catalog = purchases.groupBy("product_id", "product_name", "category_id", "category_name").agg(
        F.sum("qty").alias("units"),
        F.countDistinct("transaction_id").alias("transactions"),
    )
    warehouse.write(catalog, config.PRODUCT_CATALOG)
