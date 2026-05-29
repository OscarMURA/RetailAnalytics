"""daily_sales: per (date, store) units / transactions / customers.

The serving layer's filtered time-series and KPIs are driven by this dataset.
  date, store_id, units, transactions, customers
"""

from __future__ import annotations

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from .. import config, warehouse


def build(baskets: DataFrame, purchases: DataFrame) -> None:
    units_daily = purchases.groupBy("date", "store_id").agg(F.sum("qty").alias("units"))
    txn_daily = baskets.groupBy("date", "store_id").agg(
        F.count(F.lit(1)).alias("transactions"),
        F.countDistinct("client").alias("customers"),
    )
    daily = units_daily.join(txn_daily, on=["date", "store_id"], how="outer").fillna(
        0, subset=["units", "transactions", "customers"]
    )
    warehouse.write(daily, config.DAILY_SALES)
