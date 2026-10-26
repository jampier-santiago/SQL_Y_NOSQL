// =====================================================================
// 10_cruce_sql_mongo.js · Pregunta 4: ¿la experiencia del cliente
// (reseñas, uso de la app, contacto a soporte) se relaciona con la
// cancelación de pólizas?
// La cancelación vive en SQL (importada como stg_polizas) y la experiencia
// en MongoDB, así que se cruzan con $lookup. Requiere haber corrido el 06.
// Uso:  mongosh "<URI con la base seguroya>" --file 10_cruce_sql_mongo.js
// =====================================================================
(function () {
  const bd = db.getSiblingDB('seguroya');
  const mostrar = (titulo, resultado) => { print('\n=== ' + titulo); printjson(resultado); };

  // Índices para que los $lookup no recorran la colección completa
  bd.stg_polizas.createIndex({ id: 1 }, { name: 'idx_stg_polizas_id' });
  bd.stg_polizas.createIndex({ cliente_id: 1 }, { name: 'idx_stg_polizas_cliente' });
  bd.eventos_app.createIndex({ cliente_id: 1, tipo: 1 }, { name: 'idx_eventos_cliente_tipo' });
  bd.resenas.createIndex({ cliente_id: 1 }, { name: 'idx_resenas_cliente' });

  // 1. Misma pregunta que 03_consultas.sql (consulta 9), resuelta en Mongo:
  //    tasa de cancelación por línea. Debe coincidir con SQL.
  mostrar('1. Tasa de cancelación por línea (comparar con SQL)', bd.stg_polizas.aggregate([
    { $lookup: { from: 'stg_productos', localField: 'producto_id', foreignField: 'id', as: 'prod' } },
    { $unwind: '$prod' },
    { $group: { _id: '$prod.linea', polizas: { $sum: 1 },
        canceladas: { $sum: { $cond: [{ $eq: ['$estado', 'cancelada'] }, 1, 0] } } } },
    { $project: { _id: 0, linea: '$_id', polizas: 1, canceladas: 1,
        cancelacion_pct: { $round: [{ $multiply: [100, { $divide: ['$canceladas', '$polizas'] }] }, 1] } } },
    { $sort: { cancelacion_pct: -1 } },
  ]).toArray());

  // 2. Reseñas (Mongo) cruzadas con el estado de la póliza (SQL)
  mostrar('2. Calificación promedio según el estado de la póliza', bd.resenas.aggregate([
    { $lookup: { from: 'stg_polizas', localField: 'poliza_id', foreignField: 'id', as: 'pol' } },
    { $unwind: '$pol' },
    { $group: { _id: '$pol.estado', resenas: { $sum: 1 }, calificacion_prom: { $avg: '$calificacion' } } },
    { $project: { _id: 0, estado_poliza: '$_id', resenas: 1, calificacion_prom: { $round: ['$calificacion_prom', 2] } } },
    { $sort: { calificacion_prom: 1 } },
  ]).toArray());

  // 3. Perfil por cliente: cancelación (SQL) + reseñas, eventos y chats (Mongo).
  //    $merge guarda el resultado en la colección analisis_cliente.
  bd.stg_clientes.aggregate([
    { $lookup: { from: 'stg_polizas', localField: 'id', foreignField: 'cliente_id', as: 'pols' } },
    { $lookup: { from: 'resenas', localField: 'id', foreignField: 'cliente_id', as: 'res' } },
    { $lookup: { from: 'eventos_app', localField: 'id', foreignField: 'cliente_id', as: 'ev' } },
    { $project: { _id: 1, cliente_id: '$id', ciudad_id: 1,
        n_polizas: { $size: '$pols' },
        n_canceladas: { $size: { $filter: { input: '$pols', cond: { $eq: ['$$this.estado', 'cancelada'] } } } },
        n_resenas: { $size: '$res' },
        calificacion_prom: { $avg: '$res.calificacion' },
        n_eventos: { $size: '$ev' },
        n_chats: { $size: { $filter: { input: '$ev', cond: { $eq: ['$$this.tipo', 'chat_soporte'] } } } } } },
    { $addFields: { cancelo: { $gt: ['$n_canceladas', 0] } } },
    { $merge: { into: 'analisis_cliente', on: '_id', whenMatched: 'replace', whenNotMatched: 'insert' } },
  ]).toArray();
  mostrar('3. Clientes en analisis_cliente', bd.analisis_cliente.countDocuments());

  // 4. Comparación final: clientes que cancelaron vs. los que no (solo clientes con póliza)
  mostrar('4. Experiencia del cliente según haya cancelado o no', bd.analisis_cliente.aggregate([
    { $match: { n_polizas: { $gt: 0 } } },
    { $group: { _id: '$cancelo', clientes: { $sum: 1 }, calificacion_prom: { $avg: '$calificacion_prom' },
        eventos_prom: { $avg: '$n_eventos' }, chats_prom: { $avg: '$n_chats' } } },
    { $project: { _id: 0, cancelo: '$_id', clientes: 1, calificacion_prom: { $round: ['$calificacion_prom', 2] },
        eventos_prom: { $round: ['$eventos_prom', 1] }, chats_prom: { $round: ['$chats_prom', 1] } } },
    { $sort: { cancelo: -1 } },
  ]).toArray());

  // 5. Control con SQL: este número debe coincidir con
  //    SELECT COUNT(DISTINCT cliente_id) FROM seguroya.polizas WHERE estado = 'cancelada';
  mostrar('5. Clientes con alguna póliza cancelada (comparar con SQL)', bd.analisis_cliente.countDocuments({ cancelo: true }));
})();
