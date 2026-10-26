// =====================================================================
// 06_normalizar_staging.js · Organización de datos: tipos correctos en stg_*
// Compass puede importar números y fechas como texto. Este script los
// convierte con updateMany + pipeline de agregación ($toInt, $toDate,
// $toDouble), para que los $lookup y las comparaciones de fechas de los
// scripts siguientes funcionen. Es idempotente: se puede repetir.
// Uso:  mongosh "<URI con la base seguroya>" --file 06_normalizar_staging.js
// =====================================================================
(function () {
  const bd = db.getSiblingDB('seguroya');

  // Los vacíos importados como "" se eliminan para que el campo quede ausente
  bd.stg_polizas.updateMany({ fecha_cancelacion: '' }, { $unset: { fecha_cancelacion: '' } });
  bd.stg_siniestros.updateMany({ valor_pagado: '' }, { $unset: { valor_pagado: '' } });

  bd.stg_clientes.updateMany({}, [{ $set: {
    id: { $toInt: '$id' }, documento: { $toString: '$documento' }, ciudad_id: { $toInt: '$ciudad_id' },
    fecha_nacimiento: { $toDate: '$fecha_nacimiento' }, fecha_registro: { $toDate: '$fecha_registro' },
  } }]);

  bd.stg_productos.updateMany({}, [{ $set: { id: { $toInt: '$id' }, prima_base: { $toDouble: '$prima_base' } } }]);

  bd.stg_polizas.updateMany({}, [{ $set: {
    id: { $toInt: '$id' }, cliente_id: { $toInt: '$cliente_id' }, producto_id: { $toInt: '$producto_id' },
    fecha_inicio: { $toDate: '$fecha_inicio' }, fecha_fin: { $toDate: '$fecha_fin' },
    prima_mensual: { $toDouble: '$prima_mensual' },
  } }]);
  // fecha_cancelacion solo existe en las pólizas canceladas
  bd.stg_polizas.updateMany({ fecha_cancelacion: { $type: 'string' } }, [{ $set: { fecha_cancelacion: { $toDate: '$fecha_cancelacion' } } }]);

  bd.stg_siniestros.updateMany({}, [{ $set: {
    id: { $toInt: '$id' }, poliza_id: { $toInt: '$poliza_id' },
    fecha_ocurrencia: { $toDate: '$fecha_ocurrencia' }, valor_reclamado: { $toDouble: '$valor_reclamado' },
  } }]);
  // valor_pagado solo existe en los siniestros aprobados o pagados
  bd.stg_siniestros.updateMany({ valor_pagado: { $type: 'string' } }, [{ $set: { valor_pagado: { $toDouble: '$valor_pagado' } } }]);

  if (bd.stg_pagos.countDocuments() > 0) {
    bd.stg_pagos.updateMany({}, [{ $set: {
      id: { $toInt: '$id' }, poliza_id: { $toInt: '$poliza_id' },
      fecha_pago: { $toDate: '$fecha_pago' }, valor: { $toDouble: '$valor' },
    } }]);
  }

  // Verificación: tipo de un campo clave por colección
  const tipos = (col, campo) => bd.getCollection(col).aggregate([
    { $group: { _id: { $type: '$' + campo }, documentos: { $sum: 1 } } },
  ]).toArray();
  print('stg_polizas.fecha_inicio   →', JSON.stringify(tipos('stg_polizas', 'fecha_inicio')));
  print('stg_polizas.cliente_id     →', JSON.stringify(tipos('stg_polizas', 'cliente_id')));
  print('stg_siniestros.valor_pagado →', JSON.stringify(tipos('stg_siniestros', 'valor_pagado')));
  print('stg_clientes.fecha_registro →', JSON.stringify(tipos('stg_clientes', 'fecha_registro')));
})();
