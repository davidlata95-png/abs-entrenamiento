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
    return { ok: true, deportistas: deps, grupo, grupoMal: !!q.g && !grupo, entrenador: !!hConfig_().getRange('B1').getValue() };
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
      yo.grupos = [...new Set([...(yo.grupos || []), g.id])];
      delete yo.archivado;
      guardarDocs_([{ tipo: 'deportista', doc: yo }]);
      return { ok: true, id: yo.id };
    }
    if (igual.length) return { ok: false, error: 'existe' };
    const d = { id: 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), nombre, pin: String(q.pin), grupos: [g.id], deportes: g.deportes || [], notas: '', alta: 'enlace' };
    guardarDocs_([{ tipo: 'deportista', doc: d }]);
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
      guardarDocs_([{ tipo: 'registro', doc: reg }]);
      anotarCarga_(reg, dep, ses);
      anotarSeries_(reg, dep, ses);
      return { ok: true };
    }
    const sesiones = filas.filter(r => r.tipo === 'sesion' && refs[r.ref]).map(doc_).filter(Boolean);
    const registros = filas.filter(r => r.tipo === 'registro' && r.ref === dep.id).map(doc_).filter(Boolean);
    const usados = {};
    sesiones.forEach(s => (s.bloques || []).forEach(b => (b.items || []).forEach(it => { if (it.ej) usados[it.ej] = 1; })));
    const ejercicios = filas.filter(r => r.tipo === 'ejercicio' && usados[r.id]).map(doc_).filter(Boolean);
    const grupos = docs_(filas, 'grupo').filter(g => (dep.grupos || []).indexOf(g.id) >= 0).map(g => ({ id: g.id, nombre: g.nombre }));
    const { pin, ...pub } = dep;
    return { ok: true, dep: pub, sesiones, registros, ejercicios, grupos };
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
    if (q.op === 'guardar') { guardarDocs_(q.docs || []); return { ok: true }; }
    if (q.op === 'borrar') { borrarDocs_(q.items || []); return { ok: true }; }
    if (q.op === 'cambiarClave') { hConfig_().getRange('B1').setValue(huella_(q.nueva)); return { ok: true }; }
    return { ok: false, error: 'op' };
  }
  return { ok: false, error: 'accion' };
}
