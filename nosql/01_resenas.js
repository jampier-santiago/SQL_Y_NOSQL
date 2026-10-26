// =====================================================================
// 01_resenas.js · Genera la colección resenas (reseñas de clientes por póliza)
// Requiere las colecciones de apoyo importadas desde SQL: stg_polizas, stg_productos, stg_siniestros
// (ver 00_importar.md). Es seguro volver a ejecutarlo: vacía y recarga
// su colección destino. Los datos son reproducibles (semilla fija).
// Uso:  mongosh "<URI con la base seguroya>" --file 01_resenas.js
//       o pegar el contenido en la pestaña _MONGOSH de Compass.
// =====================================================================
(function () {
  // ---------- utilidades comunes (mismo bloque en los scripts 01 a 04) ----------
  const bd = db.getSiblingDB('seguroya');
  const DIA = 86400000;
  const CORTE = new Date('2026-10-01T00:00:00Z');  // mismo corte que el SQL
  const HOY = new Date('2026-10-25T23:59:59Z');    // tope para fechas generadas
  let semilla = 20261025;                          // semilla fija: corridas reproducibles
  function rnd() {
    semilla = (semilla + 0x6D2B79F5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pick = (arr, n) => arr[Math.abs(n) % arr.length];          // elección determinista por id
  const pad = (n, w) => String(n).padStart(w, '0');
  const fechaDe = (v) => (v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00Z'));
  const sumarDias = (d, n) => new Date(d.getTime() + n * DIA);
  const tope = (d, max = HOY) => (d > max ? max : d);
  const entreFechas = (a, b) => new Date(a.getTime() + rnd() * (b.getTime() - a.getTime()));
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(rnd() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
  const nombrePersona = () => elegir(['Carlos', 'María', 'Jorge', 'Paula', 'Luis', 'Diana', 'Andrés', 'Marcela', 'Hernán', 'Natalia'])
    + ' ' + elegir(['Pérez', 'Gómez', 'Rincón', 'Salazar', 'Mejía', 'Cárdenas', 'Ortiz', 'Quintero', 'Bermúdez', 'Ruiz']);
  const placa = () => elegir(['A', 'B', 'C', 'D', 'F', 'G', 'H', 'K', 'N', 'T', 'Z']) + elegir(['B', 'D', 'M', 'P', 'S', 'X'])
    + elegir(['A', 'E', 'L', 'R', 'U']) + pad(entre(0, 999), 3);

  // Lee stg_productos y stg_polizas y devuelve las pólizas ya normalizadas
  function cargarPolizas() {
    const prod = {};
    bd.stg_productos.find().toArray().forEach((p) => { prod[Number(p.id)] = p; });
    return bd.stg_polizas.find().toArray().map((p) => {
      const pr = prod[Number(p.producto_id)];
      const ini = fechaDe(p.fecha_inicio);
      return {
        id: Number(p.id), cliente_id: Number(p.cliente_id), producto_id: Number(p.producto_id),
        producto: pr.nombre, linea: pr.linea, ini, estado: p.estado, prima: Number(p.prima_mensual),
        cancelacion: p.estado === 'cancelada'
          ? (p.fecha_cancelacion ? fechaDe(p.fecha_cancelacion) : sumarDias(ini, 90)) : null,
      };
    }).sort((a, b) => a.id - b.id);
  }

  // Vacía la colección destino y la llena por lotes
  function guardar(nombre, docs) {
    const col = bd.getCollection(nombre);
    col.deleteMany({});
    for (let i = 0; i < docs.length; i += 1000) col.insertMany(docs.slice(i, i + 1000));
    print(`${nombre}: ${docs.length} documentos insertados`);
  }

  const COMENTARIOS = {
    positivo: [
      'Muy buena atención, resolvieron mi solicitud el mismo día.',
      'La app es clara y el proceso fue rápido.',
      'Me explicaron bien la cobertura, lo recomiendo.',
      'Excelente servicio, el pago del siniestro fue ágil.',
    ],
    neutro: [
      'El servicio cumple, aunque podría ser más ágil.',
      'Todo bien, pero la app a veces se demora en cargar.',
      'Buena cobertura, el precio es regular.',
    ],
    negativo: [
      'Cobraron un valor distinto al cotizado.',
      'Muy demorada la respuesta cuando reporté el siniestro.',
      'La cobertura no era lo que me explicaron al comprar.',
      'Tuve que llamar varias veces y nadie me daba solución.',
      'El precio subió y no me avisaron.',
    ],
  };
  const ETIQUETAS = {
    positivo: ['atencion', 'rapidez', 'precio', 'app', 'claridad'],
    neutro: ['precio', 'app', 'cobertura'],
    negativo: ['demora', 'cobro', 'cobertura', 'atencion', 'precio'],
  };
  const NPS = { 1: [0, 1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9, 10] };
  const subconjunto = (arr, min, max) => {
    const copia = arr.slice();
    const n = entre(min, Math.min(max, copia.length));
    const res = [];
    for (let i = 0; i < n; i++) res.push(copia.splice(Math.floor(rnd() * copia.length), 1)[0]);
    return res;
  };

  const polizas = cargarPolizas();
  const sinPorPoliza = {};
  bd.stg_siniestros.find().toArray().forEach((s) => {
    const k = Number(s.poliza_id);
    (sinPorPoliza[k] = sinPorPoliza[k] || []).push(s);
  });

  const docs = [];
  for (const p of polizas) {
    const cancelada = p.estado === 'cancelada';
    // casi todas las canceladas dejaron reseña; solo la mitad del resto
    if (rnd() >= (cancelada ? 0.9 : 0.5)) continue;

    let cal = cancelada ? elegir([1, 1, 2, 2, 3]) : elegir([5, 5, 5, 4, 4, 4, 4, 3, 3, 2]);
    if ((sinPorPoliza[p.id] || []).some((s) => s.estado === 'rechazado')) cal = Math.max(1, cal - 1);

    let fecha = cancelada
      ? sumarDias(p.cancelacion, -(1 + (p.id % 20)))
      : entreFechas(tope(sumarDias(p.ini, 30), sumarDias(HOY, -1)), HOY);
    if (fecha > HOY) fecha = sumarDias(HOY, -(p.id % 10));
    if (fecha <= p.ini) fecha = sumarDias(p.ini, 1);

    const sent = cal >= 4 ? 'positivo' : cal === 3 ? 'neutro' : 'negativo';
    const canal = elegir(['app', 'app', 'web', 'encuesta_email', 'whatsapp']);
    const doc = {
      cliente_id: p.cliente_id,
      poliza_id: p.id,
      linea: p.linea,
      producto: p.producto,
      canal,
      calificacion: cal,
      comentario: elegir(COMENTARIOS[sent]),
      etiquetas: subconjunto(ETIQUETAS[sent], 1, 2),
      fecha,
    };
    // campos propios de cada canal (esquema flexible)
    if (canal === 'app') doc.app = { version: elegir(['3.8.1', '3.9.0', '4.0.2']), plataforma: elegir(['android', 'ios']) };
    if (canal === 'web') doc.navegador = elegir(['Chrome', 'Safari', 'Firefox', 'Edge']);
    if (canal === 'encuesta_email') doc.nps = elegir(NPS[cal]);
    if (canal === 'whatsapp') doc.agente = nombrePersona().split(' ')[0];
    // solo algunas reseñas negativas tienen respuesta
    if (sent === 'negativo' && rnd() < 0.7) {
      doc.respuesta = {
        fecha: sumarDias(fecha, 1 + (p.id % 3)),
        agente: nombrePersona(),
        texto: 'Lamentamos lo ocurrido. Un asesor se comunicará contigo para ayudarte.',
      };
    }
    docs.push(doc);
  }
  guardar('resenas', docs);
})();
