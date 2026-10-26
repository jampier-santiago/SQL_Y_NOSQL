-- =====================================================================
-- 02_carga.sql · Datos sintéticos de SeguroYa
-- Los datos son 100 % deterministas: no usan random() ni CURRENT_DATE.
-- Todo sale de aritmética sobre el índice de cada fila y de una fecha de
-- corte fija (2026-10-01), así que cada corrida produce exactamente los
-- mismos números y las capturas del informe son reproducibles.
-- Además evita mezclar float con decimal, que CockroachDB no permite,
-- y la división "/" entre enteros, que allá devuelve decimal.
-- Ejecutar el archivo completo, de una sola vez, tras 00 y 01.
-- =====================================================================

-- Catálogos (ids explícitos: el resto de la carga depende de ellos)
INSERT INTO seguroya.ciudades (id, nombre, departamento) VALUES
  (1, 'Bogotá', 'Cundinamarca'),
  (2, 'Medellín', 'Antioquia'),
  (3, 'Cali', 'Valle del Cauca'),
  (4, 'Barranquilla', 'Atlántico'),
  (5, 'Bucaramanga', 'Santander'),
  (6, 'Cartagena', 'Bolívar');

INSERT INTO seguroya.productos (id, nombre, linea, prima_base) VALUES
  (1, 'SOAT Plus', 'movilidad', 75000),
  (2, 'Todo Riesgo Auto', 'movilidad', 210000),
  (3, 'Moto Protegida', 'movilidad', 90000),
  (4, 'Mascota Básico', 'mascotas', 45000),
  (5, 'Mascota Premium', 'mascotas', 85000),
  (6, 'Salud Individual', 'salud', 140000),
  (7, 'Hogar Seguro', 'hogar', 60000),
  (8, 'Hogar Total', 'hogar', 110000);

-- 500 clientes (ciudades con peso desigual: Bogotá 35 %, Medellín 20 %...)
INSERT INTO seguroya.clientes (documento, nombre, email, fecha_nacimiento, ciudad_id, fecha_registro)
SELECT (10000000 + g)::text,
  (ARRAY['Camila','Andrés','Laura','Juan','Valentina','Sebastián','Daniela','Mateo','Sara','Felipe'])[1 + g % 10]
  || ' ' ||
  (ARRAY['Gómez','Rodríguez','Martínez','López','Torres','Ramírez','Castro','Vargas','Rojas','Herrera'])[1 + floor(g / 10.0)::int % 10]
  || ' #' || g::text,
  'cliente' || g::text || '@correo.test',
  DATE '1960-01-01' + ((g * 7919) % 15000),
  CASE WHEN (g * 37) % 100 < 35 THEN 1
       WHEN (g * 37) % 100 < 55 THEN 2
       WHEN (g * 37) % 100 < 70 THEN 3
       WHEN (g * 37) % 100 < 82 THEN 4
       WHEN (g * 37) % 100 < 92 THEN 5
       ELSE 6 END,
  DATE '2022-01-01' + ((g * 104729) % 700)
FROM generate_series(1, 500) AS t(g)
ORDER BY g;

-- 1000 pólizas
-- Clientes 1-40 concentran pólizas (7 c/u), 41-400 tienen 2 y 401-500
-- no tienen ninguna. Producto con peso desigual (SOAT es el más vendido).
INSERT INTO seguroya.polizas (cliente_id, producto_id, fecha_inicio, fecha_fin, prima_mensual, estado)
SELECT b.cliente_id, b.producto_id, b.ini, b.ini + 365,
  round(p.prima_base * b.factor / 100.0, 2),
  CASE WHEN b.cancela THEN 'cancelada'
       WHEN b.ini + 365 < DATE '2026-10-01' THEN 'vencida'
       ELSE 'activa' END
FROM (
  SELECT k,
    CASE WHEN k <= 800 THEN 1 + ((k * 7919) % 400) ELSE 1 + (k % 40) END AS cliente_id,
    CASE WHEN (k * 31) % 100 < 25 THEN 1
         WHEN (k * 31) % 100 < 35 THEN 2
         WHEN (k * 31) % 100 < 50 THEN 3
         WHEN (k * 31) % 100 < 62 THEN 4
         WHEN (k * 31) % 100 < 70 THEN 5
         WHEN (k * 31) % 100 < 82 THEN 6
         WHEN (k * 31) % 100 < 92 THEN 7
         ELSE 8 END AS producto_id,
    DATE '2025-01-01' + ((k * 613) % 640) AS ini,
    80 + (k * 17) % 61 AS factor,
    (k * 13) % 100 < 8 AS cancela
  FROM generate_series(1, 1000) AS t(k)
) b
JOIN seguroya.productos p ON p.id = b.producto_id
ORDER BY b.k;

-- Pagos mensuales hasta la fecha de corte (las canceladas pagaron 3 meses)
INSERT INTO seguroya.pagos (poliza_id, fecha_pago, valor, metodo)
SELECT p.id,
  (p.fecha_inicio + INTERVAL '1 month' * m)::date,
  p.prima_mensual,
  (ARRAY['tarjeta','pse','efectivo'])[1 + (p.id + m) % 3]
FROM seguroya.polizas p
CROSS JOIN generate_series(0, 11) AS t(m)
WHERE (p.fecha_inicio + INTERVAL '1 month' * m)::date <= DATE '2026-10-01'
  AND (p.estado <> 'cancelada' OR m < 3)
ORDER BY p.id, m;

-- Siniestros: movilidad y mascotas reclaman más, así los resultados
-- cuentan una historia y no son ruido uniforme.
INSERT INTO seguroya.siniestros (poliza_id, fecha_ocurrencia, tipo, valor_reclamado, valor_pagado, estado)
SELECT s.poliza_id, s.fecha, s.tipo, s.reclamado,
  CASE WHEN s.estado IN ('aprobado','pagado')
       THEN round(s.reclamado * (60 + (s.poliza_id * 3) % 41) / 100.0, 2) END,
  s.estado
FROM (
  SELECT po.id AS poliza_id,
    po.fecha_inicio + (((po.id * po.id * 31) % 1009) % GREATEST(LEAST(po.fecha_fin, DATE '2026-10-01') - po.fecha_inicio + 1, 1)) AS fecha,
    CASE pr.linea
      WHEN 'movilidad' THEN (ARRAY['colisión','robo','daño parcial'])[1 + po.id % 3]
      WHEN 'mascotas'  THEN (ARRAY['atención veterinaria','cirugía'])[1 + po.id % 2]
      WHEN 'salud'     THEN (ARRAY['hospitalización','urgencias'])[1 + po.id % 2]
      ELSE (ARRAY['daño por agua','robo en hogar'])[1 + po.id % 2]
    END AS tipo,
    (CASE pr.linea
      WHEN 'movilidad' THEN 300000 + (po.id * 104729) % 3700000
      WHEN 'mascotas'  THEN 150000 + (po.id * 104729) % 2350000
      WHEN 'salud'     THEN 500000 + (po.id * 104729) % 5500000
      ELSE 200000 + (po.id * 104729) % 2800000
    END)::numeric AS reclamado,
    CASE WHEN (po.id * 13) % 17 < 3 THEN 'abierto'
         WHEN (po.id * 13) % 17 < 5 THEN 'aprobado'
         WHEN (po.id * 13) % 17 < 8 THEN 'rechazado'
         ELSE 'pagado' END AS estado
  FROM seguroya.polizas po
  JOIN seguroya.productos pr ON pr.id = po.producto_id
  WHERE (po.id * 7919) % 97 < CASE pr.linea
          WHEN 'movilidad' THEN 29 WHEN 'mascotas' THEN 34
          WHEN 'salud' THEN 29 ELSE 15 END
) s
ORDER BY s.poliza_id;

-- Verificación: filas por tabla y rango de ids (deben empezar en 1 y
-- terminar en el mismo número de filas; si no, corre 00_limpieza y reintenta)
SELECT 'ciudades' AS tabla, COUNT(*) AS filas, MIN(id) AS id_min, MAX(id) AS id_max FROM seguroya.ciudades
UNION ALL SELECT 'productos', COUNT(*), MIN(id), MAX(id) FROM seguroya.productos
UNION ALL SELECT 'clientes', COUNT(*), MIN(id), MAX(id) FROM seguroya.clientes
UNION ALL SELECT 'polizas', COUNT(*), MIN(id), MAX(id) FROM seguroya.polizas
UNION ALL SELECT 'pagos', COUNT(*), MIN(id), MAX(id) FROM seguroya.pagos
UNION ALL SELECT 'siniestros', COUNT(*), MIN(id), MAX(id) FROM seguroya.siniestros;
