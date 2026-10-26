-- =====================================================================
-- 04_manipulacion.sql · DML, transacciones, vistas, índices y roles
-- Ejecutar después de 03. Algunos bloques no son idempotentes
-- (el recargo del 5 % se acumularía si se corre dos veces): para
-- repetir la práctica, correr de nuevo 00, 01 y 02.
-- =====================================================================

-- 1. ALTER + UPDATE: registrar la fecha de cancelación.
--    Las canceladas pagaron 3 meses, así que se cancelan a los 90 días.
ALTER TABLE seguroya.polizas ADD COLUMN IF NOT EXISTS fecha_cancelacion DATE;

UPDATE seguroya.polizas
SET fecha_cancelacion = fecha_inicio + 90
WHERE estado = 'cancelada' AND fecha_cancelacion IS NULL;

-- 2. UPDATE: avanzar el tiempo. La carga usa corte 2026-10-01; al día
--    de la práctica algunas pólizas activas ya terminaron su vigencia.
UPDATE seguroya.polizas
SET estado = 'vencida'
WHERE estado = 'activa' AND fecha_fin < DATE '2026-10-25';

-- 3. UPDATE con subconsulta: recargo del 5 % a clientes con 2+ siniestros
UPDATE seguroya.polizas
SET prima_mensual = round(prima_mensual * 1.05, 2)
WHERE estado = 'activa'
  AND cliente_id IN (
    SELECT po.cliente_id
    FROM seguroya.siniestros s
    JOIN seguroya.polizas po ON po.id = s.poliza_id
    GROUP BY po.cliente_id
    HAVING COUNT(*) >= 2
  );

-- 4. Transacción con SAVEPOINT: probar un borrado y deshacerlo.
--    Ejecutar el bloque completo en una misma sesión.
BEGIN;
  SAVEPOINT antes_borrado;
  DELETE FROM seguroya.siniestros
  WHERE estado = 'rechazado' AND valor_reclamado < 500000;
  SELECT COUNT(*) AS siniestros_tras_borrar FROM seguroya.siniestros;
  ROLLBACK TO SAVEPOINT antes_borrado;
  SELECT COUNT(*) AS siniestros_tras_rollback FROM seguroya.siniestros;
COMMIT;

-- 5. Vista y vista materializada para el reporte gerencial
CREATE VIEW seguroya.v_siniestros_detalle AS
SELECT s.id, s.fecha_ocurrencia, s.tipo, s.estado, s.valor_reclamado, s.valor_pagado,
       pr.linea, pr.nombre AS producto, ci.nombre AS ciudad
FROM seguroya.siniestros s
JOIN seguroya.polizas po   ON po.id = s.poliza_id
JOIN seguroya.productos pr ON pr.id = po.producto_id
JOIN seguroya.clientes cl  ON cl.id = po.cliente_id
JOIN seguroya.ciudades ci  ON ci.id = cl.ciudad_id;

CREATE MATERIALIZED VIEW seguroya.mv_resumen_mensual AS
SELECT date_trunc('month', fecha_ocurrencia)::date AS mes, linea,
       COUNT(*) AS siniestros, SUM(valor_pagado) AS pagado
FROM seguroya.v_siniestros_detalle
GROUP BY 1, 2;

REFRESH MATERIALIZED VIEW seguroya.mv_resumen_mensual;
SELECT * FROM seguroya.mv_resumen_mensual ORDER BY mes, linea LIMIT 10;

-- 6. Índices: comparar el plan antes y después.
--    fecha_pago no es llave foránea, así que no existe un índice previo.
EXPLAIN ANALYZE SELECT COUNT(*) FROM seguroya.pagos WHERE fecha_pago >= DATE '2026-09-01';
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON seguroya.pagos (fecha_pago);
EXPLAIN ANALYZE SELECT COUNT(*) FROM seguroya.pagos WHERE fecha_pago >= DATE '2026-09-01';

-- 7. Administración: rol de solo lectura sin acceso a datos personales.
--    Se expone una vista de clientes sin documento, nombre ni email, porque
--    CockroachDB no soporta permisos por columna.
CREATE VIEW seguroya.v_clientes_anonimo AS
SELECT id, ciudad_id, fecha_registro FROM seguroya.clientes;

CREATE ROLE analista_riesgo NOLOGIN;
GRANT USAGE ON SCHEMA seguroya TO analista_riesgo;
GRANT SELECT ON TABLE seguroya.polizas, seguroya.pagos, seguroya.siniestros,
                      seguroya.productos, seguroya.ciudades,
                      seguroya.v_siniestros_detalle, seguroya.v_clientes_anonimo
  TO analista_riesgo;

-- Opcional, para evidenciar el permiso (requiere sesión con privilegios de admin):
-- SET ROLE analista_riesgo;
-- SELECT * FROM seguroya.v_clientes_anonimo LIMIT 3;   -- funciona
-- SELECT * FROM seguroya.clientes LIMIT 3;             -- permission denied
-- RESET ROLE;
