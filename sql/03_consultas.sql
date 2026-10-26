-- =====================================================================
-- 03_consultas.sql · Consultas de análisis (solo lectura)
-- =====================================================================

-- 1. Filtro + orden: los 10 siniestros abiertos más costosos
SELECT id, poliza_id, tipo, valor_reclamado
FROM seguroya.siniestros
WHERE estado = 'abierto'
ORDER BY valor_reclamado DESC
LIMIT 10;

-- 2. JOIN múltiple: pólizas activas con cliente, producto y ciudad
--    (devuelve muchas filas; en el informe capturar las primeras)
SELECT cl.nombre AS cliente, ci.nombre AS ciudad, pr.nombre AS producto, po.prima_mensual
FROM seguroya.polizas po
JOIN seguroya.clientes cl  ON cl.id = po.cliente_id
JOIN seguroya.ciudades ci  ON ci.id = cl.ciudad_id
JOIN seguroya.productos pr ON pr.id = po.producto_id
WHERE po.estado = 'activa'
ORDER BY po.id
LIMIT 20;

-- 3. LEFT JOIN: clientes que nunca han contratado una póliza
SELECT cl.id, cl.nombre
FROM seguroya.clientes cl
LEFT JOIN seguroya.polizas po ON po.cliente_id = cl.id
WHERE po.id IS NULL
ORDER BY cl.id
LIMIT 20;

-- 4. Pregunta 1: siniestralidad (pagado / recaudo) por línea.
--    Dos CTE por separado para no multiplicar filas al unir pagos y siniestros.
WITH recaudo AS (
  SELECT pr.linea, SUM(pg.valor) AS recaudo
  FROM seguroya.pagos pg
  JOIN seguroya.polizas po   ON po.id = pg.poliza_id
  JOIN seguroya.productos pr ON pr.id = po.producto_id
  GROUP BY pr.linea
), reclamos AS (
  SELECT pr.linea, COUNT(*) AS n_siniestros, SUM(s.valor_pagado) AS pagado
  FROM seguroya.siniestros s
  JOIN seguroya.polizas po   ON po.id = s.poliza_id
  JOIN seguroya.productos pr ON pr.id = po.producto_id
  GROUP BY pr.linea
)
SELECT r.linea, r.recaudo,
       COALESCE(d.n_siniestros, 0) AS siniestros,
       COALESCE(d.pagado, 0) AS pagado,
       ROUND(100 * COALESCE(d.pagado, 0) / r.recaudo, 1) AS siniestralidad_pct
FROM recaudo r
LEFT JOIN reclamos d ON d.linea = r.linea
ORDER BY siniestralidad_pct DESC;

-- 5. Pregunta 2: ranking de ciudades con función de ventana
SELECT ci.nombre AS ciudad,
       COUNT(*) AS siniestros,
       SUM(s.valor_pagado) AS pagado,
       RANK() OVER (ORDER BY SUM(s.valor_pagado) DESC NULLS LAST) AS posicion
FROM seguroya.siniestros s
JOIN seguroya.polizas po  ON po.id = s.poliza_id
JOIN seguroya.clientes cl ON cl.id = po.cliente_id
JOIN seguroya.ciudades ci ON ci.id = cl.ciudad_id
GROUP BY ci.nombre
ORDER BY posicion;

-- 6. Pregunta 3: clientes con 3 o más siniestros (HAVING)
SELECT cl.id, cl.nombre, COUNT(*) AS n_siniestros
FROM seguroya.siniestros s
JOIN seguroya.polizas po  ON po.id = s.poliza_id
JOIN seguroya.clientes cl ON cl.id = po.cliente_id
GROUP BY cl.id, cl.nombre
HAVING COUNT(*) >= 3
ORDER BY n_siniestros DESC, cl.id;

-- 7. Evolución mensual de siniestros y valor reclamado
SELECT date_trunc('month', fecha_ocurrencia)::date AS mes,
       COUNT(*) AS siniestros,
       SUM(valor_reclamado) AS reclamado
FROM seguroya.siniestros
GROUP BY 1
ORDER BY 1;

-- 8. Subconsulta correlacionada: siniestros por encima del promedio de su línea
SELECT s.id, pr.linea, s.valor_reclamado
FROM seguroya.siniestros s
JOIN seguroya.polizas po   ON po.id = s.poliza_id
JOIN seguroya.productos pr ON pr.id = po.producto_id
WHERE s.valor_reclamado > (
  SELECT AVG(s2.valor_reclamado)
  FROM seguroya.siniestros s2
  JOIN seguroya.polizas p2   ON p2.id = s2.poliza_id
  JOIN seguroya.productos r2 ON r2.id = p2.producto_id
  WHERE r2.linea = pr.linea
)
ORDER BY s.valor_reclamado DESC
LIMIT 20;

-- 9. Pregunta 4 (parte SQL): tasa de cancelación por línea.
--    El cruce con reseñas y eventos de la app se hace luego con los datos de MongoDB.
SELECT pr.linea,
       COUNT(*) AS polizas,
       SUM(CASE WHEN po.estado = 'cancelada' THEN 1 ELSE 0 END) AS canceladas,
       ROUND(100.0 * SUM(CASE WHEN po.estado = 'cancelada' THEN 1 ELSE 0 END) / COUNT(*), 1) AS cancelacion_pct
FROM seguroya.polizas po
JOIN seguroya.productos pr ON pr.id = po.producto_id
GROUP BY pr.linea
ORDER BY cancelacion_pct DESC;
