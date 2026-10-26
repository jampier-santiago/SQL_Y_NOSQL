// =====================================================================
// 08_agregaciones.js · Pipelines de agregación ($group, $unwind, $bucket,
// $cond, $dateToString...). Cada bloque es independiente.
// Uso:  mongosh "<URI con la base seguroya>" --file 08_agregaciones.js
// =====================================================================
(function () {
  const bd = db.getSiblingDB('seguroya');
  const mostrar = (titulo, resultado) => { print('\n=== ' + titulo); printjson(resultado); };

  // 1. Calificación promedio por línea de producto
  mostrar('1. Calificación promedio por línea', bd.resenas.aggregate([
    { $group: { _id: '$linea', resenas: { $sum: 1 }, calificacion_prom: { $avg: '$calificacion' } } },
    { $project: { _id: 0, linea: '$_id', resenas: 1, calificacion_prom: { $round: ['$calificacion_prom', 2] } } },
    { $sort: { calificacion_prom: 1 } },
  ]).toArray());

  // 2. Calificación por canal
  mostrar('2. Calificación promedio por canal', bd.resenas.aggregate([
    { $group: { _id: '$canal', resenas: { $sum: 1 }, calificacion_prom: { $avg: '$calificacion' } } },
    { $project: { _id: 0, canal: '$_id', resenas: 1, calificacion_prom: { $round: ['$calificacion_prom', 2] } } },
    { $sort: { resenas: -1 } },
  ]).toArray());

  // 3. NPS de las encuestas por email: promotores (9-10) menos detractores (0-6)
  mostrar('3. NPS', bd.resenas.aggregate([
    { $match: { nps: { $exists: true } } },
    { $group: { _id: null, total: { $sum: 1 },
        promotores: { $sum: { $cond: [{ $gte: ['$nps', 9] }, 1, 0] } },
        detractores: { $sum: { $cond: [{ $lte: ['$nps', 6] }, 1, 0] } } } },
    { $project: { _id: 0, total: 1, promotores: 1, detractores: 1,
        nps: { $round: [{ $multiply: [100, { $divide: [{ $subtract: ['$promotores', '$detractores'] }, '$total'] }] }, 1] } } },
  ]).toArray());

  // 4. Etiquetas más frecuentes ($unwind sobre un array)
  mostrar('4. Etiquetas más frecuentes', bd.resenas.aggregate([
    { $unwind: '$etiquetas' },
    { $group: { _id: '$etiquetas', menciones: { $sum: 1 }, calificacion_prom: { $avg: '$calificacion' } } },
    { $project: { _id: 0, etiqueta: '$_id', menciones: 1, calificacion_prom: { $round: ['$calificacion_prom', 2] } } },
    { $sort: { menciones: -1 } },
    { $limit: 6 },
  ]).toArray());

  // 5. Eventos por tipo de evento
  mostrar('5. Eventos por tipo', bd.eventos_app.aggregate([
    { $group: { _id: '$tipo', eventos: { $sum: 1 }, clientes: { $addToSet: '$cliente_id' } } },
    { $project: { _id: 0, tipo: '$_id', eventos: 1, clientes_distintos: { $size: '$clientes' } } },
    { $sort: { eventos: -1 } },
  ]).toArray());

  // 6. Serie mensual de chats de soporte ($dateToString)
  mostrar('6. Chats de soporte por mes', bd.eventos_app.aggregate([
    { $match: { tipo: 'chat_soporte' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$fecha' } }, chats: { $sum: 1 }, duracion_prom: { $avg: '$metadata.duracion_min' } } },
    { $project: { _id: 0, mes: '$_id', chats: 1, duracion_prom: { $round: ['$duracion_prom', 1] } } },
    { $sort: { mes: 1 } },
  ]).toArray());

  // 7. Los 5 clientes que más contactaron a soporte
  mostrar('7. Top 5 clientes por chats de soporte', bd.eventos_app.aggregate([
    { $match: { tipo: 'chat_soporte' } },
    { $group: { _id: '$cliente_id', chats: { $sum: 1 } } },
    { $sort: { chats: -1, _id: 1 } },
    { $limit: 5 },
    { $project: { _id: 0, cliente_id: '$_id', chats: 1 } },
  ]).toArray());

  // 8. Gestión de siniestros por estado
  mostrar('8. Días de gestión y valor reclamado por estado', bd.detalle_siniestros.aggregate([
    { $group: { _id: '$estado', siniestros: { $sum: 1 }, dias_gestion_prom: { $avg: '$dias_gestion' }, valor_prom: { $avg: '$valor_reclamado' } } },
    { $project: { _id: 0, estado: '$_id', siniestros: 1, dias_gestion_prom: { $round: ['$dias_gestion_prom', 1] }, valor_prom: { $round: ['$valor_prom', 0] } } },
    { $sort: { siniestros: -1 } },
  ]).toArray());

  // 9. Peritaje: cuánto recorta el perito frente a lo reclamado, por línea
  mostrar('9. Valor estimado por el perito / valor reclamado', bd.detalle_siniestros.aggregate([
    { $match: { peritaje: { $exists: true } } },
    { $project: { linea: 1, ratio: { $divide: ['$peritaje.valor_estimado', '$valor_reclamado'] } } },
    { $group: { _id: '$linea', peritajes: { $sum: 1 }, ratio_prom: { $avg: '$ratio' } } },
    { $project: { _id: 0, linea: '$_id', peritajes: 1, ratio_prom: { $round: ['$ratio_prom', 3] } } },
  ]).toArray());

  // 10. $bucket: siniestros por rango de valor reclamado
  mostrar('10. Siniestros por rango de valor reclamado', bd.detalle_siniestros.aggregate([
    { $bucket: { groupBy: '$valor_reclamado', boundaries: [0, 500000, 1000000, 2000000, 4000000, 10000000],
        default: 'otros', output: { siniestros: { $sum: 1 }, dias_gestion_prom: { $avg: '$dias_gestion' } } } },
  ]).toArray());

  // 11. Conversión de cotizaciones por línea ($cond dentro de $sum)
  mostrar('11. Tasa de conversión de cotizaciones por línea', bd.cotizaciones.aggregate([
    { $group: { _id: '$linea', cotizaciones: { $sum: 1 },
        convertidas: { $sum: { $cond: [{ $eq: ['$estado', 'convertida'] }, 1, 0] } } } },
    { $project: { _id: 0, linea: '$_id', cotizaciones: 1, convertidas: 1,
        conversion_pct: { $round: [{ $multiply: [100, { $divide: ['$convertidas', '$cotizaciones'] }] }, 1] } } },
    { $sort: { conversion_pct: -1 } },
  ]).toArray());
})();
