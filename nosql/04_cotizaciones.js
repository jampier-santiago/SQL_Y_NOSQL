// =====================================================================
// 04_cotizaciones.js · Genera la colección cotizaciones (convertidas y no convertidas)
// Requiere las colecciones de apoyo importadas desde SQL: stg_polizas, stg_productos, stg_clientes
// (ver 00_importar.md). Es seguro volver a ejecutarlo: vacía y recarga
// su colección destino. Los datos son reproducibles (semilla fija).
// Uso:  mongosh "<URI con la base seguroya>" --file 04_cotizaciones.js
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

  function datosRiesgo(linea, producto, n) {
    if (linea === 'movilidad') {
      return { tipo_vehiculo: producto.includes('Moto') ? 'moto' : 'carro', placa: placa(),
               modelo: 2010 + (n % 17), valor_comercial: 20000000 + ((n * 104729) % 80000000) };
    }
    if (linea === 'mascotas') {
      return { especie: n % 3 === 0 ? 'gato' : 'perro', raza: pick(['Criollo', 'Labrador', 'Beagle', 'Siamés', 'Pug'], n),
               edad_meses: 3 + (n % 150) };
    }
    if (linea === 'salud') {
      return { edad: 18 + (n % 50), fumador: n % 7 === 0, preexistencias: n % 4 === 0 ? ['hipertension'] : [] };
    }
    return { tipo_inmueble: n % 3 === 0 ? 'casa' : 'apartamento', estrato: 1 + (n % 6), area_m2: 35 + (n % 120),
             valor_inmueble: 80000000 + ((n * 104729) % 400000000) };
  }

  const polizas = cargarPolizas();
  const productos = bd.stg_productos.find().toArray().sort((a, b) => Number(a.id) - Number(b.id));
  const clientes = bd.stg_clientes.find().toArray().sort((a, b) => Number(a.id) - Number(b.id));
  const docs = [];

  // una cotización convertida por cada póliza real, unos días antes del inicio
  for (const p of polizas) {
    docs.push({
      cliente_id: p.cliente_id, producto_id: p.producto_id, producto: p.producto, linea: p.linea,
      fecha: sumarDias(p.ini, -(1 + (p.id % 10))),
      datos_riesgo: datosRiesgo(p.linea, p.producto, p.id),
      prima_cotizada: p.prima, estado: 'convertida', poliza_id: p.id,
    });
  }
  // 600 cotizaciones que no se convirtieron (algunas de prospectos sin cliente)
  for (let n = 1; n <= 600; n++) {
    const prod = productos[(n * 5) % productos.length];
    const doc = {
      producto_id: Number(prod.id), producto: prod.nombre, linea: prod.linea,
      fecha: entreFechas(new Date('2025-01-01T00:00:00Z'), CORTE),
      datos_riesgo: datosRiesgo(prod.linea, prod.nombre, n + 1000),
      prima_cotizada: Math.round(Number(prod.prima_base) * (90 + ((n * 7) % 41)) / 100),
      estado: n % 2 ? 'abandonada' : 'vencida',
    };
    if (n % 3 !== 0) doc.cliente_id = Number(clientes[(n * 7919) % clientes.length].id);
    else doc.email_prospecto = `prospecto${n}@correo.test`;
    docs.push(doc);
  }
  docs.sort((a, b) => a.fecha - b.fecha);
  docs.forEach((d, i) => { d.numero = `COT-${pad(i + 1, 6)}`; });
  guardar('cotizaciones', docs);
})();
