// =====================================================================
// 05_limpieza_staging.js · OPCIONAL. Elimina las colecciones de apoyo stg_*.
// Ejecutar solo cuando ya no se necesiten: stg_polizas y stg_clientes
// sirven para cruces con $lookup (por ejemplo, reseñas contra el estado
// de la póliza) en las consultas posteriores.
// =====================================================================
(function () {
  const bd = db.getSiblingDB('seguroya');
  ['stg_clientes', 'stg_productos', 'stg_polizas', 'stg_pagos', 'stg_siniestros'].forEach((n) => {
    bd.getCollection(n).drop();
    print(`${n} eliminada`);
  });
})();
