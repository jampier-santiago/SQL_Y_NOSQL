// =====================================================================
// 09_manipulacion.js · Escritura: insert, update, upsert, bulkWrite,
// delete, validación de esquema e índices.
// La parte de escritura se hace sobre una copia (resenas_demo) creada con
// $out, para no alterar los datos originales. Los índices del final sí se
// crean sobre las colecciones reales (los usa el script 10).
// Uso:  mongosh "<URI con la base seguroya>" --file 09_manipulacion.js
// =====================================================================
(function () {
  const bd = db.getSiblingDB('seguroya');
  const mostrar = (titulo, resultado) => { print('\n=== ' + titulo); printjson(resultado); };

  // 0. Copia de trabajo (se recrea en cada ejecución)
  bd.resenas.aggregate([{ $match: {} }, { $out: 'resenas_demo' }]).toArray();
  const demo = bd.resenas_demo;
  const original = demo.countDocuments();
  mostrar('0. Documentos en la copia de trabajo', original);

  // 1. insertOne e insertMany
  demo.insertOne({ cliente_id: 900001, poliza_id: 900001, linea: 'hogar', producto: 'Hogar Seguro', canal: 'web',
    calificacion: 2, comentario: 'Prueba de inserción', etiquetas: ['cobro'], navegador: 'Chrome',
    fecha: new Date('2026-10-20T10:00:00Z'), prueba: true });
  const ins = demo.insertMany([
    { cliente_id: 900002, poliza_id: 900002, linea: 'salud', producto: 'Salud Individual', canal: 'app', calificacion: 1,
      comentario: 'Prueba de inserción', etiquetas: ['demora', 'atencion'], app: { version: '4.0.2', plataforma: 'ios' },
      fecha: new Date('2026-10-21T09:00:00Z'), prueba: true },
    { cliente_id: 900003, poliza_id: 900003, linea: 'mascotas', producto: 'Mascota Premium', canal: 'whatsapp', calificacion: 5,
      comentario: 'Prueba de inserción', etiquetas: ['rapidez'], agente: 'Paula', fecha: new Date('2026-10-22T15:30:00Z'), prueba: true },
  ]);
  mostrar('1. Documentos tras insertar 3 de prueba', demo.countDocuments());

  // 2. updateOne con $set (agrega un campo anidado)
  mostrar('2. updateOne: responder una reseña', demo.updateOne({ cliente_id: 900001 },
    { $set: { respuesta: { fecha: new Date('2026-10-23T08:00:00Z'), agente: 'Diana Ruiz', texto: 'Gracias por tu comentario.' } } }));

  // 3. updateMany: marcar para seguimiento las reseñas negativas sin respuesta
  mostrar('3. updateMany: requiere_seguimiento', demo.updateMany(
    { calificacion: { $lte: 2 }, respuesta: { $exists: false } }, { $set: { requiere_seguimiento: true } }));

  // 4. Operadores de array: $addToSet y $pull
  mostrar('4. $addToSet "revisar" en reseñas de salud', demo.updateMany({ linea: 'salud' }, { $addToSet: { etiquetas: 'revisar' } }));
  mostrar('4b. $pull "revisar" (revierte lo anterior)', demo.updateMany({ linea: 'salud' }, { $pull: { etiquetas: 'revisar' } }));

  // 5. $inc, $rename, $unset y $currentDate
  mostrar('5. $inc: contador de vistas', demo.updateMany({ prueba: true }, { $inc: { vistas: 1 } }));
  mostrar('5b. $rename: agente → asesor (whatsapp)', demo.updateMany({ canal: 'whatsapp', agente: { $exists: true } }, { $rename: { agente: 'asesor' } }));
  mostrar('5c. $unset + $currentDate', demo.updateMany({ prueba: true }, { $unset: { vistas: '' }, $currentDate: { modificado: true } }));

  // 6. Upsert: actualiza si existe, inserta si no
  mostrar('6. upsert', demo.updateOne({ cliente_id: 900099, poliza_id: 900099 },
    { $set: { calificacion: 5 }, $setOnInsert: { linea: 'hogar', canal: 'web', comentario: 'Creada por upsert', etiquetas: [], fecha: new Date('2026-10-24T12:00:00Z'), prueba: true } },
    { upsert: true }));

  // 7. Update con pipeline de agregación: campo calculado a partir de otro
  demo.updateMany({}, [{ $set: { sentimiento: { $switch: { branches: [
    { case: { $gte: ['$calificacion', 4] }, then: 'positivo' },
    { case: { $eq: ['$calificacion', 3] }, then: 'neutro' }], default: 'negativo' } } } }]);
  mostrar('7. Reseñas por sentimiento (campo calculado)', demo.aggregate([
    { $group: { _id: '$sentimiento', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray());

  // 8. bulkWrite: varias operaciones en una sola llamada
  mostrar('8. bulkWrite', demo.bulkWrite([
    { insertOne: { document: { cliente_id: 900004, poliza_id: 900004, linea: 'movilidad', canal: 'app', calificacion: 3,
        comentario: 'Prueba bulk', etiquetas: [], fecha: new Date('2026-10-24T18:00:00Z'), prueba: true } } },
    { updateOne: { filter: { cliente_id: 900002 }, update: { $set: { calificacion: 2 } } } },
    { deleteOne: { filter: { cliente_id: 900003 } } },
  ], { ordered: true }));

  // 9. Borrado: eliminar los documentos de prueba y comprobar que la copia quedó como al inicio
  mostrar('9. deleteMany de los documentos de prueba', demo.deleteMany({ prueba: true }));
  mostrar('9b. Documentos al final (debe ser igual al inicial)', { inicial: original, final: demo.countDocuments() });

  // 10. Validación de esquema con $jsonSchema: la base rechaza datos inválidos
  bd.runCommand({ collMod: 'resenas_demo', validationLevel: 'moderate', validationAction: 'error',
    validator: { $jsonSchema: { bsonType: 'object', required: ['cliente_id', 'poliza_id', 'calificacion', 'fecha'],
      properties: { calificacion: { bsonType: 'number', minimum: 1, maximum: 5, description: 'entre 1 y 5' } } } } });
  try {
    demo.insertOne({ cliente_id: 1, poliza_id: 1, calificacion: 9, fecha: new Date() });
    print('\n=== 10. Atención: el documento inválido fue aceptado (revisar el validador)');
  } catch (e) {
    print('\n=== 10. Documento con calificacion = 9 rechazado por la validación: ' + e.message);
  }
  demo.insertOne({ cliente_id: 900005, poliza_id: 900005, calificacion: 4, fecha: new Date('2026-10-24T20:00:00Z') });
  demo.deleteOne({ cliente_id: 900005 });
  print('=== 10b. Un documento válido sí se inserta (y se borra de nuevo)');

  // 11. Índices sobre las colecciones reales, con plan antes y después
  const plan = (cursor) => {
    const ex = cursor.explain('executionStats');
    return { etapa: /IXSCAN/.test(JSON.stringify(ex.queryPlanner.winningPlan)) ? 'IXSCAN (usa índice)' : 'COLLSCAN (recorre la colección)',
      docs_examinados: ex.executionStats.totalDocsExamined, docs_devueltos: ex.executionStats.nReturned,
      ms: ex.executionStats.executionTimeMillis };
  };
  const cid = bd.eventos_app.findOne({ tipo: 'login' }).cliente_id;
  try { bd.eventos_app.dropIndex('idx_eventos_cliente_tipo'); } catch (e) { /* no existía */ }
  mostrar('11. Plan SIN índice: eventos de login de un cliente', plan(bd.eventos_app.find({ cliente_id: cid, tipo: 'login' })));
  bd.eventos_app.createIndex({ cliente_id: 1, tipo: 1 }, { name: 'idx_eventos_cliente_tipo' });
  mostrar('11b. Plan CON índice compuesto (cliente_id, tipo)', plan(bd.eventos_app.find({ cliente_id: cid, tipo: 'login' })));

  bd.resenas.createIndex({ linea: 1, calificacion: -1 }, { name: 'idx_resenas_linea_calificacion' });
  bd.resenas.createIndex({ poliza_id: 1 }, { name: 'idx_resenas_poliza' });
  bd.resenas.createIndex({ cliente_id: 1 }, { name: 'idx_resenas_cliente' });
  bd.detalle_siniestros.createIndex({ siniestro_id: 1 }, { unique: true, name: 'uq_detalle_siniestro' });
  bd.resenas.createIndex({ comentario: 'text' }, { name: 'idx_resenas_texto', default_language: 'spanish' });
  mostrar('11c. Índices de resenas', bd.resenas.getIndexes().map((i) => i.name));
  mostrar('11d. Búsqueda de texto: comentarios sobre "demora"', bd.resenas.find({ $text: { $search: 'demora' } },
    { _id: 0, cliente_id: 1, calificacion: 1, comentario: 1 }).limit(3).toArray());
})();
