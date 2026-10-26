// =====================================================================
// 03_detalle_siniestros.js · Genera la colección detalle_siniestros (un documento por siniestro)
// Requiere las colecciones de apoyo importadas desde SQL: stg_polizas, stg_productos, stg_clientes, stg_siniestros
// (ver 00_importar.md). Es seguro volver a ejecutarlo: vacía y recarga
// su colección destino. Los datos son reproducibles (semilla fija).
// Uso:  mongosh "<URI con la base seguroya>" --file 03_detalle_siniestros.js
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

  const CIUDADES = { 1: 'Bogotá', 2: 'Medellín', 3: 'Cali', 4: 'Barranquilla', 5: 'Bucaramanga', 6: 'Cartagena' };
  const DESCRIPCIONES = {
    'colisión': 'Choque con otro vehículo en intersección semaforizada.',
    'robo': 'Hurto del vehículo mientras estaba estacionado.',
    'daño parcial': 'Daños en latonería y pintura por golpe lateral.',
    'atención veterinaria': 'Consulta de urgencia por cuadro gastrointestinal.',
    'cirugía': 'Intervención quirúrgica programada tras valoración.',
    'hospitalización': 'Ingreso hospitalario de varios días.',
    'urgencias': 'Atención por urgencias con observación de pocas horas.',
    'daño por agua': 'Filtración desde el piso superior que afectó techos y muebles.',
    'robo en hogar': 'Ingreso no autorizado al inmueble con pérdida de enseres.',
  };
  const OBS = ['Daños consistentes con lo reportado.', 'Se requiere documentación adicional.', 'Valor ajustado según tabla de referencia.'];

  const polizaPorId = {};
  cargarPolizas().forEach((p) => { polizaPorId[p.id] = p; });
  const ciudadDe = {};
  bd.stg_clientes.find().toArray().forEach((c) => { ciudadDe[Number(c.id)] = CIUDADES[Number(c.ciudad_id)]; });
  const siniestros = bd.stg_siniestros.find().toArray().sort((a, b) => Number(a.id) - Number(b.id));

  const docs = [];
  for (const s of siniestros) {
    const sid = Number(s.id);
    const valor = Number(s.valor_reclamado);
    const pol = polizaPorId[Number(s.poliza_id)];
    const ocurrio = fechaDe(s.fecha_ocurrencia);
    const doc = {
      siniestro_id: sid, poliza_id: pol.id, cliente_id: pol.cliente_id, linea: pol.linea,
      tipo: s.tipo, estado: s.estado, valor_reclamado: valor,
      ocurrencia: { fecha: ocurrio, ciudad: ciudadDe[pol.cliente_id], descripcion: DESCRIPCIONES[s.tipo] || `Siniestro de tipo ${s.tipo}.` },
    };

    // datos propios de cada línea (esquema flexible)
    if (pol.linea === 'movilidad') {
      doc.detalle = { placa: placa(), vehiculo: pick(['Chevrolet Spark', 'Renault Logan', 'Mazda 2', 'Yamaha FZ', 'Kia Picanto'], sid),
                      taller: pick(['Taller Central', 'Autolatas del Norte', 'Motos y Más'], sid),
                      tercero_involucrado: s.tipo === 'colisión' && sid % 2 === 0 };
    } else if (pol.linea === 'mascotas') {
      doc.detalle = { mascota: { nombre: pick(['Luna', 'Max', 'Toby', 'Mía', 'Rocky', 'Nala'], sid),
                                 especie: sid % 3 === 0 ? 'gato' : 'perro',
                                 raza: pick(['Criollo', 'Labrador', 'Beagle', 'Siamés', 'Pug'], sid) },
                      veterinaria: pick(['Vet Salud Animal', 'Clínica Patitas', 'Centro Veterinario Andino'], sid) };
    } else if (pol.linea === 'salud') {
      doc.detalle = { ips: pick(['Clínica del Norte', 'Hospital San Rafael', 'IPS Vida'], sid),
                      diagnostico_cie10: pick(['J18.9', 'K35.8', 'S72.0', 'I10', 'A09'], sid) };
    } else {
      doc.detalle = { direccion: `Calle ${entre(1, 170)} # ${entre(1, 99)}-${entre(1, 99)}`,
                      tipo_dano: s.tipo === 'daño por agua' ? 'agua' : 'hurto' };
    }
    // valoración técnica solo en reclamos de 1 millón o más
    if (valor >= 1000000) {
      if (pol.linea === 'movilidad' || pol.linea === 'hogar') {
        doc.peritaje = { perito: nombrePersona(), fecha: tope(sumarDias(ocurrio, 2 + (sid % 4))),
                         valor_estimado: Math.round(valor * (70 + ((sid * 7) % 31)) / 100), observaciones: pick(OBS, sid) };
      } else if (pol.linea === 'salud') {
        doc.auditoria_medica = { auditor: nombrePersona(), pertinencia: sid % 5 !== 0, observaciones: pick(OBS, sid) };
      } else {
        doc.concepto_veterinario = { veterinario: nombrePersona(), procedimiento_justificado: sid % 6 !== 0 };
      }
    }
    doc.evidencias = [];
    for (let i = 0; i < 1 + (sid % 5); i++) {
      const tipo = pick(['foto', 'foto', 'pdf', 'video'], sid + i);
      doc.evidencias.push({ tipo, archivo: `siniestro_${sid}_${i + 1}.${tipo === 'foto' ? 'jpg' : tipo === 'pdf' ? 'pdf' : 'mp4'}`,
                            tamano_kb: 120 + ((sid * (i + 3) * 37) % 4000) });
    }

    // bitácora coherente con el estado en SQL; más larga cuanto mayor el valor
    const pasos = ['radicado', 'en_revision'];
    for (let i = 0; i < Math.min(4, Math.floor(valor / 1000000)); i++) pasos.push('en_revision');
    if (s.estado === 'aprobado') pasos.push('aprobado');
    if (s.estado === 'pagado') pasos.push('aprobado', 'pagado');
    if (s.estado === 'rechazado') pasos.push('rechazado');
    const salto = 1 + (sid % 3);
    doc.bitacora = pasos.map((estado, i) => {
      const e = { fecha: tope(sumarDias(ocurrio, 1 + i * salto)), estado, usuario: pick(['ana.m', 'jorge.r', 'paula.s', 'luis.c'], sid + i) };
      if (estado === 'rechazado') e.motivo = pick(['Fuera de cobertura', 'Documentación incompleta', 'Póliza en mora'], sid);
      return e;
    });
    doc.dias_gestion = Math.round((doc.bitacora[doc.bitacora.length - 1].fecha - doc.bitacora[0].fecha) / DIA);
    docs.push(doc);
  }
  guardar('detalle_siniestros', docs);
})();
