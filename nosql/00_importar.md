# 00 · Importar los datos de SQL a MongoDB (colecciones de apoyo)

Las colecciones NoSQL de SeguroYa se construyen a partir de lo que ya existe en SQL
(qué pólizas están canceladas, qué siniestros hay y en qué estado). Por eso primero se
exportan las tablas y se importan a Atlas como colecciones de apoyo con prefijo `stg_`.

## 1. Archivos

Usar los CSV de `data/` del repo. Ya traen la fila de encabezados; los CSV exportados
directamente de la consola SQL no la traen, y Compass tomaría la primera fila como nombres de campo.

| Archivo | Colección de apoyo | Lo usan los scripts |
|---|---|---|
| `clientes.csv` | `stg_clientes` | 03, 04 |
| `productos.csv` | `stg_productos` | 01, 02, 03, 04 |
| `polizas.csv` | `stg_polizas` | 01, 02, 03, 04 |
| `siniestros.csv` | `stg_siniestros` | 01, 02, 03 |
| `pagos.csv` | `stg_pagos` (opcional) | ninguno; queda para consultas posteriores |

## 2. Importar con Compass

1. Conectarse a Atlas con la cadena `mongodb+srv://...` y crear la base `seguroya`.
2. Dentro de `seguroya`, crear la colección `stg_clientes` (y las demás de la tabla).
3. En cada una: **Add Data → Import JSON or CSV file**, elegir el CSV, tipo **CSV**.
4. Marcar **Ignore empty strings** (importante: `valor_pagado` y `fecha_cancelacion`
   vienen vacíos en muchas filas y no deben quedar como texto vacío).
5. Los tipos que Compass proponga (número o texto) sirven: los scripts convierten con
   `Number()` y con una función de fechas que acepta texto `AAAA-MM-DD` o fecha.
6. Importar y comprobar el conteo de documentos.

Alternativa por línea de comandos (requiere MongoDB Database Tools):

```bash
mongoimport --uri "mongodb+srv://usuario:clave@cluster.xxxxx.mongodb.net/seguroya" \
  --collection stg_polizas --type csv --headerline --ignoreBlanks --file data/polizas.csv
```

## 3. Conteos esperados

| Colección | Documentos |
|---|---|
| `stg_clientes` | 500 |
| `stg_productos` | 8 |
| `stg_polizas` | 1000 |
| `stg_siniestros` | 283 |
| `stg_pagos` | 8330 |

## 4. Ejecutar los scripts, en orden

La URI debe incluir el nombre de la base (`.../seguroya`); los scripts además fuerzan
la base `seguroya` con `getSiblingDB`.

```bash
mongosh "mongodb+srv://usuario:clave@cluster.xxxxx.mongodb.net/seguroya" --file 01_resenas.js
mongosh "..." --file 02_eventos_app.js
mongosh "..." --file 03_detalle_siniestros.js
mongosh "..." --file 04_cotizaciones.js
```

También sirve pegar cada archivo, completo, en la pestaña **_MONGOSH** de Compass.
Cada script vacía y recarga su colección destino, así que se pueden repetir.

## 5. Resultado esperado

| Colección | Documentos aprox. |
|---|---|
| `resenas` | ~540 |
| `eventos_app` | ~13.000 |
| `detalle_siniestros` | 283 |
| `cotizaciones` | 1.600 |

`05_limpieza_staging.js` es opcional: no ejecutarlo si se van a hacer cruces con
`stg_polizas` o `stg_clientes` en las consultas.

## 6. Scripts de análisis (después de generar las colecciones)

Orden completo de ejecución en MongoDB:

| Script | Qué hace |
|---|---|
| `01` a `04` | genera `resenas`, `eventos_app`, `detalle_siniestros`, `cotizaciones` |
| `06_normalizar_staging.js` | convierte a número y fecha los campos importados de `stg_*` |
| `07_consultas.js` | consultas de lectura: filtros, arrays, anidados, `$elemMatch` |
| `08_agregaciones.js` | pipelines: `$group`, `$unwind`, `$bucket`, `$cond`, `$dateToString` |
| `09_manipulacion.js` | insert, update, upsert, `bulkWrite`, delete, validación de esquema e índices |
| `10_cruce_sql_mongo.js` | cruce con SQL para la pregunta 4 (`$lookup` y `$merge`) |

El lado SQL del cruce está en `sql/05_cruce_cancelacion.sql`: sus resultados (clientes
con cancelación y tasa por línea) deben coincidir con los bloques 1 y 5 del script 10.
