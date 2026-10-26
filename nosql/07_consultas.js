// =====================================================================
// 07_consultas.js · Consultas de lectura (find, operadores, arrays,
// documentos anidados, proyecciones). Cada bloque es independiente:
// se puede correr el archivo completo o copiar un bloque a Compass.
// Uso:  mongosh "<URI con la base seguroya>" --file 07_consultas.js
// =====================================================================
(function () {
  const bd = db.getSiblingDB('seguroya');
  const mostrar = (titulo, resultado) => { print('\n=== ' + titulo); printjson(resultado); };

  // 1. Conteo de documentos por colección
  mostrar('1. Documentos por colección', ['resenas', 'eventos_app', 'detalle_siniestros', 'cotizaciones']
    .map((n) => ({ coleccion: n, documentos: bd.getCollection(n).countDocuments() })));

  // 2. Un documento completo (estructura flexible: cambia según el canal)
  mostrar('2. Ejemplo de reseña', bd.resenas.findOne({ canal: 'encuesta_email' }, { _id: 0 }));

  // 3. Filtro + proyección + orden + límite
  mostrar('3. Cinco reseñas más recientes con calificación ≤ 2',
    bd.resenas.find({ calificacion: { $lte: 2 } },
      { _id: 0, cliente_id: 1, poliza_id: 1, linea: 1, calificacion: 1, comentario: 1, fecha: 1 })
      .sort({ fecha: -1 }).limit(5).toArray());

  // 4. Operadores lógicos y de pertenencia ($and, $or, $in)
  mostrar('4. Reseñas de salud o mascotas con 4 o 5 estrellas (conteo)',
    bd.resenas.countDocuments({ linea: { $in: ['salud', 'mascotas'] }, calificacion: { $gte: 4 } }));
  mostrar('4b. Reseñas negativas por app o whatsapp (conteo)',
    bd.resenas.countDocuments({ $and: [{ calificacion: { $lte: 2 } }, { $or: [{ canal: 'app' }, { canal: 'whatsapp' }] }] }));

  // 5. Arrays: búsqueda por elemento, $all y $size
  mostrar('5. Reseñas etiquetadas con "demora" (conteo)', bd.resenas.countDocuments({ etiquetas: 'demora' }));
  mostrar('5b. Reseñas con las etiquetas "demora" y "atencion" a la vez',
    bd.resenas.countDocuments({ etiquetas: { $all: ['demora', 'atencion'] } }));
  mostrar('5c. Reseñas con dos etiquetas (conteo)', bd.resenas.countDocuments({ etiquetas: { $size: 2 } }));

  // 6. Documentos anidados y existencia de campos (esquema flexible)
  mostrar('6. Reseñas hechas desde la app en iOS (conteo)', bd.resenas.countDocuments({ 'app.plataforma': 'ios' }));
  mostrar('6b. Reseñas con respuesta del equipo (conteo)', bd.resenas.countDocuments({ respuesta: { $exists: true } }));
  mostrar('6c. Promotores NPS (nps ≥ 9, solo encuestas por email)',
    bd.resenas.find({ nps: { $gte: 9 } }, { _id: 0, cliente_id: 1, nps: 1, comentario: 1 }).limit(3).toArray());

  // 7. Búsqueda por patrón
  mostrar('7. Comentarios que mencionan "precio" (conteo)', bd.resenas.countDocuments({ comentario: /precio/i }));

  // 8. Siniestros: campos opcionales según la línea y consultas sobre arrays de documentos
  mostrar('8. Siniestros con peritaje (reclamos grandes de movilidad y hogar)',
    bd.detalle_siniestros.countDocuments({ peritaje: { $exists: true } }));
  mostrar('8b. Siniestros de mascotas que son gatos',
    bd.detalle_siniestros.find({ 'detalle.mascota.especie': 'gato' },
      { _id: 0, siniestro_id: 1, tipo: 1, 'detalle.mascota': 1 }).limit(3).toArray());
  mostrar('8c. Siniestros rechazados por "Fuera de cobertura" (elemento de la bitácora)',
    bd.detalle_siniestros.find({ bitacora: { $elemMatch: { estado: 'rechazado', motivo: 'Fuera de cobertura' } } },
      { _id: 0, siniestro_id: 1, linea: 1, valor_reclamado: 1 }).limit(5).toArray());
  mostrar('8d. Siniestros con más de 5 días de gestión y evidencia en video',
    bd.detalle_siniestros.find({ dias_gestion: { $gt: 5 }, evidencias: { $elemMatch: { tipo: 'video' } } },
      { _id: 0, siniestro_id: 1, dias_gestion: 1 }).sort({ dias_gestion: -1 }).limit(5).toArray());

  // 9. Proyección con $slice: solo el último paso de la bitácora de un siniestro
  const unId = bd.detalle_siniestros.findOne({ estado: 'pagado' }).siniestro_id;
  mostrar('9. Último estado de la bitácora del siniestro ' + unId,
    bd.detalle_siniestros.findOne({ siniestro_id: unId }, { _id: 0, siniestro_id: 1, estado: 1, bitacora: { $slice: -1 } }));

  // 10. Eventos: rangos de fecha, anidados y valores distintos
  mostrar('10. Tipos de evento distintos', bd.eventos_app.distinct('tipo'));
  mostrar('10b. Chats de soporte por motivo "cancelacion" (conteo)',
    bd.eventos_app.countDocuments({ tipo: 'chat_soporte', 'metadata.motivo': 'cancelacion' }));
  mostrar('10c. Eventos de septiembre de 2026 (conteo)',
    bd.eventos_app.countDocuments({ fecha: { $gte: new Date('2026-09-01T00:00:00Z'), $lt: new Date('2026-10-01T00:00:00Z') } }));

  // 11. Cotizaciones: prospectos sin cliente y datos de riesgo anidados
  mostrar('11. Cotizaciones de prospectos sin cliente (conteo)', bd.cotizaciones.countDocuments({ cliente_id: { $exists: false } }));
  mostrar('11b. Cotizaciones de salud para fumadores', bd.cotizaciones.countDocuments({ linea: 'salud', 'datos_riesgo.fumador': true }));
})();
