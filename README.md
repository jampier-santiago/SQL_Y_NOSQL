# SeguroYa: práctica de bases de datos SQL y NoSQL en Big Data

Repositorio de la práctica de las semanas 10, 11 y 12 de la especialización en Analítica y
Ciencia de Datos. Reúne los scripts, los datos y las evidencias del informe técnico sobre
manejo de bases de datos relacionales y no relacionales.

Autor: Santiago Moreno

## El problema

SeguroYa es una aseguradora digital ficticia con cuatro líneas de negocio: movilidad,
mascotas, salud y hogar. Los reclamos vienen creciendo y la gerencia quiere responder cuatro
preguntas:

1. ¿Qué líneas y productos concentran la siniestralidad (valor pagado frente al recaudo)?
2. ¿Qué ciudades generan más reclamos?
3. ¿Hay clientes con un comportamiento de reclamación atípico?
4. ¿La experiencia del cliente (reseñas, uso de la app, contacto con soporte) se relaciona
   con la cancelación de pólizas?

Las tres primeras se resuelven con SQL. La cuarta necesita datos de los dos motores, por eso
el caso se reparte entre ambos.

## Cómo se reparten los datos

| SQL (estructurado y transaccional)                        | MongoDB (flexible y de estructura variable)                     |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| ciudades, productos, clientes, pólizas, pagos, siniestros | reseñas, eventos de la app, detalle de siniestros, cotizaciones |

Los documentos de MongoDB se enlazan con SQL por los ids `cliente_id`, `poliza_id` y
`siniestro_id`.

```mermaid
erDiagram
    CIUDADES ||--o{ CLIENTES : "vive en"
    CLIENTES ||--o{ POLIZAS : contrata
    PRODUCTOS ||--o{ POLIZAS : "se vende como"
    POLIZAS ||--o{ PAGOS : genera
    POLIZAS ||--o{ SINIESTROS : reporta
```

| Colección MongoDB    | Qué guarda                                                    | Por qué va en MongoDB                                                   |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `resenas`            | calificación, canal, comentario, etiquetas                    | los campos cambian según el canal (`nps`, `app`, `navegador`, `agente`) |
| `eventos_app`        | login, consulta, pago, cotización, chat, reporte de siniestro | volumen alto y `metadata` distinta por tipo de evento                   |
| `detalle_siniestros` | detalle por línea, peritaje, evidencias, bitácora             | estructura anidada, un documento por siniestro                          |
| `cotizaciones`       | datos de riesgo de cada cotización                            | los campos varían por línea de producto                                 |

## Estructura del repositorio

```
.
├── README.md
├── sql/                  scripts del motor relacional
│   ├── 00_limpieza.sql
│   ├── 01_ddl.sql
│   ├── 02_carga.sql
│   ├── 03_consultas.sql
│   ├── 04_manipulacion.sql
│   └── 05_cruce_cancelacion.sql
├── nosql/                scripts de MongoDB (mongosh)
│   ├── 00_importar.md
│   ├── 01_resenas.js … 04_cotizaciones.js
│   ├── 05_limpieza_staging.js
│   ├── 06_normalizar_staging.js
│   ├── 07_consultas.js
│   ├── 08_agregaciones.js
│   ├── 09_manipulacion.js
│   └── 10_cruce_sql_mongo.js
├── data/                 CSV exportados de SQL, con encabezados
```

## Entorno

| Componente      | Uso                                                  | Versión   |
| --------------- | ---------------------------------------------------- | --------- |
| CockroachDB     | motor SQL de la práctica (compatible con PostgreSQL) | completar |
| MongoDB Atlas   | motor NoSQL                                          | completar |
| MongoDB Compass | importación de CSV y consulta visual                 | completar |
| mongosh         | ejecución de los scripts de MongoDB                  | completar |

Los scripts SQL usan solo construcciones comunes a CockroachDB y PostgreSQL, así que también
corren en PostgreSQL. No hay cadenas de conexión ni credenciales en el repositorio.

## Cómo reproducir

### SQL

Ejecutar cada archivo completo y en este orden:

1. `sql/01_ddl.sql`: crea el esquema y las seis tablas.
2. `sql/02_carga.sql`: carga los datos y termina con una consulta de verificación (filas y
   rango de ids por tabla).
3. `sql/03_consultas.sql`: consultas de análisis, solo lectura.
4. `sql/04_manipulacion.sql`: `UPDATE`, transacción con `SAVEPOINT`, vistas, índices y roles.
5. `sql/05_cruce_cancelacion.sql`: lado SQL de la pregunta 4.

Si una carga falla a medias, volver a correr `00`, `01` y `02`. En CockroachDB los ids de una
secuencia se consumen aunque la sentencia falle y la carga asume que empiezan en 1.

### MongoDB

1. Exportar de SQL las tablas `clientes`, `productos`, `polizas`, `siniestros` y `pagos`, o
   usar los archivos de `data/`, que ya traen encabezados.
2. Importarlos a Atlas como colecciones `stg_*` (pasos en `nosql/00_importar.md`).
3. Ejecutar con `mongosh`, desde la carpeta `nosql/`, en este orden:
   `01` a `04`, `06`, `07`, `08`, `09` y `10`.

```bash
mongosh "mongodb+srv://USUARIO:CLAVE@CLUSTER.mongodb.net/seguroya" --file 01_resenas.js
```

El script `05_limpieza_staging.js` es opcional y no debe ejecutarse antes del `10`, porque el
cruce usa `stg_polizas` y `stg_clientes`.

## Qué cubre cada script

| Script                           | Contenido                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `sql/01_ddl.sql`                 | tablas, llaves primarias y foráneas, `CHECK`, `UNIQUE`, `IDENTITY`                                                                           |
| `sql/02_carga.sql`               | carga masiva con `generate_series` y reglas deterministas                                                                                    |
| `sql/03_consultas.sql`           | `JOIN` múltiple, `LEFT JOIN`, CTE, función de ventana, `HAVING`, subconsulta correlacionada                                                  |
| `sql/04_manipulacion.sql`        | `ALTER`, `UPDATE` con subconsulta, transacción con `SAVEPOINT`, vistas, vista materializada, índices con `EXPLAIN ANALYZE`, roles y permisos |
| `nosql/01` a `04`                | recolección y organización: construcción de las cuatro colecciones desde los datos de SQL                                                    |
| `nosql/06_normalizar_staging.js` | conversión de tipos con `updateMany` y pipeline de agregación                                                                                |
| `nosql/07_consultas.js`          | `find`, operadores lógicos, arrays, documentos anidados, `$elemMatch`, proyecciones                                                          |
| `nosql/08_agregaciones.js`       | `$group`, `$unwind`, `$bucket`, `$cond`, `$dateToString`                                                                                     |
| `nosql/09_manipulacion.js`       | `insert`, `update`, `upsert`, `bulkWrite`, `delete`, `$out`, validación `$jsonSchema`, índices y `explain`                                   |
| `nosql/10_cruce_sql_mongo.js`    | `$lookup` y `$merge` para cruzar los dos motores                                                                                             |

## Notas sobre los datos

- Los datos son sintéticos y deterministas: no usan `random()` ni la fecha del sistema. Se
  generan con aritmética sobre el índice de cada fila y una fecha de corte fija (2026-10-01),
  de modo que cada ejecución produce los mismos conjuntos.
- En CockroachDB el orden en que se asignan los ids puede variar entre ejecuciones. Los
  scripts de MongoDB no suponen ids consecutivos.
- Hay pólizas que inician el 2026-10-02, un día después del corte. La carga de siniestros
  lo contempla con `GREATEST(..., 1)` en el cálculo de la fecha.
- Las pólizas canceladas que iniciaron después de julio de 2026 tienen una fecha de
  cancelación (`inicio + 90 días`) posterior al corte.

## Resultados esperados

| Tabla o colección    | Filas o documentos |
| -------------------- | ------------------ |
| `clientes`           | 500                |
| `productos`          | 8                  |
| `polizas`            | 1000               |
| `pagos`              | 8330               |
| `siniestros`         | 283                |
| `resenas`            | 534                |
| `eventos_app`        | 13036              |
| `detalle_siniestros` | 283                |
| `cotizaciones`       | 1600               |
