-- =====================================================================
-- 05_cruce_cancelacion.sql · Lado SQL de la pregunta 4
-- Cancelación y comportamiento de pago. Se comparan con los resultados de
-- nosql/10_cruce_sql_mongo.js (misma tasa por línea y mismo número de
-- clientes con cancelación).
-- =====================================================================

-- 1. Clientes con al menos una póliza cancelada (debe coincidir con Mongo, bloque 5)
SELECT COUNT(DISTINCT cliente_id) AS clientes_con_cancelacion
FROM seguroya.polizas
WHERE estado = 'cancelada';

-- 2. Tasa de cancelación por línea (debe coincidir con Mongo, bloque 1)
SELECT pr.linea,
       COUNT(*) AS polizas,
       SUM(CASE WHEN po.estado = 'cancelada' THEN 1 ELSE 0 END) AS canceladas,
       ROUND(100.0 * SUM(CASE WHEN po.estado = 'cancelada' THEN 1 ELSE 0 END) / COUNT(*), 1) AS cancelacion_pct
FROM seguroya.polizas po
JOIN seguroya.productos pr ON pr.id = po.producto_id
GROUP BY pr.linea
ORDER BY cancelacion_pct DESC;

-- 3. Comportamiento de pago: pólizas canceladas vs. el resto
SELECT CASE WHEN po.estado = 'cancelada' THEN 'cancelada' ELSE 'no cancelada' END AS grupo,
       COUNT(DISTINCT po.id) AS polizas,
       COUNT(pg.id) AS pagos,
       ROUND(1.0 * COUNT(pg.id) / COUNT(DISTINCT po.id), 1) AS pagos_por_poliza
FROM seguroya.polizas po
LEFT JOIN seguroya.pagos pg ON pg.poliza_id = po.id
GROUP BY CASE WHEN po.estado = 'cancelada' THEN 'cancelada' ELSE 'no cancelada' END;
