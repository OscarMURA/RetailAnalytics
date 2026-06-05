"""customer_segments: K-Means behavioural segmentation over customer profiles.

Outputs:
  customer_segments: one row per customer with assigned segment and features.
  segment_summary: aggregate profile and business interpretation per segment.
"""

from __future__ import annotations

from pyspark.ml.clustering import KMeans
from pyspark.ml.feature import StandardScaler, VectorAssembler
from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from .. import config, warehouse

FEATURE_COLS = [
    "frequency",
    "units_total",
    "distinct_products",
    "distinct_categories",
    "avg_basket_size",
    "recency_days",
]

SEGMENT_NAMES = {
    1: "Ocasionales",
    2: "Exploradores moderados",
    3: "Frecuentes de alto volumen",
    4: "Leales intensivos",
}

SEGMENT_DESCRIPTIONS = {
    1: "Baja frecuencia, bajo volumen y alta recencia. Requieren activación o campañas de retorno.",
    2: "Compran más variedad que los ocasionales, pero aún tienen recurrencia limitada.",
    3: "Clientes recurrentes con volumen y diversidad altos. Aptos para campañas por categoría.",
    4: "Clientes más valiosos: alta frecuencia, canasta grande y fuerte diversidad de productos.",
}


def _segment_name_expr(id_col: str = "segment_id"):
    mapping = F.create_map([x for kv in SEGMENT_NAMES.items() for x in (F.lit(kv[0]), F.lit(kv[1]))])
    return F.coalesce(mapping[F.col(id_col)], F.lit("Segmento"))


def _segment_description_expr(id_col: str = "segment_id"):
    mapping = F.create_map([x for kv in SEGMENT_DESCRIPTIONS.items() for x in (F.lit(kv[0]), F.lit(kv[1]))])
    return F.coalesce(mapping[F.col(id_col)], F.lit("Segmento operativo de clientes."))


def build(customer_profiles: DataFrame, k: int = 4) -> None:
    profiles = customer_profiles.fillna(0, subset=FEATURE_COLS)
    assembler = VectorAssembler(inputCols=FEATURE_COLS, outputCol="raw_features")
    assembled = assembler.transform(profiles)
    scaler = StandardScaler(inputCol="raw_features", outputCol="scaled_features", withMean=True, withStd=True)
    scaled = scaler.fit(assembled).transform(assembled)

    model = KMeans(k=k, seed=42, featuresCol="scaled_features", predictionCol="cluster_raw", maxIter=40).fit(scaled)
    predicted = model.transform(scaled)

    # K-Means labels are arbitrary; map them to stable business segment ids by
    # increasing average volume, so segment 1 is least active and segment 4 is highest value.
    ordered = (
        predicted.groupBy("cluster_raw")
        .agg(F.avg("units_total").alias("avg_units"))
        .orderBy("avg_units")
        .collect()
    )
    mapping = {int(row["cluster_raw"]): idx + 1 for idx, row in enumerate(ordered)}
    mapping_expr = F.create_map([x for kv in mapping.items() for x in (F.lit(kv[0]), F.lit(kv[1]))])

    segmented = (
        predicted.withColumn("segment_id", mapping_expr[F.col("cluster_raw")])
        .withColumn("segment_name", _segment_name_expr())
        .select(
            "client_id",
            "segment_id",
            "segment_name",
            "frequency",
            "units_total",
            "distinct_products",
            "distinct_categories",
            "avg_basket_size",
            "recency_days",
        )
    )

    total_customers = segmented.count() or 1
    summary = (
        segmented.groupBy("segment_id", "segment_name")
        .agg(
            F.count("client_id").alias("customers"),
            F.avg("frequency").alias("avg_frequency"),
            F.avg("units_total").alias("avg_units_total"),
            F.avg("distinct_products").alias("avg_distinct_products"),
            F.avg("distinct_categories").alias("avg_distinct_categories"),
            F.avg("avg_basket_size").alias("avg_basket_size"),
            F.avg("recency_days").alias("avg_recency_days"),
        )
        .withColumn("share_pct", F.round(F.col("customers") / F.lit(total_customers) * 100.0, 2))
        .withColumn("description", _segment_description_expr())
        .orderBy("segment_id")
    )

    warehouse.write(segmented, config.CUSTOMER_SEGMENTS)
    warehouse.write(summary, config.SEGMENT_SUMMARY)
