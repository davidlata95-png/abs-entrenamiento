// ABS Seco + App del entrenador · registro de cargas, comentarios, deportistas, planes y carga sRPE
// Pega este código en Extensiones → Apps Script de la hoja "ABS Seco · Registro de cargas".
// Para actualizarlo sin cambiar la URL: Implementar → Gestionar implementaciones → lápiz → Versión: nueva versión.

const HOJA = 'Registro';
// Registro:    A Actualizado · B Nadador · C Fecha sesión · D Semana · E Día · F Bloque
//              G Ejercicio · H Serie · I Reps · J Kg · K Hecha · L ID
const HOJA_COM = 'Comentarios';
// Comentarios: A Actualizado · B Nadador · C Fecha sesión · D Semana · E Día · F Ejercicio
//              G Comentario · H ID

function hoja_(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh && nombre === HOJA_COM) {
    sh = ss.insertSheet(HOJA_COM);
    sh.appendRow(['Actualizado', 'Nadador', 'Fecha sesión', 'Semana', 'Día', 'Ejercicio', 'Comentario', 'ID']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function kg_(v) {
  if (v === undefined || v === null || v === '') return '';
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? String(v) : n;
}

function ids_(sh, col) {
  const last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, col, last - 1, 1).getValues().map(r => String(r[0])) : [];
}

// Escribe la fila si el ID ya existe, o la añade al final
function upsert_(sh, ids, id, fila) {
  const i = ids.indexOf(id);
  if (i >= 0) {
    sh.getRange(i + 2, 1, 1, fila.length).setValues([fila]);
  } else {
    sh.appendRow(fila);
    ids.push(id);
  }
}

// La app envía una o varias series o comentarios: {items:[{...}, ...]}
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.a) return json_(api_(data));
    const items = data.items || [data];
    const sh = hoja_(HOJA), shC = hoja_(HOJA_COM);
    const ids = ids_(sh, 12), idsC = ids_(shC, 8);
    const ahora = new Date();
    items.forEach(it => {
      const nombre = String(it.atleta || '').trim();
      if (!nombre) return;
      const id = nombre + '|' + it.id;
      if (it.tipo === 'comentario') {
        upsert_(shC, idsC, id, [ahora, nombre, it.fecha, it.semana, it.dia, it.ejercicio,
                                String(it.comentario || ''), id]);
      } else {
        upsert_(sh, ids, id, [ahora, nombre, it.fecha, it.semana, it.dia, it.bloque, it.ejercicio,
                              it.serie, it.reps, kg_(it.kg), it.ok ? 'Sí' : '', id]);
      }
    });
    return json_({ ok: true, n: items.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// GET ?atleta=Nombre → series y comentarios de ese nadador, para que la app los muestre
function doGet(e) {
  // Vuelta desde Strava tras autorizar la conexión
  if (e.parameter && e.parameter.state && (e.parameter.code || e.parameter.error)) return stravaVuelta_(e.parameter);
  // ?app=1 → código actual de la app (pestaña "App"), para que se actualice sola
  if (e.parameter && e.parameter.app) {
    const shA = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('App');
    const vals = shA.getRange(1, 2, shA.getLastRow(), 1).getValues().map(r => String(r[0]).replace(/^~/, ''));
    return json_({ ok: true, v: vals[0], html: vals.slice(1).join('') });
  }
  const nombre = String((e.parameter && e.parameter.atleta) || '').trim().toLowerCase();
  if (!nombre) return json_({ ok: true, filas: [], comentarios: [] });
  const sin = id => String(id).split('|').slice(1).join('|');
  const leer = (sh, cols) => sh.getLastRow() < 2 ? [] :
    sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues()
      .filter(r => String(r[1]).trim().toLowerCase() === nombre);
  const filas = leer(hoja_(HOJA), 12)
    .map(r => ({ id: sin(r[11]), kg: r[9], ok: r[10] === 'Sí' }));
  const comentarios = leer(hoja_(HOJA_COM), 8)
    .map(r => ({ id: sin(r[7]), texto: String(r[6]) }));
  return json_({ ok: true, filas: filas, comentarios: comentarios });
}

// ===================== App del entrenador (deportistas, planes, biblioteca, carga) =====================
// Datos:  A Tipo · B ID · C Actualizado · D Referencia (deportista) · E… JSON (troceado en celdas de 40.000 caracteres)
// Carga:  A Fecha · B Deportista · C Sesión · D Deporte · E Minutos · F RPE · G sRPE (UA) · H ID
// Config: A1 "Clave entrenador" · B1 huella de la clave

function hojaApp_(nombre, cabecera) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.appendRow(cabecera);
    sh.setFrozenRows(1);
  }
  return sh;
}
const hDatos_ = () => hojaApp_('Datos', ['Tipo', 'ID', 'Actualizado', 'Referencia', 'JSON']);
const TROZO_ = 40000;
const hCarga_ = () => hojaApp_('Carga', ['Fecha', 'Deportista', 'Sesión', 'Deporte', 'Minutos', 'RPE', 'sRPE (UA)', 'ID']);
const hConfig_ = () => hojaApp_('Config', ['Clave entrenador', '']);

function huella_(txt) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'abs|' + txt, Utilities.Charset.UTF_8);
  return b.map(x => ('0' + (x & 255).toString(16)).slice(-2)).join('');
}

function leerDatos_() {
  const sh = hDatos_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const nc = Math.max(5, sh.getLastColumn());
  return sh.getRange(2, 1, n, nc).getValues().map((r, i) => ({ fila: i + 2, tipo: r[0], id: String(r[1]), ref: String(r[3]), json: r.slice(4).join('') }));
}
const doc_ = r => { try { return JSON.parse(r.json); } catch (e) { return null; } };

function guardarDocs_(docs) {
  const sh = hDatos_();
  const filas = leerDatos_();
  const pos = {};
  filas.forEach(r => pos[r.tipo + '|' + r.id] = r.fila);
  const ahora = new Date();
  const nuevas = [];
  docs.forEach(x => {
    const d = x.doc;
    if (!d || !d.id) return;
    const js = JSON.stringify(d), trozos = [];
    for (let i = 0; i < js.length; i += TROZO_) trozos.push(js.slice(i, i + TROZO_));
    const fila = [x.tipo, d.id, ahora, d.dep || (d.grupo ? 'g:' + d.grupo : '')].concat(trozos);
    const p = pos[x.tipo + '|' + d.id];
    if (p) {
      const nc = Math.max(5, sh.getLastColumn());
      while (fila.length < nc) fila.push('');
      sh.getRange(p, 1, 1, fila.length).setValues([fila]);
    } else nuevas.push(fila);
  });
  nuevas.forEach(f => sh.appendRow(f));
}

function borrarDocs_(items) {
  const sh = hDatos_();
  const quitar = {};
  items.forEach(x => quitar[x.tipo + '|' + x.id] = 1);
  const filas = leerDatos_().filter(r => quitar[r.tipo + '|' + r.id]).map(r => r.fila).sort((a, b) => b - a);
  filas.forEach(f => sh.deleteRow(f));
}

function claveOk_(clave) {
  const h = String(hConfig_().getRange('B1').getValue() || '');
  return !!h && h === huella_(String(clave || ''));
}

const normN_ = t => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const pinOk_ = p => /^\d{4}$/.test(String(p || ''));
function docs_(filas, tipo) { return filas.filter(r => r.tipo === tipo).map(doc_).filter(Boolean); }

// Deportista con ese PIN. Si aún no tiene PIN (alta desde un grupo), el primer PIN que escribe queda como suyo.
function deportista_(id, pin, reclamar) {
  const r = leerDatos_().find(x => x.tipo === 'deportista' && x.id === String(id));
  const d = r && doc_(r);
  if (!d) return null;
  if (!d.pin && reclamar && pinOk_(pin)) { d.pin = String(pin); guardarDocs_([{ tipo: 'deportista', doc: d }]); return d; }
  if (!d.pin || String(d.pin) !== String(pin || '')) return null;
  return d;
}

function grupoPorCodigo_(filas, codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  return c ? docs_(filas, 'grupo').find(g => String(g.codigo || '').toUpperCase() === c) : null;
}

function anotarCarga_(reg, dep, ses) {
  const sh = hCarga_();
  const id = reg.id;
  const n = sh.getLastRow() - 1;
  const ids = n > 0 ? sh.getRange(2, 8, n, 1).getValues().map(r => String(r[0])) : [];
  const i = ids.indexOf(id);
  const min = Number(reg.minutos) || 0, rpe = Number(reg.rpe) || 0;
  if (!min || !rpe) { if (i >= 0) sh.deleteRow(i + 2); return; }
  const fila = [reg.fecha || (ses && ses.fecha) || '', dep.nombre, (ses && ses.titulo) || '', (ses && ses.deporte) || '', min, rpe, min * rpe, id];
  if (i >= 0) sh.getRange(i + 2, 1, 1, 8).setValues([fila]);
  else sh.appendRow(fila);
}

// Copia los kilos y comentarios de las sesiones de fuerza en las pestañas Registro y Comentarios
// (mismo formato que usaba ABS Seco, para que el resumen y el tablero sigan funcionando)
function anotarSeries_(reg, dep, ses) {
  if (!ses || ses.deporte !== 'fuerza') return;
  const sh = hoja_(HOJA), shC = hoja_(HOJA_COM);
  const ids = ids_(sh, 12), idsC = ids_(shC, 8);
  const ahora = new Date(), nombre = dep.nombre, fecha = reg.fecha || ses.fecha || '';
  const semana = (ses.plan && ses.plan.semana) || '', dia = ses.diaTxt || '';
  const bl = ses.bloques || [];
  Object.keys(reg.sets || {}).forEach(k => {
    const [bi, ii, n] = k.split('|').map(Number), b = bl[bi], it = b && (b.items || [])[ii];
    if (!it) return;
    const v = reg.sets[k] || {}, id = [nombre, fecha, bi, ii, n].join('|');
    if (!v.kg && !v.ok && ids.indexOf(id) < 0) return;
    const p = String(it.reps || '').split(/\s*[-·]\s*/).filter(Boolean);
    const reps = p.length > 1 ? (p[n] !== undefined ? p[n] : p[p.length - 1]) : (it.reps || '');
    upsert_(sh, ids, id, [ahora, nombre, fecha, semana, dia, b.nombre || '', it.nombre || '', n + 1, reps, kg_(v.kg), v.ok ? 'Sí' : '', id]);
  });
  Object.keys(reg.coment || {}).forEach(k => {
    const [bi, ii] = k.split('|').map(Number), it = bl[bi] && (bl[bi].items || [])[ii];
    if (!it) return;
    const t = String(reg.coment[k] || ''), id = [nombre, fecha, bi, ii, 'c'].join('|');
    if (!t && idsC.indexOf(id) < 0) return;
    upsert_(shC, idsC, id, [ahora, nombre, fecha, semana, dia, it.nombre || '', t, id]);
  });
}

function api_(q) {
  const a = q.a;
  if (a === 'lista') {
    const filas = leerDatos_();
    let deps = docs_(filas, 'deportista').filter(d => !d.archivado);
    let grupo = null;
    if (q.g) {
      const g = grupoPorCodigo_(filas, q.g);
      if (g) { grupo = { id: g.id, nombre: g.nombre }; deps = deps.filter(d => (d.grupos || []).indexOf(g.id) >= 0); }
    }
    deps = deps.map(d => ({ id: d.id, nombre: d.nombre, nuevo: !d.pin }));
    deps.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    return { ok: true, deportistas: deps, grupo, grupoMal: !!q.g && !grupo, entrenador: !!hConfig_().getRange('B1').getValue(), pushApp: props_().getProperty('PUSH_APP') || '', altaOk: q.alta ? altaValida_(q.alta) : undefined };
  }
  // Alta individual con el enlace personal del entrenador (…/?alta=CÓDIGO): la persona crea su perfil y su PIN
  if (a === 'alta') {
    if (!altaValida_(q.alta)) return { ok: false, error: 'enlace' };
    const nombre = String(q.nombre || '').trim().replace(/\s+/g, ' ');
    if (nombre.length < 2) return { ok: false, error: 'nombre' };
    if (!pinOk_(q.pin)) return { ok: false, error: 'pin' };
    const filas = leerDatos_();
    const igual = docs_(filas, 'deportista').filter(d => normN_(d.nombre) === normN_(nombre));
    const yo = igual.find(d => !d.pin);
    if (yo) { yo.pin = String(q.pin); delete yo.archivado; fichaAlta_(yo, q.ficha); guardarDocs_([{ tipo: 'deportista', doc: yo }]); push_(['coach'], 'Nuevo deportista', nombre + ' ha creado su perfil.'); return { ok: true, id: yo.id }; }
    if (igual.length) return { ok: false, error: 'existe' };
    const dps = ['fuerza', 'natacion', 'carrera', 'ciclismo', 'otro'];
    const d = { id: 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), nombre, pin: String(q.pin), grupos: [], deportes: (q.deportes || []).filter(x => dps.indexOf(x) >= 0), notas: '', alta: 'enlace personal' };
    fichaAlta_(d, q.ficha);
    guardarDocs_([{ tipo: 'deportista', doc: d }]);
    push_(['coach'], 'Nuevo deportista', nombre + ' ha creado su perfil. Asígnale su plan.');
    return { ok: true, id: d.id };
  }
  if (a === 'unirse') {
    const filas = leerDatos_();
    const g = grupoPorCodigo_(filas, q.g);
    if (!g) return { ok: false, error: 'grupo' };
    const nombre = String(q.nombre || '').trim().replace(/\s+/g, ' ');
    if (nombre.length < 2) return { ok: false, error: 'nombre' };
    if (!pinOk_(q.pin)) return { ok: false, error: 'pin' };
    const igual = docs_(filas, 'deportista').filter(d => normN_(d.nombre) === normN_(nombre));
    // ya existe con ese nombre: si el PIN coincide (o aún no tiene), se le añade al grupo
    const yo = igual.find(d => !d.pin || String(d.pin) === String(q.pin));
    if (yo) {
      if (!yo.pin) yo.pin = String(q.pin);
      fichaAlta_(yo, q.ficha);
      yo.grupos = [...new Set([...(yo.grupos || []), g.id])];
      delete yo.archivado;
      guardarDocs_([{ tipo: 'deportista', doc: yo }]);
      return { ok: true, id: yo.id };
    }
    if (igual.length) return { ok: false, error: 'existe' };
    const d = { id: 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), nombre, pin: String(q.pin), grupos: [g.id], deportes: g.deportes || [], notas: '', alta: 'enlace' };
    fichaAlta_(d, q.ficha);
    guardarDocs_([{ tipo: 'deportista', doc: d }]);
    push_(['coach'], 'Nuevo en ' + g.nombre, nombre + ' se ha unido al grupo.');
    return { ok: true, id: d.id };
  }
  if (a === 'login' || a === 'registro') {
    const dep = deportista_(q.id, q.pin, a === 'login');
    if (!dep) return { ok: false, error: 'pin' };
    const filas = leerDatos_();
    const refs = {}; refs[dep.id] = 1; (dep.grupos || []).forEach(g => refs['g:' + g] = 1);
    if (a === 'registro') {
      const reg = q.reg;
      reg.dep = dep.id;
      const ses = docs_(filas.filter(r => r.tipo === 'sesion' && (r.id === reg.ses || r.id === reg.id)), 'sesion')[0];
      if (ses && ses.grupo) { reg.ses = ses.id; reg.id = ses.id + '~' + dep.id; }
      const antes = doc_(filas.find(r => r.tipo === 'registro' && r.id === reg.id) || { json: 'null' }) || {};
      guardarDocs_([{ tipo: 'registro', doc: reg }]);
      const nuevos = Object.keys(reg.coment || {}).filter(k => reg.coment[k] && reg.coment[k] !== (antes.coment || {})[k]).map(k => reg.coment[k]);
      if (reg.nota && reg.nota !== antes.nota) nuevos.push(reg.nota);
      if (nuevos.length) push_(['coach'], dep.nombre + ' ha comentado' + (ses ? ' · ' + (ses.titulo || '') : ''), nuevos.join(' · ').slice(0, 180));
      anotarCarga_(reg, dep, ses);
      anotarSeries_(reg, dep, ses);
      return { ok: true };
    }
    let filasA = filas;
    if (stravaTok_(dep.id)) { try { if (stravaSync_(dep.id, 15)) filasA = leerDatos_(); } catch (e) {} }
    const actividades = filasA.filter(r => r.tipo === 'actividad' && r.ref === dep.id).map(doc_).filter(Boolean);
    const sesiones = filas.filter(r => r.tipo === 'sesion' && refs[r.ref]).map(doc_).filter(Boolean);
    const registros = filas.filter(r => r.tipo === 'registro' && r.ref === dep.id).map(doc_).filter(Boolean);
    const usados = {};
    sesiones.forEach(s => (s.bloques || []).forEach(b => (b.items || []).forEach(it => { if (it.ej) usados[it.ej] = 1; })));
    const ejercicios = filas.filter(r => r.tipo === 'ejercicio' && usados[r.id]).map(doc_).filter(Boolean);
    const grupos = docs_(filas, 'grupo').filter(g => (dep.grupos || []).indexOf(g.id) >= 0).map(g => ({ id: g.id, nombre: g.nombre }));
    const { pin, ...pub } = dep;
    const mensajes = filas.filter(r => r.tipo === 'mensaje' && r.ref === dep.id).map(doc_).filter(Boolean);
    const checkins = filas.filter(r => r.tipo === 'checkin' && r.ref === dep.id).map(doc_).filter(Boolean);
    return { ok: true, dep: pub, sesiones, registros, ejercicios, grupos, actividades, mensajes, checkins, strava: stravaEstadoDep_(dep.id), pushApp: props_().getProperty('PUSH_APP') || '' };
  }
  // El deportista guarda sus mensajes al entrenador y su check-in semanal
  if (a === 'depGuardar') {
    const dep = deportista_(q.id, q.pin, false);
    if (!dep) return { ok: false, error: 'pin' };
    const filas = leerDatos_(), docs = [];
    (q.docs || []).forEach(x => {
      if (!x || !x.doc || ['mensaje', 'checkin'].indexOf(x.tipo) < 0) return;
      const d = x.doc; d.dep = dep.id;
      if (x.tipo === 'checkin') d.id = dep.id + '~' + String(d.semana || '').slice(0, 10);
      if (x.tipo === 'mensaje') { d.de = 'dep'; d.id = String(d.id || ''); if (!/^m[\w-]{4,40}$/.test(d.id)) return; }
      const ya = filas.find(r => r.tipo === x.tipo && r.id === d.id);
      if (ya && ya.ref !== dep.id) return;
      docs.push({ tipo: x.tipo, doc: d });
    });
    if (docs.length) guardarDocs_(docs);
    docs.forEach(x => {
      if (x.tipo === 'mensaje') push_(['coach'], 'Mensaje de ' + dep.nombre, String(x.doc.txt || '').slice(0, 180));
      if (x.tipo === 'checkin') { const c = x.doc, mal = (+c.fatiga >= 4) || (+c.molestias >= 4) || (+c.estres >= 4) || (+c.sueno && +c.sueno <= 2); if (mal) push_(['coach'], 'Check-in de ' + dep.nombre, 'Sueño ' + c.sueno + ' · fatiga ' + c.fatiga + ' · molestias ' + c.molestias + ' · estrés ' + c.estres + ' · motivación ' + c.motivacion); }
    });
    return { ok: true, n: docs.length };
  }
  // El deportista conecta o desconecta su Strava, o pide traer lo último
  if (a === 'strava') {
    const dep = deportista_(q.id, q.pin, false);
    if (!dep) return { ok: false, error: 'pin' };
    if (q.op === 'url') return stravaCfg_().id ? { ok: true, url: stravaUrl_(dep.id) } : { ok: false, error: 'sin configurar' };
    if (q.op === 'sync') { stravaSync_(dep.id, 0); return { ok: true, actividades: docs_(leerDatos_().filter(r => r.ref === dep.id), 'actividad'), strava: stravaEstadoDep_(dep.id) }; }
    if (q.op === 'desconectar') { stravaDesconectar_(dep.id); return { ok: true }; }
    return { ok: false, error: 'op' };
  }
  if (a === 'coach') {
    if (q.op === 'crearClave') {
      const c = hConfig_();
      if (c.getRange('B1').getValue()) return { ok: false, error: 'ya existe' };
      if (String(q.clave || '').length < 4) return { ok: false, error: 'corta' };
      c.getRange('B1').setValue(huella_(q.clave));
      return { ok: true };
    }
    if (!claveOk_(q.clave)) return { ok: false, error: 'clave' };
    if (q.op === 'todo') {
      const out = {};
      leerDatos_().forEach(r => { const d = doc_(r); if (d) (out[r.tipo] = out[r.tipo] || []).push(d); });
      return { ok: true, datos: out };
    }
    if (q.op === 'guardar') {
      guardarDocs_(q.docs || []);
      (q.docs || []).filter(x => x.tipo === 'mensaje' && x.doc && x.doc.de === 'coach' && !x.doc.avisado).forEach(x => push_([x.doc.dep], 'Tu entrenador te ha contestado', String(x.doc.txt || '').slice(0, 180)));
      return { ok: true };
    }
    // Avisos al móvil (OneSignal): App ID (público) y clave de la API REST (secreta, en las propiedades del script)
    if (q.op === 'pushConfig') { const p = props_(); p.setProperty('PUSH_APP', String(q.appId || '').trim()); if (q.key) p.setProperty('PUSH_KEY', String(q.key).trim()); return { ok: true, estado: pushEstado_() }; }
    if (q.op === 'pushEstado') return { ok: true, estado: pushEstado_() };
    if (q.op === 'altaCodigo') { let c = props_().getProperty('ALTA_CODE'); if (!c || q.nuevo) { c = Utilities.getUuid().replace(/-/g, '').slice(0, 10); props_().setProperty('ALTA_CODE', c); } return { ok: true, codigo: c }; }
    if (q.op === 'pushPrueba') { const r = push_([String(q.a2 || 'coach')], 'ABS Entrenamiento', 'Aviso de prueba ✓'); return { ok: true, r: r }; }
    if (q.op === 'borrar') { borrarDocs_(q.items || []); return { ok: true }; }
    // Asistente IA: la clave de la API de Anthropic se guarda en las propiedades del script (no en la hoja)
    if (q.op === 'iaGuardarClave') { PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', String(q.key || '').trim()); return { ok: true }; }
    if (q.op === 'iaClave') { return { ok: true, key: PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') || '' }; }
    // Strava: ID y secreto de la app de Strava del entrenador (en las propiedades del script, no en la hoja)
    if (q.op === 'stravaConfig') { const p = PropertiesService.getScriptProperties(); p.setProperty('STRAVA_ID', String(q.id || '').trim()); if (q.secret) p.setProperty('STRAVA_SECRET', String(q.secret).trim()); return { ok: true, estado: stravaEstado_() }; }
    if (q.op === 'stravaEstado') return { ok: true, estado: stravaEstado_() };
    if (q.op === 'stravaUrl') return stravaCfg_().id ? { ok: true, url: stravaUrl_(String(q.dep)) } : { ok: false, error: 'sin configurar' };
    if (q.op === 'stravaSync') { const n = stravaSyncTodos_(q.forzar ? 0 : 15); return { ok: true, nuevas: n, actividad: docs_(leerDatos_(), 'actividad'), estado: stravaEstado_() }; }
    if (q.op === 'stravaDesconectar') { stravaDesconectar_(String(q.dep)); return { ok: true, estado: stravaEstado_() }; }
    if (q.op === 'cambiarClave') { hConfig_().getRange('B1').setValue(huella_(q.nueva)); return { ok: true }; }
    return { ok: false, error: 'op' };
  }
  return { ok: false, error: 'accion' };
}


// ===================== Strava (y Garmin a través de Strava) =====================
// Cada deportista autoriza una vez su cuenta de Strava. Sus tokens se guardan en las propiedades del script
// (nunca en la hoja). Las actividades se guardan resumidas en Datos con tipo "actividad" y se actualizan al entrar.
const URL_API_ = 'https://script.google.com/macros/s/AKfycbyYBd73ePdCyP2pho3jQjm6-5SmCijbgQuyz_87Mxhm6cHz_6yyVoRCx8CIhB5xBrXqEw/exec';
const URL_APP_ = 'https://davidlata95-png.github.io/abs-entrenamiento/';
const props_ = () => PropertiesService.getScriptProperties();
const stravaCfg_ = () => ({ id: props_().getProperty('STRAVA_ID') || '', secret: props_().getProperty('STRAVA_SECRET') || '' });
function firma_(txt) {
  const b = Utilities.computeHmacSha256Signature(String(txt), stravaCfg_().secret || 'abs');
  return Utilities.base64EncodeWebSafe(b).replace(/=+$/, '').slice(0, 20);
}
function stravaUrl_(dep) {
  const c = stravaCfg_();
  return 'https://www.strava.com/oauth/authorize?client_id=' + encodeURIComponent(c.id) + '&response_type=code&approval_prompt=auto'
    + '&scope=' + encodeURIComponent('read,activity:read_all') + '&redirect_uri=' + encodeURIComponent(URL_API_)
    + '&state=' + encodeURIComponent(dep + '.' + firma_(dep));
}
function stravaTok_(dep) { try { return JSON.parse(props_().getProperty('STRAVA_TOK_' + dep) || 'null'); } catch (e) { return null; } }
function stravaGuardarTok_(dep, t) { props_().setProperty('STRAVA_TOK_' + dep, JSON.stringify(t)); }
function stravaPost_(payload) {
  const c = stravaCfg_();
  const r = UrlFetchApp.fetch('https://www.strava.com/oauth/token', { method: 'post', muteHttpExceptions: true, payload: Object.assign({ client_id: c.id, client_secret: c.secret }, payload) });
  const j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() !== 200) throw new Error('Strava ' + r.getResponseCode() + ': ' + (j.message || ''));
  return j;
}
function paginaVuelta_(ok, txt) {
  const url = URL_APP_ + '?strava=' + (ok ? 'ok' : 'error');
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:24px;text-align:center">'
    + '<div style="font-size:40px">' + (ok ? '✅' : '⚠️') + '</div><h2>' + txt + '</h2>'
    + '<a href="' + url + '" target="_top" style="display:inline-block;margin-top:12px;background:#e8742a;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700">Volver a ABS Entrenamiento</a></div>')
    .setTitle('ABS · Strava').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function stravaVuelta_(p) {
  const st = String(p.state || ''), i = st.lastIndexOf('.'), dep = st.slice(0, i);
  if (!dep || st.slice(i + 1) !== firma_(dep)) return paginaVuelta_(false, 'Enlace no válido');
  if (p.error) return paginaVuelta_(false, 'No se ha conectado Strava');
  if (!/activity:read/.test(String(p.scope || ''))) return paginaVuelta_(false, 'Falta permitir «Ver datos de tus actividades»');
  try {
    const j = stravaPost_({ code: p.code, grant_type: 'authorization_code' });
    stravaGuardarTok_(dep, { at: j.access_token, rt: j.refresh_token, exp: j.expires_at, aid: j.athlete && j.athlete.id, nom: j.athlete ? [j.athlete.firstname, j.athlete.lastname].filter(Boolean).join(' ') : '', ult: 0 });
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { stravaSync_(dep, 0); } finally { lock.releaseLock(); }
    return paginaVuelta_(true, 'Strava conectado');
  } catch (e) { return paginaVuelta_(false, 'Error al conectar: ' + e.message); }
}
function stravaAcceso_(dep) {
  const t = stravaTok_(dep);
  if (!t) return null;
  if (t.exp - 120 < Date.now() / 1000) {
    const j = stravaPost_({ grant_type: 'refresh_token', refresh_token: t.rt });
    t.at = j.access_token; t.rt = j.refresh_token; t.exp = j.expires_at; stravaGuardarTok_(dep, t);
  }
  return t;
}
// Trae las actividades nuevas (últimos 60 días la primera vez). minMin: no repetir si se sincronizó hace menos de X minutos.
function stravaSync_(dep, minMin) {
  let t = stravaTok_(dep);
  if (!t || !stravaCfg_().id) return 0;
  const ahora = Date.now() / 1000;
  if (minMin && t.ult && ahora - t.ult < minMin * 60) return 0;
  t = stravaAcceso_(dep);
  const desde = Math.floor(t.ult ? t.ult - 3 * 86400 : ahora - 60 * 86400);
  const docs = [];
  for (let pag = 1; pag <= 5; pag++) {
    const r = UrlFetchApp.fetch('https://www.strava.com/api/v3/athlete/activities?per_page=100&page=' + pag + '&after=' + desde, { headers: { Authorization: 'Bearer ' + t.at }, muteHttpExceptions: true });
    if (r.getResponseCode() === 401) { stravaDesconectar_(dep, true); return 0; }
    if (r.getResponseCode() !== 200) break;
    const lista = JSON.parse(r.getContentText() || '[]');
    lista.forEach(a => docs.push({ tipo: 'actividad', doc: {
      id: 'st' + a.id, sid: String(a.id), dep: dep, fecha: String(a.start_date_local).slice(0, 10), hora: String(a.start_date_local).slice(11, 16),
      tipo: a.sport_type || a.type, nombre: a.name, dist: Math.round(a.distance || 0), mov: a.moving_time || 0, tot: a.elapsed_time || 0,
      desn: Math.round(a.total_elevation_gain || 0), fc: a.average_heartrate || 0, fcmax: a.max_heartrate || 0, w: a.average_watts || 0,
      esfuerzo: a.suffer_score || 0, origen: a.device_name || '' } }));
    if (lista.length < 100) break;
  }
  if (docs.length) guardarDocs_(docs);
  t.ult = Math.floor(ahora); stravaGuardarTok_(dep, t);
  return docs.length;
}
function stravaConectados_() { return props_().getKeys().filter(k => k.indexOf('STRAVA_TOK_') === 0).map(k => k.slice(11)); }
function stravaSyncTodos_(minMin) { let n = 0; stravaConectados_().forEach(d => { try { n += stravaSync_(d, minMin); } catch (e) {} }); return n; }
function stravaDesconectar_(dep, soloLocal) {
  const t = stravaTok_(dep);
  if (t && !soloLocal) { try { UrlFetchApp.fetch('https://www.strava.com/oauth/deauthorize', { method: 'post', muteHttpExceptions: true, payload: { access_token: t.at } }); } catch (e) {} }
  props_().deleteProperty('STRAVA_TOK_' + dep);
}
function stravaEstadoDep_(dep) { const t = stravaTok_(dep); return { configurado: !!stravaCfg_().id, conectado: !!t, nombre: t ? t.nom : '', ult: t ? t.ult : 0 }; }
function stravaEstado_() {
  const c = {}; stravaConectados_().forEach(d => { const t = stravaTok_(d); c[d] = { nombre: t.nom, ult: t.ult }; });
  return { configurado: !!stravaCfg_().id, conSecreto: !!stravaCfg_().secret, id: stravaCfg_().id, dominio: 'script.google.com', conectados: c };
}
// Opcional: ejecútala una vez desde el editor para traer las actividades de todos cada hora, aunque nadie abra la app.
function instalarStravaCadaHora() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sincronizarStrava').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sincronizarStrava').timeBased().everyHours(1).create();
}
function sincronizarStrava() { const lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return; try { stravaSyncTodos_(30); } finally { lock.releaseLock(); } }


// ===================== Avisos al móvil (OneSignal) =====================
// Cada móvil queda asociado a su deportista (external_id = id del deportista; el entrenador = "coach").
function pushEstado_() { return { appId: props_().getProperty('PUSH_APP') || '', conClave: !!props_().getProperty('PUSH_KEY') }; }
function push_(ids, titulo, texto, url) {
  const app = props_().getProperty('PUSH_APP'), key = props_().getProperty('PUSH_KEY');
  ids = (ids || []).filter(Boolean).map(String);
  if (!app || !key || !ids.length) return 'sin configurar';
  try {
    const r = UrlFetchApp.fetch('https://api.onesignal.com/notifications?c=push', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Key ' + key },
      payload: JSON.stringify({ app_id: app, target_channel: 'push', include_aliases: { external_id: ids }, headings: { en: titulo, es: titulo }, contents: { en: texto || ' ', es: texto || ' ' }, url: url || URL_APP_ })
    });
    return r.getResponseCode();
  } catch (e) { return String(e); }
}
// Lo que el deportista escribe al unirse por enlace: objetivo, molestias y días disponibles
function fichaAlta_(d, f) {
  if (!f) return;
  const hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
  if (f.objetivo) d.objetivos = (d.objetivos || []).concat([{ id: 'o' + Date.now().toString(36), tipo: 'principal', titulo: String(f.objetivo).slice(0, 200), fecha: String(f.fechaObj || '').slice(0, 10) }]);
  if (f.lesion) d.lesiones = (d.lesiones || []).concat([{ id: 'l' + Date.now().toString(36), desc: String(f.lesion).slice(0, 300), desde: hoy }]);
  if (Array.isArray(f.dias) && f.dias.length) d.disponibilidad = f.dias.map(Number).filter(n => n >= 1 && n <= 7);
}
// Aviso de cada mañana: qué toca hoy (y los lunes, recordar el check-in). Se instala con instalarAvisos().
function avisosDiarios() {
  const filas = leerDatos_(), hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
  const lunes = Utilities.formatDate(new Date(), 'Europe/Madrid', 'u') === '1';
  const ses = docs_(filas, 'sesion').filter(s => s.fecha === hoy);
  docs_(filas, 'deportista').filter(d => !d.archivado).forEach(d => {
    const mias = ses.filter(s => s.dep === d.id || (s.grupo && (d.grupos || []).indexOf(s.grupo) >= 0));
    if (mias.length) push_([d.id], 'Hoy toca entrenar', mias.map(s => s.titulo || s.deporte).join(' · ') + (lunes ? ' · Rellena tu check-in semanal' : ''));
    else if (lunes) push_([d.id], 'Check-in semanal', 'Cuéntale a tu entrenador cómo llegas a la semana (1 minuto).');
  });
}
function instalarAvisos() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'avisosDiarios').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('avisosDiarios').timeBased().everyDays(1).atHour(8).inTimezone('Europe/Madrid').create();
}

// Enlace personal de alta (…/?alta=CÓDIGO). El código se guarda en las propiedades del script y se puede cambiar.
function altaValida_(c) { const k = props_().getProperty('ALTA_CODE'); return !!k && String(c || '').trim() === k; }
