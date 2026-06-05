# Informe técnico - RetailAnalytics

## 1. Descripción de los datos

El proyecto analiza transacciones de supermercado registradas entre el 1 de enero de 2013 y el 30 de junio de 2013. La fuente se organiza en archivos de transacciones por tienda y catálogos de productos/categorías.

Estructura fuente:

- `Transactions/*_Tran.csv`: fecha, tienda, cliente y códigos de productos de la canasta.
- `Products/ProductCategory.csv`: relación producto-categoría.
- `Products/Categories.csv`: nombre de categoría por código.

Magnitudes base procesadas:

| Métrica | Valor |
|---|---:|
| Transacciones | 1.108.987 |
| Unidades vendidas | 10.591.793 |
| Clientes únicos | 158.413 |
| Productos distintos | 449 |
| Tiendas activas | 4 |
| Rango temporal | 2013-01-01 a 2013-06-30 |
| Canasta promedio | 9,55 productos por transacción |
| Día pico | 2013-06-15, con 9.476 transacciones |

Limitaciones de datos:

- No hay precios, costos ni margen. La rentabilidad se aproxima por volumen y frecuencia relativa.
- No hay hora de compra, solo fecha. No se construyen visualizaciones horarias.
- Los productos se muestran con el nombre de catálogo cuando está disponible; si el catálogo cargado no incluye nombre, se usa `Producto {id}` y categoría.
- Una proporción importante de productos queda en `Sin categoría`, por falta de mapeo en el catálogo.

## 2. Metodología de análisis

La solución usa una arquitectura reproducible:

1. ETL Spark para leer CSV, normalizar transacciones, explotar canastas a nivel producto y asignar categorías.
2. Construcción de datasets analíticos Parquet: ventas diarias, perfiles de cliente, catálogo de productos, categorías, segmentación y reglas de recomendación.
3. API FastAPI + DuckDB para consultar Parquet con filtros y entregar JSON al frontend.
4. Dashboard Next.js para KPIs, visualizaciones y módulos avanzados.

Variables derivadas principales:

- `units`: cantidad de productos en canasta.
- `frequency`: transacciones por cliente.
- `distinct_products`: diversidad de productos por cliente.
- `distinct_categories`: diversidad de categorías por cliente.
- `avg_basket_size`: tamaño promedio de canasta.
- `recency_days`: días desde la última compra hasta la fecha máxima del dataset.

## 3. Principales hallazgos visuales

Hallazgos descriptivos:

- El volumen total es de 10,59 millones de unidades en 1,11 millones de transacciones.
- La tienda 103 concentra el mayor número de transacciones dentro del periodo.
- El día pico identificado es el 15 de junio de 2013, con 9.476 transacciones.
- Las categorías de productos frescos y aromáticas tienen alta rotación.
- `Sin categoría` concentra cerca de la mitad del volumen, lo que evidencia una oportunidad de mejora del catálogo.

Top categorías por unidades:

| Categoría | Unidades | Interpretación |
|---|---:|---|
| Sin categoría | 5.330.800 | Alto volumen pendiente de depuración de catálogo |
| VERDURAS RAIZ,TUBERCULO Y BULBOS | 1.811.523 | Categoría fresca de alta rotación |
| VERDURAS DE FRUTOS | 1.410.750 | Alta participación en canastas frecuentes |
| JUGOS | 729.513 | Categoría relevante para promociones de consumo recurrente |
| AROMATICAS CONDIMENTOS | 493.388 | Fuerte presencia en recomendaciones |

Top productos por unidades:

| Producto | Categoría | Unidades |
|---|---|---:|
| Producto 5 | AROMATICAS CONDIMENTOS | 300.526 |
| Producto 10 | Sin categoría | 290.313 |
| Producto 3 | VERDURAS RAIZ,TUBERCULO Y BULBOS | 269.855 |
| Producto 4 | VERDURAS RAIZ,TUBERCULO Y BULBOS | 260.418 |
| Producto 6 | AROMATICAS MEDICINALES | 254.644 |

## 4. Resultados de segmentación

Se aplicó K-Means con `k=4` sobre perfiles de cliente. Las variables usadas fueron frecuencia, unidades totales, productos distintos, categorías distintas, tamaño promedio de canasta y recencia. Los clusters se ordenaron por volumen promedio para facilitar lectura empresarial.

| Segmento | Nombre | Clientes | Participación | Frec. prom. | Unid. prom. | Prod. distintos prom. | Cat. distintas prom. | Canasta prom. | Recencia prom. |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Ocasionales | 39.674 | 25,04% | 1,42 | 7,67 | 7,07 | 2,24 | 5,34 | 127,17 días |
| 2 | Exploradores moderados | 63.722 | 40,23% | 3,47 | 16,13 | 11,80 | 3,18 | 4,73 | 29,84 días |
| 3 | Frecuentes de alto volumen | 42.962 | 27,12% | 10,33 | 105,46 | 48,57 | 7,39 | 13,46 | 22,94 días |
| 4 | Leales intensivos | 12.055 | 7,61% | 32,16 | 392,28 | 100,12 | 10,56 | 14,15 | 5,47 días |

Interpretación empresarial:

- Ocasionales: baja frecuencia, bajo volumen y alta recencia. Requieren activación o campañas de retorno.
- Exploradores moderados: mayor variedad que los ocasionales, pero recurrencia limitada. Conviene incentivar segunda compra y aumentar frecuencia.
- Frecuentes de alto volumen: clientes recurrentes con volumen y diversidad altos. Aptos para campañas por categoría y reposición.
- Leales intensivos: clientes más valiosos por frecuencia, volumen y diversidad. Deben priorizarse en fidelización y prevención de fuga.

## 5. Resultados del recomendador

El recomendador usa reglas de asociación por co-ocurrencia de productos en una misma canasta.

Métricas usadas:

- `cooccurrences`: número de canastas donde aparecen juntos el producto origen y el recomendado.
- `confidence`: probabilidad de comprar el recomendado dado que se compró el origen.
- `lift`: fuerza de asociación frente a la popularidad individual del recomendado.
- `score`: `confidence * lift`, usado para ordenar recomendaciones.

Ejemplo producto-producto para `Producto 5`:

| Producto recomendado | Categoría | Co-ocurrencias | Confianza | Lift | Score |
|---|---|---:|---:|---:|---:|
| Producto 6 | AROMATICAS MEDICINALES | 144.638 | 48,13% | 2,10 | 1,0088 |
| Producto 10 | Sin categoría | 151.749 | 50,49% | 1,93 | 0,9740 |
| Producto 12 | Sin categoría | 125.786 | 41,86% | 2,21 | 0,9248 |

Ejemplo cliente-producto para `CUST-107-522427`:

| Producto recomendado | Categoría | Co-ocurrencias agregadas | Confianza máx. | Lift máx. | Score |
|---|---|---:|---:|---:|---:|
| Producto 165 | VERDURAS DE FRUTOS | 16.518 | 53,34% | 84,14 | 147,8894 |
| Producto 212 | Sin categoría | 12.218 | 42,66% | 97,23 | 120,7207 |
| Producto 178 | Sin categoría | 10.757 | 31,83% | 52,71 | 71,1381 |

Aplicaciones:

- Venta cruzada en caja o ecommerce.
- Exhibición conjunta en tienda.
- Armado de combos por canasta frecuente.
- Campañas personalizadas por segmento.

## 6. Conclusiones y posibles aplicaciones empresariales

Conclusiones:

- El sistema entrega una solución funcional, no limitada a consola o notebook.
- La arquitectura permite regenerar resultados al incorporar nuevos datos.
- Los módulos descriptivos identifican volumen, frecuencia, días pico y concentración por categoría.
- La segmentación convierte el comportamiento histórico en grupos accionables.
- El recomendador permite activar venta cruzada basada en evidencia transaccional.

Aplicaciones empresariales:

- Planeación de inventario por productos de alta rotación.
- Priorización de categorías para surtido y promociones.
- Campañas diferenciadas por segmento de cliente.
- Recomendaciones en canales digitales o punto de venta.
- Gobierno de datos para reducir productos sin categoría.
- Sustentación analítica de decisiones comerciales con métricas reproducibles.
