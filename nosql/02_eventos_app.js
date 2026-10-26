// =====================================================================
// 02_eventos_app.js · Genera la colección eventos_app (actividad de los clientes en la app)
// Requiere las colecciones de apoyo importadas desde SQL: stg_polizas, stg_productos, stg_siniestros
// (ver 00_importar.md). Es seguro volver a ejecutarlo: vacía y recarga
// su colección destino. Los datos son reproducibles (semilla fija).
// Uso:  mongosh "<URI con la base seguroya>" --file 02_eventos_app.js
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

  const polizas = cargarPolizas();
  const porCliente = new Map();
  const polizaPorId = {};
  const cancelados = new Set();
  for (const p of polizas) {
    if (!porCliente.has(p.cliente_id)) porCliente.set(p.cliente_id, []);
    porCliente.get(p.cliente_id).push(p);
    polizaPorId[p.id] = p;
    if (p.estado === 'cancelada') cancelados.add(p.cliente_id);
  }

  const docs = [];
  for (const [clienteId, pols] of porCliente) {
    const cancelado = cancelados.has(clienteId);
    const desde = pols.reduce((m, p) => (p.ini < m ? p.ini : m), pols[0].ini);
    let hasta = HOY;
    if (cancelado) for (const p of pols) if (p.cancelacion && p.cancelacion < hasta) hasta = p.cancelacion;
    // quien cancela usa menos la app y contacta más a soporte
    const n = cancelado ? 8 + (clienteId % 8) : 25 + (clienteId % 20);
    const pesoChat = cancelado ? 30 : 8;
    const motivos = cancelado ? ['cancelacion', 'cobro', 'cancelacion', 'cobertura']
                              : ['cobro', 'cobertura', 'siniestro', 'datos'];
    for (let i = 0; i < n; i++) {
      const fecha = entreFechas(desde, hasta);
      const r = entre(0, 99);
      const pol = pick(pols, i);
      let tipo, metadata;
      if (r < pesoChat) {
        tipo = 'chat_soporte';
        metadata = { motivo: pick(motivos, i + clienteId), duracion_min: entre(2, 30) };
      } else if (r < 55) {
        tipo = 'login';
        metadata = { metodo: pick(['password', 'biometria', 'otp'], i + clienteId) };
      } else if (r < 75) {
        tipo = 'consultar_poliza';
        metadata = { poliza_id: pol.id };
      } else if (r < 90) {
        tipo = 'pagar';
        metadata = { poliza_id: pol.id, metodo: pick(['tarjeta', 'pse', 'efectivo'], i + clienteId), valor: pol.prima };
      } else {
        tipo = 'cotizar';
        metadata = { linea: pick(['movilidad', 'mascotas', 'salud', 'hogar'], i + clienteId) };
      }
      docs.push({
        cliente_id: clienteId, tipo, fecha, sesion_id: uuid(),
        plataforma: pick(['android', 'ios', 'web'], clienteId + i), metadata,
      });
    }
  }
  // cada siniestro real tiene su evento de reporte en la app
  bd.stg_siniestros.find().toArray().forEach((s) => {
    const sid = Number(s.id);
    const pol = polizaPorId[Number(s.poliza_id)];
    docs.push({
      cliente_id: pol.cliente_id, tipo: 'reportar_siniestro',
      fecha: tope(sumarDias(fechaDe(s.fecha_ocurrencia), sid % 3)),
      sesion_id: uuid(), plataforma: pick(['android', 'ios', 'web'], sid),
      metadata: { poliza_id: pol.id, siniestro_id: sid, tipo_siniestro: s.tipo },
    });
  });
  docs.sort((a, b) => a.fecha - b.fecha);
  guardar('eventos_app', docs);
})();
