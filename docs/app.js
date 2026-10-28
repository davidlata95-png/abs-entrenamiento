/* ABS Entrenamiento · app de entrenador y deportistas
   Datos en la hoja de Google del entrenador a través de Apps Script (ver Codigo.gs). */
'use strict';
const API = window.ABS_API || '';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

/* ---------- Fechas (semana de lunes a domingo, hora local) ---------- */
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const fmtD = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const fmtLong = d => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/* ---------- Deportes ---------- */
const DEP = {
  fuerza: { n: 'Fuerza', c: 'var(--s-fuerza)' },
  natacion: { n: 'Natación', c: 'var(--s-natacion)' },
  carrera: { n: 'Carrera', c: 'var(--s-carrera)' },
  otro: { n: 'Otro', c: 'var(--s-otro)' },
};
const CATS = {
  fuerza: ['Movilidad', 'Activación', 'Pliometría y lanzamientos', 'Derivados olímpicos', 'Dominante de cadera', 'Dominante de rodilla', 'Empuje', 'Tracción', 'Core', 'Prevención de hombro', 'Accesorios'],
  natacion: ['Calentamiento', 'Técnica', 'Parte principal', 'Velocidad', 'Vuelta a la calma'],
  carrera: ['Calentamiento', 'Técnica de carrera', 'Rodaje', 'Series', 'Tempo', 'Cuestas', 'Vuelta a la calma'],
  otro: ['General'],
};
const RPE_TXT = ['Reposo', 'Muy, muy fácil', 'Fácil', 'Moderado', 'Algo duro', 'Duro', 'Duro', 'Muy duro', 'Muy duro', 'Muy duro', 'Máximo'];

/* ---------- Estado ---------- */
const S = {
  auth: LS.get('abs2-auth', null), // {modo:'coach', clave} | {modo:'dep', id, pin, nombre}
  datos: { deportista: [], ejercicio: [], sesion: [], plan: [], registro: [] },
  lista: null, tab: null, ui: {}, guardando: 0,
};
const D = S.datos;
const byId = (t, id) => D[t].find(x => x.id === id);

/* ---------- API ---------- */
async function api(body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  return r.json();
}
function toast(t, ms = 2200) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => el.hidden = true, ms);
}
// Guardado del entrenador: cola con reintento
let colaG = LS.get('abs2-cola', []);
async function guardar(docs) {
  docs.forEach(x => {
    const lista = D[x.tipo]; const i = lista.findIndex(d => d.id === x.doc.id);
    if (i >= 0) lista[i] = x.doc; else lista.push(x.doc);
  });
  colaG.push({ op: 'guardar', docs }); LS.set('abs2-cola', colaG); vaciarCola();
}
async function borrar(items) {
  items.forEach(x => { D[x.tipo] = D[x.tipo].filter(d => d.id !== x.id); });
  colaG.push({ op: 'borrar', items }); LS.set('abs2-cola', colaG); vaciarCola();
}
let vaciando = false;
async function vaciarCola() {
  if (vaciando || !colaG.length || S.auth?.modo !== 'coach') return;
  vaciando = true; setSync('Guardando…');
  try {
    while (colaG.length) {
      const j = await api({ a: 'coach', clave: S.auth.clave, ...colaG[0] });
      if (!j.ok) throw new Error(j.error);
      colaG.shift(); LS.set('abs2-cola', colaG);
    }
    setSync('Guardado ✓');
  } catch (e) { setSync('Sin conexión: se guardará al volver la red'); }
  vaciando = false;
}
function setSync(t) { S.ui.sync = t; const el = $('#sync'); if (el) el.textContent = t; }
window.addEventListener('online', () => { vaciarCola(); enviarRegs(); });

/* ---------- Instalar en el móvil ---------- */
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; document.querySelectorAll('[data-inst]').forEach(x => x.hidden = false); });
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function bannerInstalar() {
  if (instalada() || LS.get('abs2-noinst', false)) return '';
  const visible = promptInstalar || esIOS();
  return `<div class="card row" data-inst ${visible ? '' : 'hidden'}><img src="icon-192.png" alt="" width="40" height="40" style="border-radius:10px"><div class="grow"><b>Instala la app en tu móvil</b><div class="small muted">Se abre a pantalla completa desde un icono, como cualquier app.</div></div><button class="btn sm pri" id="inst">Instalar</button><button class="icon" id="noinst" aria-label="No mostrar más">✕</button></div>`;
}
function enlazarInstalar() {
  const b = $('#inst'); if (!b) return;
  b.onclick = async () => {
    if (promptInstalar) { promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; document.querySelectorAll('[data-inst]').forEach(x => x.hidden = true); return; }
    abrirEd('Instalar en iPhone', `<div class="card list"><p><b>1.</b> Abre esta página en <b>Safari</b>.</p><p><b>2.</b> Pulsa el botón <b>Compartir</b> (el cuadrado con una flecha hacia arriba, abajo en el centro).</p><p><b>3.</b> Baja y elige <b>Añadir a pantalla de inicio</b>.</p><p><b>4.</b> Pulsa <b>Añadir</b>. Aparecerá el icono ABS en tu pantalla.</p></div>`, () => {}, 'Entendido');
  };
  $('#noinst').onclick = () => { LS.set('abs2-noinst', true); document.querySelectorAll('[data-inst]').forEach(x => x.remove()); };
}

/* ---------- Arranque ---------- */
async function iniciar() {
  if (S.auth?.modo === 'coach') return entrarCoach(S.auth.clave, true);
  if (S.auth?.modo === 'dep') return entrarDep(S.auth.id, S.auth.pin, true);
  pantallaAcceso();
}
async function cargarLista() {
  try { const j = await api({ a: 'lista' }); if (j.ok) { S.lista = j; LS.set('abs2-lista', j); } }
  catch (e) { S.lista = LS.get('abs2-lista', null); }
}
function salir() { LS.del('abs2-auth'); LS.del('abs2-cache'); S.auth = null; location.reload(); }

/* ---------- Pantalla de acceso ---------- */
async function pantallaAcceso(modo = 'dep') {
  document.body.innerHTML = `<main class="narrow"><div class="login"><div class="row"><div class="logo">ABS</div><div><b>ABS Entrenamiento</b><div class="small muted">Plan, registro y carga</div></div></div><div id="lg" class="card">Conectando con la hoja del entrenador…</div><div id="instL"></div></div></main>`;
  if (!$('#ed')) document.body.insertAdjacentHTML('beforeend', dialogs()), setupDialogs();
  $('#instL').innerHTML = bannerInstalar(); enlazarInstalar();
  if (!S.lista) await cargarLista();
  const L = S.lista || { deportistas: [], entrenador: true };
  const box = $('#lg');
  if (modo === 'coach') {
    const nueva = !L.entrenador;
    box.innerHTML = `<h2>${nueva ? 'Crea tu clave de entrenador' : 'Entrenador'}</h2><p class="muted small">${nueva ? 'La usarás para entrar a gestionar deportistas, planes y carga. Mínimo 4 caracteres.' : 'Escribe tu clave.'}</p>
      <form id="fc" class="list"><input class="f" id="cl" type="password" autocomplete="current-password" placeholder="Clave" required minlength="4">${nueva ? '<input class="f" id="cl2" type="password" placeholder="Repite la clave" required>' : ''}
      <button class="btn pri">${nueva ? 'Crear y entrar' : 'Entrar'}</button><p id="err" class="small" style="color:var(--bad)"></p></form>
      <button class="btn ghost sm" id="vd">← Soy deportista</button>`;
    $('#vd').onclick = () => pantallaAcceso('dep');
    $('#fc').onsubmit = async e => {
      e.preventDefault(); const c = $('#cl').value;
      if (nueva && c !== $('#cl2').value) return $('#err').textContent = 'Las claves no coinciden.';
      if (nueva) { const j = await api({ a: 'coach', op: 'crearClave', clave: c }); if (!j.ok) return $('#err').textContent = 'No se pudo crear la clave.'; }
      entrarCoach(c);
    };
    return;
  }
  const deps = L.deportistas || [];
  box.innerHTML = `<h2>¿Quién eres?</h2>
    <form id="fd" class="list"><select class="f" id="dp" required><option value="">Elige tu nombre</option>${deps.map(d => `<option value="${esc(d.id)}">${esc(d.nombre)}</option>`).join('')}</select>
    <label class="l">PIN (4 cifras)<input class="f mono" id="pn" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="one-time-code" required></label>
    <button class="btn pri">Entrar</button><p id="err" class="small" style="color:var(--bad)"></p></form>
    ${deps.length ? '' : '<p class="muted small">Todavía no hay deportistas. Tu entrenador tiene que darte de alta.</p>'}
    <button class="btn ghost sm" id="vc">Soy el entrenador →</button>`;
  $('#vc').onclick = () => pantallaAcceso('coach');
  $('#fd').onsubmit = e => { e.preventDefault(); entrarDep($('#dp').value, $('#pn').value); };
}

/* ======================================================================
   MODO ENTRENADOR
   ====================================================================== */
async function entrarCoach(clave, silencioso) {
  const cache = LS.get('abs2-cache', null);
  if (silencioso && cache?.modo === 'coach') { Object.assign(D, cache.datos); marcoCoach(); }
  try {
    const j = await api({ a: 'coach', op: 'todo', clave });
    if (!j.ok) { if (j.error === 'clave') { LS.del('abs2-auth'); return silencioso ? pantallaAcceso('coach') : ($('#err').textContent = 'Clave incorrecta.'); } throw 0; }
    S.auth = { modo: 'coach', clave }; LS.set('abs2-auth', S.auth);
    for (const t of Object.keys(D)) D[t] = j.datos[t] || [];
    // aplica lo que quedó pendiente en la cola
    colaG.forEach(c => c.op === 'guardar' ? c.docs.forEach(x => { const l = D[x.tipo]; const i = l.findIndex(d => d.id === x.doc.id); if (i >= 0) l[i] = x.doc; else l.push(x.doc); }) : c.items.forEach(x => D[x.tipo] = D[x.tipo].filter(d => d.id !== x.id)));
    LS.set('abs2-cache', { modo: 'coach', datos: D });
    marcoCoach(); vaciarCola();
  } catch (e) {
    if (cache?.modo === 'coach') { Object.assign(D, cache.datos); marcoCoach(); setSync('Sin conexión: trabajando con la última copia'); }
    else if (!silencioso) $('#err').textContent = 'No hay conexión con la hoja.';
  }
}
const TABS_C = [['dep', 'Deportistas'], ['cal', 'Calendario'], ['planes', 'Planes'], ['bib', 'Biblioteca'], ['carga', 'Carga']];
function marcoCoach() {
  S.tab = S.tab || LS.get('abs2-tab', 'dep');
  document.body.innerHTML = `<header class="hero"><div class="top"><div class="logo">ABS</div><div class="who"><b>Entrenador</b><span id="sync">${esc(S.ui.sync || '')}</span></div><button class="out" id="out">Salir</button></div>
    <nav class="tabs" role="tablist">${TABS_C.map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${S.tab === k}">${n}</button>`).join('')}</nav></header><main id="main"></main>${dialogs()}`;
  $('#out').onclick = salir;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; LS.set('abs2-tab', S.tab); marcoCoach(); });
  setupDialogs();
  renderCoach();
}
function renderCoach() {
  LS.set('abs2-cache', { modo: 'coach', datos: D });
  const m = $('#main');
  ({ dep: vDeportistas, cal: vCalendario, planes: vPlanes, bib: vBiblioteca, carga: vCarga })[S.tab](m);
}

/* ---------- Deportistas ---------- */
function vDeportistas(m) {
  const deps = D.deportista.filter(d => !d.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const arch = D.deportista.filter(d => d.archivado);
  m.innerHTML = `<div class="row"><h2 class="grow">Deportistas</h2><button class="btn pri" id="nd">+ Nuevo deportista</button></div>
    ${deps.length ? `<div class="list">${deps.map(d => `<button class="item" data-d="${d.id}"><div class="avatar">${esc(ini(d.nombre))}</div><div class="t"><b>${esc(d.nombre)}</b><small>${esc([d.grupo, (d.deportes || []).map(x => DEP[x]?.n).join(' · ')].filter(Boolean).join(' · '))}</small></div><span class="chip mono">PIN ${esc(d.pin)}</span></button>`).join('')}</div>` : '<div class="empty">Aún no hay deportistas. Crea el primero para asignarle sesiones o un plan.</div>'}
    ${arch.length ? `<details><summary class="muted small">Archivados (${arch.length})</summary><div class="list" style="margin-top:8px">${arch.map(d => `<button class="item" data-d="${d.id}"><div class="avatar">${esc(ini(d.nombre))}</div><div class="t"><b>${esc(d.nombre)}</b></div></button>`).join('')}</div></details>` : ''}`;
  $('#nd').onclick = () => editDeportista();
  m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => editDeportista(byId('deportista', b.dataset.d)));
}
const ini = n => String(n).trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
function editDeportista(d) {
  const nuevo = !d;
  d = d ? clone(d) : { id: uid(), nombre: '', pin: String(Math.floor(1000 + Math.random() * 9000)), deportes: [], grupo: '', notas: '' };
  abrirEd(nuevo ? 'Nuevo deportista' : d.nombre, `
    <div class="card list">
      <label class="l">Nombre y apellido<input class="f" id="dn" value="${esc(d.nombre)}" required></label>
      <div class="grid2"><label class="l">PIN de acceso (4 cifras)<input class="f mono" id="dpn" value="${esc(d.pin)}" inputmode="numeric" maxlength="4"></label>
      <label class="l">Grupo<input class="f" id="dg" value="${esc(d.grupo || '')}" placeholder="p. ej. ABS, Infantil, Bomberos" list="grupos"></label></div>
      <datalist id="grupos">${[...new Set(D.deportista.map(x => x.grupo).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <div class="l">Deportes<div class="chips">${Object.entries(DEP).map(([k, v]) => `<button type="button" class="chip" data-dp="${k}" aria-pressed="${(d.deportes || []).includes(k)}"><i style="--c:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
      <label class="l">Notas<textarea class="f" id="dno">${esc(d.notas || '')}</textarea></label>
    </div>
    ${nuevo ? '' : `<div class="row"><button class="btn danger" id="arc">${d.archivado ? 'Recuperar' : 'Archivar'}</button><button class="btn danger" id="del">Borrar deportista y sus sesiones</button></div>`}`,
    () => {
      d.nombre = $('#dn').value.trim(); d.pin = $('#dpn').value.trim(); d.grupo = $('#dg').value.trim(); d.notas = $('#dno').value;
      if (!d.nombre) return toast('Falta el nombre'), false;
      if (!/^\d{4}$/.test(d.pin)) return toast('El PIN debe tener 4 cifras'), false;
      guardar([{ tipo: 'deportista', doc: d }]); renderCoach();
    });
  document.querySelectorAll('[data-dp]').forEach(b => b.onclick = () => { const k = b.dataset.dp; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); d.deportes = on ? [...new Set([...(d.deportes || []), k])] : d.deportes.filter(x => x !== k); });
  if (!nuevo) {
    $('#arc').onclick = () => { d.archivado = !d.archivado; guardar([{ tipo: 'deportista', doc: d }]); cerrarEd(); renderCoach(); };
    $('#del').onclick = () => {
      if (!confirm(`¿Borrar a ${d.nombre} y todas sus sesiones y registros? No se puede deshacer.`)) return;
      const items = [{ tipo: 'deportista', id: d.id }, ...D.sesion.filter(s => s.dep === d.id).map(s => ({ tipo: 'sesion', id: s.id })), ...D.registro.filter(r => r.dep === d.id).map(r => ({ tipo: 'registro', id: r.id }))];
      borrar(items); cerrarEd(); renderCoach();
    };
  }
}

/* ---------- Calendario ---------- */
function selDep(id) {
  const deps = D.deportista.filter(d => !d.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return `<select class="f" id="${id}" style="max-width:280px">${deps.map(d => `<option value="${d.id}" ${d.id === S.ui.dep ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>`;
}
function vCalendario(m) {
  const deps = D.deportista.filter(d => !d.archivado);
  if (!deps.length) { m.innerHTML = '<div class="empty">Primero crea un deportista en la pestaña Deportistas.</div>'; return; }
  if (!S.ui.dep || !byId('deportista', S.ui.dep)) S.ui.dep = deps[0].id;
  S.ui.semana = S.ui.semana || key(monday(new Date()));
  const lun = parseKey(S.ui.semana), dep = byId('deportista', S.ui.dep);
  const ses = D.sesion.filter(s => s.dep === dep.id);
  const fin = addDays(lun, 6);
  const semUA = ses.filter(s => s.fecha >= key(lun) && s.fecha <= key(fin)).reduce((a, s) => a + ua(byId('registro', s.id)), 0);
  m.innerHTML = `<div class="row">${selDep('cd')}<div class="row grow" style="justify-content:flex-end"><button class="btn sm" id="ap">Asignar plan</button><button class="btn sm" id="cs">Copiar semana a…</button></div></div>
    <div class="stepper"><button id="pw" aria-label="Semana anterior">‹</button><div class="d"><b>${fmtD(lun)} – ${fmtD(fin)}</b><span>Carga registrada: ${semUA} UA</span></div><button id="nw" aria-label="Semana siguiente">›</button></div>
    <div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = addDays(lun, i), k = key(d), lista = ses.filter(s => s.fecha === k);
      return `<div class="wday ${k === key(today()) ? 'today' : ''}"><div class="dh"><span>${DIAS[i]}</span><b>${d.getDate()}</b></div>
        ${lista.map(s => scard(s)).join('')}<button class="add" data-add="${k}">+ Sesión</button></div>`;
    }).join('')}</div>`;
  $('#cd').onchange = e => { S.ui.dep = e.target.value; renderCoach(); };
  $('#pw').onclick = () => { S.ui.semana = key(addDays(lun, -7)); renderCoach(); };
  $('#nw').onclick = () => { S.ui.semana = key(addDays(lun, 7)); renderCoach(); };
  $('#ap').onclick = () => asignarPlan();
  $('#cs').onclick = () => copiarSemana(lun, dep);
  m.querySelectorAll('[data-add]').forEach(b => b.onclick = () => nuevaSesion(b.dataset.add));
  m.querySelectorAll('[data-s]').forEach(b => b.onclick = () => editSesion(byId('sesion', b.dataset.s)));
}
function scard(s, plan) {
  const r = plan ? null : byId('registro', s.id);
  return `<button class="scard" style="--c:${DEP[s.deporte]?.c || 'var(--muted)'}" data-s="${s.id}" ${plan ? `data-ps="${s.id}"` : ''}><b>${esc(s.titulo || DEP[s.deporte]?.n)}</b><small>${esc(DEP[s.deporte]?.n || '')}${s.duracion ? ` · ${s.duracion}'` : ''}</small>${r && r.rpe ? `<small class="ok">✓ RPE ${r.rpe} · ${ua(r)} UA</small>` : ''}</button>`;
}
function nuevaSesion(fecha) {
  const dep = byId('deportista', S.ui.dep);
  const tipos = dep.deportes?.length ? dep.deportes : Object.keys(DEP);
  abrirEd('Nueva sesión', `<div class="card list"><p class="muted">${fmtLong(parseKey(fecha))} · ${esc(dep.nombre)}</p>
    <div class="l">Deporte<div class="chips">${Object.entries(DEP).map(([k, v]) => `<button type="button" class="chip" data-nd="${k}" aria-pressed="${k === tipos[0]}"><i style="--c:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
    <label class="l">O copia una sesión de un plan<select class="f" id="dePlan"><option value="">Sesión en blanco</option>${D.plan.map(p => `<optgroup label="${esc(p.nombre)}">${(p.sesiones || []).map(s => `<option value="${p.id}|${s.id}">S${s.semana} ${DIAS[s.dia - 1]} · ${esc(s.titulo || DEP[s.deporte]?.n)}</option>`).join('')}</optgroup>`).join('')}</select></label></div>`,
    () => {
      const v = $('#dePlan').value;
      let s;
      if (v) { const [pid, sid] = v.split('|'); s = clone(byId('plan', pid).sesiones.find(x => x.id === sid)); delete s.semana; delete s.dia; }
      else s = { titulo: '', deporte: document.querySelector('[data-nd][aria-pressed="true"]').dataset.nd, duracion: '', bloques: [] };
      Object.assign(s, { id: uid(), dep: dep.id, fecha });
      setTimeout(() => editSesion(s, true), 0);
    }, 'Continuar');
  document.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => document.querySelectorAll('[data-nd]').forEach(x => x.setAttribute('aria-pressed', x === b)));
}
function asignarPlan() {
  if (!D.plan.length) return toast('Todavía no hay planes. Créalos en la pestaña Planes.');
  const deps = D.deportista.filter(d => !d.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  abrirEd('Asignar plan', `<div class="card list">
    <label class="l">Plan<select class="f" id="apl">${D.plan.map(p => `<option value="${p.id}">${esc(p.nombre)} · ${p.semanas} sem.</option>`).join('')}</select></label>
    <label class="l">Empieza el lunes<input class="f" type="date" id="afe" value="${key(monday(addDays(new Date(), 7)))}"></label>
    <div class="l">¿Desde qué semana del plan?<div class="chips"><button type="button" class="chip" data-am="ini" aria-pressed="true">Desde la semana 1</button><button type="button" class="chip" data-am="sem" aria-pressed="false">Desde otra semana</button><button type="button" class="chip" data-am="exa" aria-pressed="false">Ajustar a la fecha del examen</button></div></div>
    <label class="l hidden" id="wSem">Empieza en la semana del plan<select class="f" id="asem"></select></label>
    <label class="l hidden" id="wExa">Fecha del examen<input class="f" type="date" id="aex"></label>
    <p class="small" id="ares"></p>
    <div class="l">Deportistas<div class="chips">${deps.map(d => `<button type="button" class="chip" data-ad="${d.id}" aria-pressed="${d.id === S.ui.dep}">${esc(d.nombre)}</button>`).join('')}</div></div>
    <p class="small muted">Se crean las sesiones en el calendario de cada deportista. Si el aspirante tiene menos semanas que el plan, se usan las últimas semanas del plan, para que la puesta a punto caiga justo antes del examen.</p></div>`,
    () => {
      const r = calc(); if (!r) return false;
      const sel = [...document.querySelectorAll('[data-ad][aria-pressed="true"]')].map(b => b.dataset.ad);
      if (!sel.length) return toast('Elige al menos un deportista'), false;
      const docs = [];
      sel.forEach(depId => (r.p.sesiones || []).filter(s => s.semana >= r.desde).forEach(s => {
        const f = addDays(r.ini, (s.semana - r.desde) * 7 + (s.dia - 1));
        if (r.hasta && key(f) > r.hasta) return;
        const n = clone(s); delete n.semana; delete n.dia;
        Object.assign(n, { id: uid(), dep: depId, fecha: key(f), plan: { id: r.p.id, semana: s.semana, dia: s.dia } });
        docs.push({ tipo: 'sesion', doc: n });
      }));
      if (!docs.length) return toast('No queda ninguna sesión con esas fechas'), false;
      guardar(docs); S.ui.semana = key(r.ini); renderCoach(); toast(`${docs.length} sesiones creadas`);
    }, 'Asignar');
  let modo = 'ini';
  const calc = () => {
    const p = byId('plan', $('#apl').value), ini = monday(parseKey($('#afe').value || key(new Date())));
    let desde = 1, hasta = null, txt = '';
    if (modo === 'sem') desde = +$('#asem').value || 1;
    if (modo === 'exa') {
      if (!$('#aex').value) { $('#ares').textContent = 'Elige la fecha del examen.'; return null; }
      const ex = parseKey($('#aex').value); hasta = key(addDays(ex, -1));
      const sem = Math.floor((monday(ex) - ini) / (7 * 864e5)) + 1;
      if (sem < 1) { $('#ares').textContent = 'El examen es antes del inicio.'; return null; }
      desde = Math.max(1, p.semanas - sem + 1);
      txt = sem >= p.semanas ? `Hay ${sem} semanas hasta el examen: se asigna el plan entero.` : `Hay ${sem} semanas hasta el examen: se asignan las semanas ${desde} a ${p.semanas} del plan.`;
    } else txt = `Se asignan las semanas ${desde} a ${p.semanas} del plan (${p.semanas - desde + 1} semanas).`;
    $('#ares').textContent = txt;
    return { p, ini, desde, hasta };
  };
  const llenar = () => { const p = byId('plan', $('#apl').value); $('#asem').innerHTML = Array.from({ length: p.semanas }, (_, i) => `<option value="${i + 1}">Semana ${i + 1}</option>`).join(''); calc(); };
  document.querySelectorAll('[data-am]').forEach(b => b.onclick = () => { modo = b.dataset.am; document.querySelectorAll('[data-am]').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#wSem').classList.toggle('hidden', modo !== 'sem'); $('#wExa').classList.toggle('hidden', modo !== 'exa'); calc(); });
  ['#apl'].forEach(s => $(s).onchange = llenar); ['#afe', '#asem', '#aex'].forEach(s => $(s).onchange = calc);
  llenar();
  document.querySelectorAll('[data-ad]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
}
function copiarSemana(lun, dep) {
  const fin = key(addDays(lun, 6)), ses = D.sesion.filter(s => s.dep === dep.id && s.fecha >= key(lun) && s.fecha <= fin);
  if (!ses.length) return toast('Esta semana no tiene sesiones');
  const deps = D.deportista.filter(d => !d.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  abrirEd('Copiar semana', `<div class="card list"><p class="muted">${ses.length} sesiones de ${esc(dep.nombre)} (${fmtD(lun)} – ${fmtD(addDays(lun, 6))})</p>
    <label class="l">A la semana que empieza el lunes<input class="f" type="date" id="cfe" value="${key(lun)}"></label>
    <div class="l">Deportistas<div class="chips">${deps.map(d => `<button type="button" class="chip" data-cd="${d.id}" aria-pressed="false">${esc(d.nombre)}</button>`).join('')}</div></div></div>`,
    () => {
      const dest = monday(parseKey($('#cfe').value)), off = Math.round((dest - lun) / 864e5);
      const sel = [...document.querySelectorAll('[data-cd][aria-pressed="true"]')].map(b => b.dataset.cd);
      if (!sel.length) return toast('Elige al menos un deportista'), false;
      const docs = [];
      sel.forEach(id => ses.forEach(s => { const n = clone(s); Object.assign(n, { id: uid(), dep: id, fecha: key(addDays(parseKey(s.fecha), off)) }); docs.push({ tipo: 'sesion', doc: n }); }));
      guardar(docs); renderCoach(); toast(`${docs.length} sesiones copiadas`);
    }, 'Copiar');
  document.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
}

/* ---------- Editor de sesión (sirve para calendario y planes) ---------- */
function editSesion(s, nueva, enPlan) {
  s = clone(s); s.bloques = s.bloques || [];
  const dep = enPlan ? null : byId('deportista', s.dep);
  const pintar = () => {
    const c = DEP[s.deporte]?.c;
    $('#edBody').innerHTML = `
      <div class="card list">
        ${enPlan ? `<p class="muted small">Plan: ${esc(enPlan.nombre)} · Semana ${s.semana} · ${DIAS[s.dia - 1]}</p>` : `<p class="muted small">${esc(dep?.nombre || '')} · ${fmtLong(parseKey(s.fecha))}</p>`}
        <div class="grid2"><label class="l">Título<input class="f" data-k="titulo" value="${esc(s.titulo)}" placeholder="p. ej. Fuerza · Día 1"></label>
        <label class="l">Deporte<select class="f" data-k="deporte">${Object.entries(DEP).map(([k, v]) => `<option value="${k}" ${k === s.deporte ? 'selected' : ''}>${v.n}</option>`).join('')}</select></label>
        ${enPlan ? `<label class="l">Semana<input class="f" type="number" min="1" max="${enPlan.semanas}" data-k="semana" value="${s.semana}"></label><label class="l">Día<select class="f" data-k="dia">${DIAS.map((d, i) => `<option value="${i + 1}" ${i + 1 == s.dia ? 'selected' : ''}>${d}</option>`).join('')}</select></label>` : `<label class="l">Fecha<input class="f" type="date" data-k="fecha" value="${s.fecha}"></label>`}
        <label class="l">Duración prevista (min)<input class="f" type="number" min="0" data-k="duracion" value="${esc(s.duracion)}"></label>
        <label class="l">RPE objetivo<input class="f" data-k="rpeObj" value="${esc(s.rpeObj || '')}" placeholder="p. ej. 6–7"></label></div>
        <label class="l">Notas para el deportista<textarea class="f" data-k="notas">${esc(s.notas || '')}</textarea></label>
      </div>
      ${s.bloques.map((b, bi) => `<div class="eblock" style="--c:${c}">
        <div class="row"><input class="f grow" data-b="${bi}" data-bk="nombre" value="${esc(b.nombre)}" placeholder="Nombre del bloque" style="font-weight:700">
        ${s.deporte === 'fuerza' ? `<label class="l" style="width:90px">Series<input class="f" type="number" min="1" data-b="${bi}" data-bk="series" value="${esc(b.series || '')}"></label>` : ''}
        <button class="icon" data-mb="${bi}|-1" aria-label="Subir bloque">↑</button><button class="icon" data-mb="${bi}|1" aria-label="Bajar bloque">↓</button><button class="icon" data-db="${bi}" aria-label="Borrar bloque">✕</button></div>
        ${(b.items || []).map((it, ii) => itemEd(s.deporte, bi, ii, it)).join('')}
        <div class="row"><button class="btn sm" data-ai="${bi}">+ Desde la biblioteca</button><button class="btn sm ghost" data-ab="${bi}">+ Línea libre</button></div>
      </div>`).join('')}
      <div class="row"><button class="btn" id="nb">+ Añadir bloque</button>${s.deporte === 'fuerza' ? '<button class="btn ghost" id="nbF">+ Estructura de fuerza (movilidad, activación, pliometría, fuerza 1, fuerza 2, accesorios)</button>' : ''}</div>
      ${nueva ? '' : `<div class="row"><button class="btn sm" id="dup">Duplicar</button><button class="btn sm danger" id="dels">Borrar sesión</button></div>`}`;
    enlazar();
  };
  const leer = () => {
    document.querySelectorAll('#edBody [data-k]').forEach(i => { s[i.dataset.k] = ['semana', 'dia'].includes(i.dataset.k) ? +i.value : i.value; });
    document.querySelectorAll('#edBody [data-bk]').forEach(i => { s.bloques[+i.dataset.b][i.dataset.bk] = i.value; });
    document.querySelectorAll('#edBody [data-ik]').forEach(i => { const [bi, ii] = i.dataset.i.split('|').map(Number); s.bloques[bi].items[ii][i.dataset.ik] = i.value; });
  };
  const enlazar = () => {
    const B = $('#edBody');
    B.querySelector('[data-k="deporte"]').onchange = () => { leer(); pintar(); };
    $('#nb').onclick = () => { leer(); s.bloques.push({ id: uid(), nombre: '', series: s.deporte === 'fuerza' ? 3 : '', items: [] }); pintar(); };
    const nbF = $('#nbF'); if (nbF) nbF.onclick = () => { leer(); ['Movilidad', 'Activación', 'Pliometría, lanzamientos y power', 'Fuerza 1 · dominante de cadera + empuje', 'Fuerza 2 · dominante de rodilla + tracción', 'Accesorios'].forEach((n, i) => s.bloques.push({ id: uid(), nombre: n, series: i < 2 ? 2 : 3, items: [] })); pintar(); };
    B.querySelectorAll('[data-db]').forEach(x => x.onclick = () => { leer(); s.bloques.splice(+x.dataset.db, 1); pintar(); });
    B.querySelectorAll('[data-mb]').forEach(x => x.onclick = () => { leer(); const [i, d] = x.dataset.mb.split('|').map(Number); const j = i + d; if (j < 0 || j >= s.bloques.length) return; [s.bloques[i], s.bloques[j]] = [s.bloques[j], s.bloques[i]]; pintar(); });
    B.querySelectorAll('[data-ab]').forEach(x => x.onclick = () => { leer(); s.bloques[+x.dataset.ab].items.push({ id: uid(), nombre: '' }); pintar(); });
    B.querySelectorAll('[data-ai]').forEach(x => x.onclick = () => { leer(); elegirEjercicio(s.deporte, ej => { s.bloques[+x.dataset.ai].items.push(itemDesde(ej)); pintar(); }); });
    B.querySelectorAll('[data-di]').forEach(x => x.onclick = () => { leer(); const [bi, ii] = x.dataset.di.split('|').map(Number); s.bloques[bi].items.splice(ii, 1); pintar(); });
    B.querySelectorAll('[data-mi]').forEach(x => x.onclick = () => { leer(); const [bi, ii, d] = x.dataset.mi.split('|').map(Number); const it = s.bloques[bi].items, j = ii + d; if (j < 0 || j >= it.length) return; [it[ii], it[j]] = [it[j], it[ii]]; pintar(); });
    const dup = $('#dup'); if (dup) dup.onclick = () => { leer(); const n = clone(s); n.id = uid(); n.titulo = (n.titulo || '') + ' (copia)'; cerrarEd(); editSesion(n, true, enPlan); };
    const dels = $('#dels'); if (dels) dels.onclick = () => {
      if (!confirm('¿Borrar esta sesión?')) return;
      if (enPlan) { enPlan.sesiones = enPlan.sesiones.filter(x => x.id !== s.id); guardar([{ tipo: 'plan', doc: enPlan }]); }
      else borrar([{ tipo: 'sesion', id: s.id }]);
      cerrarEd(); renderCoach();
    };
  };
  abrirEd(nueva ? 'Nueva sesión' : (s.titulo || 'Sesión'), '', () => {
    leer();
    s.bloques.forEach(b => b.items = (b.items || []).filter(it => it.nombre || it.texto));
    if (enPlan) { const i = enPlan.sesiones.findIndex(x => x.id === s.id); if (i >= 0) enPlan.sesiones[i] = s; else enPlan.sesiones.push(s); guardar([{ tipo: 'plan', doc: enPlan }]); }
    else guardar([{ tipo: 'sesion', doc: s }]);
    renderCoach();
  });
  pintar();
}
function itemDesde(ej) {
  const it = { id: uid(), ej: ej.id, nombre: ej.nombre, video: ej.video || '' };
  ['reps', 'carga', 'rpe', 'desc', 'texto', 'dist', 'tiempo', 'ritmo', 'notas'].forEach(k => { if (ej.def?.[k]) it[k] = ej.def[k]; });
  if (ej.texto && !it.texto) it.texto = ej.texto;
  return it;
}
const CAMPOS = {
  fuerza: [['reps', 'Reps (por serie: 5-5-5-3)'], ['carga', 'Carga (kg / %)'], ['rpe', 'RPE'], ['desc', 'Descanso'], ['series', 'Series (si cambia)']],
  natacion: [['dist', 'Metros'], ['tiempo', 'Tiempo (min)'], ['rpe', 'Intensidad / RPE']],
  carrera: [['dist', 'Distancia'], ['tiempo', 'Tiempo'], ['ritmo', 'Ritmo / zona'], ['desc', 'Recuperación'], ['rpe', 'RPE']],
  otro: [['tiempo', 'Tiempo'], ['rpe', 'RPE']],
};
function itemEd(dep, bi, ii, it) {
  const id = `${bi}|${ii}`;
  const conTexto = dep !== 'fuerza';
  return `<div class="eitem"><div class="top"><label class="grow">Ejercicio / tarea<input data-i="${id}" data-ik="nombre" value="${esc(it.nombre)}" placeholder="${conTexto ? 'p. ej. Calentamiento, 6x100 progresivo' : 'Nombre del ejercicio'}"></label>
    <button class="icon" data-mi="${bi}|${ii}|-1" aria-label="Subir">↑</button><button class="icon" data-mi="${bi}|${ii}|1" aria-label="Bajar">↓</button><button class="icon" data-di="${id}" aria-label="Quitar">✕</button></div>
    ${conTexto ? `<label>Descripción (texto tal cual lo verá el deportista)<textarea data-i="${id}" data-ik="texto">${esc(it.texto || '')}</textarea></label>` : ''}
    <div class="fields">${(CAMPOS[dep] || CAMPOS.otro).map(([k, n]) => `<label>${n}<input data-i="${id}" data-ik="${k}" value="${esc(it[k] || '')}"></label>`).join('')}
    <label>Vídeo (enlace)<input data-i="${id}" data-ik="video" value="${esc(it.video || '')}" placeholder="YouTube"></label></div>
    <label>Indicación<input data-i="${id}" data-ik="notas" value="${esc(it.notas || '')}"></label></div>`;
}
function elegirEjercicio(dep, cb) {
  const dl = $('#pk'); let f = { q: '', dep, cat: '' };
  const pintar = () => {
    const lista = D.ejercicio.filter(e => (!f.dep || e.deporte === f.dep) && (!f.cat || e.cat === f.cat) && (!f.q || norm(e.nombre).includes(norm(f.q)))).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    $('#pkL').innerHTML = lista.length ? lista.slice(0, 200).map(e => `<button class="item" data-pe="${e.id}"><div class="t"><b>${esc(e.nombre)}</b><small>${esc(e.cat || '')}</small></div>${e.video ? '<span class="small muted">▶</span>' : ''}</button>`).join('') : '<div class="empty">Nada en la biblioteca con ese filtro.</div>';
    $('#pkL').querySelectorAll('[data-pe]').forEach(b => b.onclick = () => { dl.close(); cb(byId('ejercicio', b.dataset.pe)); });
  };
  $('#pkC').innerHTML = `<option value="">Todas las categorías</option>${(CATS[dep] || []).map(c => `<option>${esc(c)}</option>`).join('')}`;
  $('#pkQ').value = ''; $('#pkQ').oninput = e => { f.q = e.target.value; pintar(); };
  $('#pkC').onchange = e => { f.cat = e.target.value; pintar(); };
  pintar(); dl.showModal(); $('#pkQ').focus();
}
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- Planes ---------- */
function vPlanes(m) {
  m.innerHTML = `<div class="row"><h2 class="grow">Planes predeterminados</h2><button class="btn pri" id="np">+ Nuevo plan</button></div>
    ${D.plan.length ? `<div class="list">${D.plan.map(p => `<button class="item" data-p="${p.id}"><div class="t"><b>${esc(p.nombre)}</b><small>${p.semanas} semanas · ${(p.sesiones || []).length} sesiones${p.desc ? ' · ' + esc(p.desc.slice(0, 80)) : ''}</small></div></button>`).join('')}</div>` : '<div class="empty">Aún no hay planes. Un plan es una plantilla de varias semanas que luego asignas a uno o varios deportistas.</div>'}`;
  $('#np').onclick = () => { const p = { id: uid(), nombre: 'Nuevo plan', desc: '', semanas: 4, sesiones: [] }; guardar([{ tipo: 'plan', doc: p }]); S.ui.plan = p.id; vPlan(m); };
  m.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { S.ui.plan = b.dataset.p; vPlan(m); });
}
function vPlan(m) {
  const p = byId('plan', S.ui.plan); if (!p) return vPlanes(m);
  const semanas = Array.from({ length: p.semanas }, (_, i) => i + 1);
  m.innerHTML = `<div class="row"><button class="btn sm ghost" id="vol">← Planes</button><div class="grow"></div><button class="btn sm" id="dupP">Duplicar plan</button><button class="btn sm danger" id="delP">Borrar plan</button></div>
    <div class="card list"><div class="grid2"><label class="l">Nombre<input class="f" id="pn" value="${esc(p.nombre)}"></label><label class="l">Semanas<input class="f" type="number" min="1" max="52" id="psem" value="${p.semanas}"></label></div>
    <label class="l">Descripción<textarea class="f" id="pde">${esc(p.desc || '')}</textarea></label>${p.fuente ? `<p class="small muted">Fuente: ${esc(p.fuente)}</p>` : ''}</div>
    <div class="scroll"><div class="pgrid"><div></div>${DIAS.map(d => `<div class="hd">${d}</div>`).join('')}
    ${semanas.map(w => `<div class="wl">Sem ${w}<br><button class="icon" data-cw="${w}" title="Copiar semana ${w} a la siguiente" aria-label="Copiar semana ${w} a la siguiente">⧉</button></div>${[1, 2, 3, 4, 5, 6, 7].map(d => `<div class="pc">${(p.sesiones || []).filter(s => s.semana === w && s.dia === d).map(s => scard(s, true)).join('')}<button class="add" data-pa="${w}|${d}" aria-label="Añadir sesión semana ${w} ${DIAS[d - 1]}">+</button></div>`).join('')}`).join('')}</div></div>`;
  const sv = () => { p.nombre = $('#pn').value; p.desc = $('#pde').value; p.semanas = Math.max(1, +$('#psem').value || 1); guardar([{ tipo: 'plan', doc: p }]); };
  $('#pn').onchange = sv; $('#pde').onchange = sv; $('#psem').onchange = () => { sv(); vPlan(m); };
  $('#vol').onclick = () => vPlanes(m);
  $('#delP').onclick = () => { if (confirm(`¿Borrar el plan "${p.nombre}"? Las sesiones ya asignadas a deportistas no se borran.`)) { borrar([{ tipo: 'plan', id: p.id }]); vPlanes(m); } };
  $('#dupP').onclick = () => { const n = clone(p); n.id = uid(); n.nombre += ' (copia)'; n.sesiones.forEach(s => s.id = uid()); guardar([{ tipo: 'plan', doc: n }]); S.ui.plan = n.id; vPlan(m); };
  m.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => {
    const [w, d] = b.dataset.pa.split('|').map(Number);
    editSesion({ id: uid(), titulo: '', deporte: 'fuerza', semana: w, dia: d, bloques: [] }, true, p);
  });
  m.querySelectorAll('[data-ps]').forEach(b => b.onclick = () => editSesion(p.sesiones.find(s => s.id === b.dataset.ps), false, p));
  m.querySelectorAll('[data-cw]').forEach(b => b.onclick = () => {
    const w = +b.dataset.cw; if (w >= p.semanas) return toast('Es la última semana');
    p.sesiones.push(...p.sesiones.filter(s => s.semana === w).map(s => Object.assign(clone(s), { id: uid(), semana: w + 1 })));
    guardar([{ tipo: 'plan', doc: p }]); vPlan(m); toast(`Semana ${w} copiada a la ${w + 1}`);
  });
}

/* ---------- Biblioteca ---------- */
function vBiblioteca(m) {
  const f = S.ui.bib = S.ui.bib || { dep: 'fuerza', cat: '', q: '' };
  const lista = D.ejercicio.filter(e => e.deporte === f.dep && (!f.cat || e.cat === f.cat) && (!f.q || norm(e.nombre + ' ' + (e.texto || '')).includes(norm(f.q)))).sort((a, b) => (a.cat || '').localeCompare(b.cat || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  const n = k => D.ejercicio.filter(e => e.deporte === k).length;
  const vacia = !D.ejercicio.length && !D.plan.length;
  m.innerHTML = `<div class="row"><h2 class="grow">Biblioteca</h2><button class="btn pri" id="ne">+ Nuevo</button></div>
    ${vacia ? '<div class="card row"><div class="grow"><b>Biblioteca vacía</b><div class="small muted">Puedes empezar con los ejercicios de fuerza del mesociclo High Force (con vídeo), calentamientos de natación de @swimcoachjj y los dos planes High Force de 4 semanas.</div></div><button class="btn pri" id="ini">Cargar biblioteca inicial</button></div>' : ''}
    <div class="chips">${Object.entries(DEP).map(([k, v]) => `<button class="chip" data-bd="${k}" aria-pressed="${f.dep === k}"><i style="--c:${v.c}"></i>${v.n} · ${n(k)}</button>`).join('')}</div>
    <div class="row"><input class="f grow" id="bq" placeholder="Buscar" value="${esc(f.q)}" style="max-width:320px"><select class="f" id="bc" style="max-width:260px"><option value="">Todas las categorías</option>${(CATS[f.dep] || []).map(c => `<option ${c === f.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    ${lista.length ? `<div class="libgrid">${lista.map(e => `<button class="item" data-e="${e.id}">${vidId(e.video) ? `<img src="https://i.ytimg.com/vi/${vidId(e.video)}/default.jpg" alt="" width="48" height="36" style="border-radius:6px;object-fit:cover;flex:none" loading="lazy">` : ''}<div class="t"><b>${esc(e.nombre)}</b><small>${esc(e.cat || '')}${e.fuente ? ' · ' + esc(e.fuente) : ''}</small></div></button>`).join('')}</div>` : '<div class="empty">No hay nada en esta categoría todavía.</div>'}`;
  m.querySelectorAll('[data-bd]').forEach(b => b.onclick = () => { f.dep = b.dataset.bd; f.cat = ''; vBiblioteca(m); });
  $('#bq').oninput = e => { f.q = e.target.value; clearTimeout(f._t); f._t = setTimeout(() => { vBiblioteca(m); const i = $('#bq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $('#bc').onchange = e => { f.cat = e.target.value; vBiblioteca(m); };
  const bi = $('#ini'); if (bi) bi.onclick = async () => { bi.disabled = true; try { const docs = await (await fetch('inicial.json')).json(); guardar(docs); toast('Biblioteca cargada'); renderCoach(); } catch (e) { bi.disabled = false; toast('No se pudo cargar'); } };
  $('#ne').onclick = () => editEjercicio({ id: uid(), nombre: '', deporte: f.dep, cat: f.cat || (CATS[f.dep] || [])[0] || '', video: '', texto: '', def: {} }, true);
  m.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editEjercicio(clone(byId('ejercicio', b.dataset.e))));
}
function editEjercicio(e, nuevo) {
  e.def = e.def || {};
  const pinta = () => `<div class="card list">
    <label class="l">Nombre<input class="f" id="en" value="${esc(e.nombre)}"></label>
    <div class="grid2"><label class="l">Deporte<select class="f" id="ed2">${Object.entries(DEP).map(([k, v]) => `<option value="${k}" ${k === e.deporte ? 'selected' : ''}>${v.n}</option>`).join('')}</select></label>
    <label class="l">Categoría<input class="f" id="ec" value="${esc(e.cat || '')}" list="cats"></label></div>
    <datalist id="cats">${(CATS[e.deporte] || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <label class="l">Vídeo (enlace de YouTube, ≤10 s)<input class="f" id="ev" value="${esc(e.video || '')}"></label>
    ${vidId(e.video) ? `<button type="button" class="thumb" data-v="${vidId(e.video)}" data-n="${esc(e.nombre)}" aria-label="Ver vídeo"><img src="https://i.ytimg.com/vi/${vidId(e.video)}/hqdefault.jpg" alt=""><span>${PLAY}</span></button>` : ''}
    <label class="l">${e.deporte === 'fuerza' ? 'Indicaciones de ejecución' : 'Descripción de la tarea (texto tal cual)'}<textarea class="f ${e.deporte === 'fuerza' ? '' : 'mono'}" id="et" rows="5">${esc(e.texto || '')}</textarea></label>
    <label class="l">Fuente<input class="f" id="ef" value="${esc(e.fuente || '')}" placeholder="p. ej. @swimcoachjj, 19/10/26"></label>
    <div class="l">Valores por defecto al añadirlo a una sesión<div class="grid2">${(CAMPOS[e.deporte] || CAMPOS.otro).map(([k, n]) => `<label class="l">${n}<input class="f" data-df="${k}" value="${esc(e.def[k] || '')}"></label>`).join('')}</div></div></div>
    ${nuevo ? '' : '<button class="btn danger" id="dele">Borrar de la biblioteca</button>'}`;
  const leer = () => { e.nombre = $('#en').value.trim(); e.deporte = $('#ed2').value; e.cat = $('#ec').value.trim(); e.video = $('#ev').value.trim(); e.texto = $('#et').value; e.fuente = $('#ef').value.trim(); document.querySelectorAll('[data-df]').forEach(i => { if (i.value) e.def[i.dataset.df] = i.value; else delete e.def[i.dataset.df]; }); };
  abrirEd(nuevo ? 'Nuevo ejercicio' : e.nombre, pinta(), () => { leer(); if (!e.nombre) return toast('Falta el nombre'), false; guardar([{ tipo: 'ejercicio', doc: e }]); renderCoach(); });
  const enl = () => {
    $('#ed2').onchange = () => { leer(); $('#edBody').innerHTML = pinta(); enl(); };
    $('#ev').onchange = () => { leer(); $('#edBody').innerHTML = pinta(); enl(); };
    const d = $('#dele'); if (d) d.onclick = () => { if (confirm('¿Borrar este ejercicio de la biblioteca? Las sesiones que ya lo usan no cambian.')) { borrar([{ tipo: 'ejercicio', id: e.id }]); cerrarEd(); renderCoach(); } };
  };
  enl();
}

/* ---------- Carga (sRPE) ---------- */
const ua = r => r && r.rpe && r.minutos ? Math.round(+r.rpe * +r.minutos) : 0;
function cargaPorDia(depId) {
  const m = {};
  D.registro.filter(r => (r.dep || S.yo?.id) === depId && ua(r)).forEach(r => { const f = r.fecha || byId('sesion', r.id)?.fecha; if (f) m[f] = (m[f] || 0) + ua(r); });
  return m;
}
function semanas(porDia, n, hasta) {
  const lun = monday(hasta || new Date()); const out = [];
  for (let i = n - 1; i >= 0; i--) { const l = addDays(lun, -7 * i); let t = 0; for (let d = 0; d < 7; d++) t += porDia[key(addDays(l, d))] || 0; out.push({ l, t }); }
  return out;
}
function vCarga(m) {
  const deps = D.deportista.filter(d => !d.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!deps.length) { m.innerHTML = '<div class="empty">No hay deportistas.</div>'; return; }
  if (S.ui.cargaDep && byId('deportista', S.ui.cargaDep)) return vCargaDep(m, byId('deportista', S.ui.cargaDep));
  const filas = deps.map(d => { const w = semanas(cargaPorDia(d.id), 2); return { d, ant: w[0].t, act: w[1].t }; });
  m.innerHTML = `<h2>Carga de entrenamiento</h2><p class="muted small">sRPE = RPE de la sesión × minutos. Lo registra cada deportista al terminar.</p>
    <div class="card scroll"><table class="data"><thead><tr><th>Deportista</th><th class="n">Semana pasada (UA)</th><th class="n">Esta semana (UA)</th><th class="n">Cambio</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td><button class="btn ghost sm" data-cg="${f.d.id}">${esc(f.d.nombre)}</button></td><td class="n">${f.ant}</td><td class="n">${f.act}</td><td class="n">${f.ant ? (f.act >= f.ant ? '+' : '') + Math.round((f.act - f.ant) / f.ant * 100) + ' %' : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  m.querySelectorAll('[data-cg]').forEach(b => b.onclick = () => { S.ui.cargaDep = b.dataset.cg; renderCoach(); });
}
function vCargaDep(m, dep, propio) {
  const porDia = cargaPorDia(dep.id);
  const sem = semanas(porDia, 8);
  const lun = monday(new Date());
  const dias = Array.from({ length: 28 }, (_, i) => { const d = addDays(lun, -21 + i); return { d, t: porDia[key(d)] || 0 }; });
  const regs = D.registro.filter(r => (r.dep || S.yo?.id) === dep.id && ua(r)).map(r => ({ r, s: byId('sesion', r.id) })).sort((a, b) => (b.r.fecha || '').localeCompare(a.r.fecha || '')).slice(0, 40);
  const act = sem[7].t, ant = sem[6].t, media4 = Math.round((sem[3].t + sem[4].t + sem[5].t + sem[6].t) / 4);
  m.innerHTML = `${propio ? '<h2>Mi carga</h2>' : `<div class="row"><button class="btn sm ghost" id="vc">← Todos</button><h2 class="grow">${esc(dep.nombre)}</h2></div>`}
    <div class="kpis"><div class="kpi"><small>Esta semana</small><b>${act}</b> <span class="small muted">UA</span></div><div class="kpi"><small>Semana pasada</small><b>${ant}</b> <span class="small muted">UA</span></div><div class="kpi"><small>Media 4 semanas anteriores</small><b>${media4}</b> <span class="small muted">UA</span></div></div>
    <div class="card"><h3>Carga semanal (últimas 8 semanas)</h3><div class="chart" id="chW"></div></div>
    <div class="card"><h3>Carga diaria (últimas 4 semanas)</h3><div class="chart" id="chD"></div></div>
    <div class="card scroll"><h3>Sesiones registradas</h3><table class="data"><thead><tr><th>Fecha</th><th>Sesión</th><th class="n">Min</th><th class="n">RPE</th><th class="n">UA</th></tr></thead><tbody>
    ${regs.length ? regs.map(({ r, s }) => `<tr><td>${r.fecha ? fmtD(parseKey(r.fecha)) : ''}</td><td>${esc(s?.titulo || DEP[s?.deporte]?.n || '')}</td><td class="n">${r.minutos}</td><td class="n">${r.rpe}</td><td class="n">${ua(r)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Sin registros todavía.</td></tr>'}</tbody></table></div>`;
  const vc = $('#vc'); if (vc) vc.onclick = () => { S.ui.cargaDep = null; renderCoach(); };
  barras($('#chW'), sem.map(x => ({ etq: fmtD(x.l), v: x.t, tip: `Semana del ${fmtD(x.l)}: ${x.t} UA` })));
  barras($('#chD'), dias.map(x => ({ etq: x.d.getDay() === 1 ? fmtD(x.d) : '', v: x.t, tip: `${fmtLong(x.d)}: ${x.t} UA`, hoy: key(x.d) === key(today()) })));
}
// Gráfico de barras de una sola serie (SVG), con tooltip al pasar o tocar
function barras(el, datos) {
  const W = Math.max(300, Math.round(el.clientWidth || 640)), H = 200, pl = 36, pb = 22, pt = 8, max = Math.max(10, ...datos.map(d => d.v));
  const paso = niceStep(max), top = Math.ceil(max / paso) * paso, n = datos.length, bw = (W - pl) / n, gap = Math.min(6, bw * .25);
  const y = v => pt + (H - pt - pb) * (1 - v / top);
  const conEtq = datos.filter(d => d.etq).length, salto = Math.max(1, Math.ceil(conEtq * 52 / (W - pl)));
  let g = '';
  for (let v = 0; v <= top; v += paso) g += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--chart-grid)" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const bars = datos.map((d, i) => {
    const x = pl + i * bw + gap / 2, w = bw - gap, h = Math.max(0, y(0) - y(d.v)), r = Math.min(4, w / 2, h);
    const path = h ? `M${x},${y(0)}V${y(d.v) + r}Q${x},${y(d.v)} ${x + r},${y(d.v)}H${x + w - r}Q${x + w},${y(d.v)} ${x + w},${y(d.v) + r}V${y(0)}Z` : '';
    return `${path ? `<path d="${path}" fill="${d.hoy ? 'var(--accent)' : 'var(--s-natacion)'}"/>` : ''}<rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent" data-i="${i}"/>${d.etq && (n - 1 - i) % salto === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(d.etq)}</text>` : ''}`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de carga">${g}${bars}</svg><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip'), svg = el.querySelector('svg');
  const show = ev => { const t = ev.target.closest('[data-i]'); if (!t) return tip.hidden = true; const d = datos[+t.dataset.i]; const b = svg.getBoundingClientRect(), s = b.width / W; tip.textContent = d.tip; tip.style.left = ((+t.getAttribute('x') + bw / 2) * s) + 'px'; tip.style.top = (y(d.v) * s) + 'px'; tip.hidden = false; };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', () => tip.hidden = true);
}
function niceStep(max) { const r = max / 4, p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

/* ======================================================================
   MODO DEPORTISTA
   ====================================================================== */
let colaR = LS.get('abs2-colaR', {});
async function entrarDep(id, pin, silencioso) {
  const cache = LS.get('abs2-cache', null);
  if (silencioso && cache?.modo === 'dep') { aplicarDep(cache.r); marcoDep(); }
  try {
    const j = await api({ a: 'login', id, pin });
    if (!j.ok) { if (j.error === 'pin') { LS.del('abs2-auth'); return silencioso ? pantallaAcceso() : ($('#err').textContent = 'PIN incorrecto.'); } throw 0; }
    S.auth = { modo: 'dep', id, pin, nombre: j.dep.nombre }; LS.set('abs2-auth', S.auth);
    Object.values(colaR).forEach(r => { const i = j.registros.findIndex(x => x.id === r.id); if (i >= 0) j.registros[i] = r; else j.registros.push(r); });
    LS.set('abs2-cache', { modo: 'dep', r: j });
    aplicarDep(j); marcoDep(); enviarRegs();
  } catch (e) {
    if (cache?.modo === 'dep') { aplicarDep(cache.r); marcoDep(); setSync('Sin conexión'); }
    else if (!silencioso) $('#err').textContent = 'No hay conexión.';
  }
}
function aplicarDep(j) {
  S.yo = j.dep; D.deportista = [j.dep]; D.sesion = j.sesiones; D.registro = j.registros; D.ejercicio = j.ejercicios;
}
const TABS_D = [['hoy', 'Entreno'], ['semana', 'Semana'], ['micarga', 'Mi carga']];
function marcoDep() {
  S.tab = TABS_D.some(t => t[0] === S.tab) ? S.tab : 'hoy';
  S.ui.dia = S.ui.dia || key(today());
  document.body.innerHTML = `<header class="hero"><div class="top"><div class="logo">ABS</div><div class="who"><b>${esc(S.yo.nombre)}</b><span id="sync">${esc(S.ui.sync || '')}</span></div><button class="out" id="out">Salir</button></div>
    <nav class="tabs">${TABS_D.map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${S.tab === k}">${n}</button>`).join('')}</nav></header><main id="main" class="narrow"></main>${dialogs()}`;
  $('#out').onclick = salir;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; marcoDep(); });
  setupDialogs();
  renderDep();
}
function renderDep() {
  const m = $('#main');
  if (S.tab === 'hoy') vDia(m);
  else if (S.tab === 'semana') vSemanaDep(m);
  else vCargaDep(m, S.yo, true);
}
function vSemanaDep(m) {
  const lun = monday(parseKey(S.ui.dia));
  m.innerHTML = `<div class="stepper"><button id="pw" aria-label="Semana anterior">‹</button><div class="d"><b>${fmtD(lun)} – ${fmtD(addDays(lun, 6))}</b><span>Toca una sesión para abrirla</span></div><button id="nw" aria-label="Semana siguiente">›</button></div>
    <div class="list">${[0, 1, 2, 3, 4, 5, 6].map(i => { const d = addDays(lun, i), k = key(d), ss = D.sesion.filter(s => s.fecha === k); return `<div class="card"><div class="row"><b class="grow">${DIAS[i]} ${d.getDate()}</b></div>${ss.length ? ss.map(s => `<div style="margin-top:6px">${scard(s)}</div>`).join('') : '<small class="muted">Descanso</small>'}</div>`; }).join('')}</div>`;
  $('#pw').onclick = () => { S.ui.dia = key(addDays(lun, -7)); renderDep(); };
  $('#nw').onclick = () => { S.ui.dia = key(addDays(lun, 7)); renderDep(); };
  m.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { S.ui.dia = byId('sesion', b.dataset.s).fecha; S.tab = 'hoy'; marcoDep(); });
}
function vDia(m) {
  const dia = parseKey(S.ui.dia), lun = monday(dia);
  const ss = D.sesion.filter(s => s.fecha === S.ui.dia);
  m.innerHTML = bannerInstalar() + `<div class="days">${[0, 1, 2, 3, 4, 5, 6].map(i => { const d = addDays(lun, i), k = key(d), l = D.sesion.filter(s => s.fecha === k); return `<button data-dia="${k}" aria-pressed="${k === S.ui.dia}" aria-label="${fmtLong(d)}">${DIAS[i]}<b>${d.getDate()}</b><span class="dots">${l.map(s => `<i style="--c:${DEP[s.deporte]?.c}"></i>`).join('')}</span></button>`; }).join('')}</div>
    <div class="row"><button class="btn sm ghost" id="pw">‹ Semana anterior</button><div class="grow"></div><button class="btn sm ghost" id="hoy">Hoy</button><button class="btn sm ghost" id="nw">Semana siguiente ›</button></div>
    ${ss.length ? ss.map(s => sesionDep(s)).join('') : `<div class="empty">${fmtLong(dia)}<br>No tienes sesión programada.</div>`}
    <p class="sync" id="sync">${esc(S.ui.sync || '')}</p>`;
  m.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => { S.ui.dia = b.dataset.dia; renderDep(); });
  enlazarInstalar();
  $('#pw').onclick = () => { S.ui.dia = key(addDays(lun, -7)); renderDep(); };
  $('#nw').onclick = () => { S.ui.dia = key(addDays(lun, 7)); renderDep(); };
  $('#hoy').onclick = () => { S.ui.dia = key(today()); renderDep(); };
  enlazarSesionDep(m);
}
const reg = id => { let r = byId('registro', id); if (!r) { const s = byId('sesion', id); r = { id, dep: S.yo?.id, fecha: s.fecha, sets: {}, hecho: {}, coment: {} }; D.registro.push(r); } r.sets = r.sets || {}; r.hecho = r.hecho || {}; r.coment = r.coment || {}; return r; };
const repsDe = (it, k) => { const p = String(it.reps || '').split(/\s*[-·]\s*/).filter(Boolean); return p.length > 1 ? (p[k] ?? p[p.length - 1]) : (it.reps || ''); };
const nSeries = (b, it) => { const p = String(it.reps || '').split(/\s*[-·]\s*/).filter(Boolean); return +it.series || +b.series || (p.length > 1 ? p.length : 1); };
function sesionDep(s) {
  const r = byId('registro', s.id) || {}, c = DEP[s.deporte]?.c;
  let tot = 0, hech = 0;
  (s.bloques || []).forEach((b, bi) => (b.items || []).forEach((it, ii) => { if (s.deporte === 'fuerza') { const n = nSeries(b, it); for (let k = 0; k < n; k++) { tot++; if (r.sets?.[`${bi}|${ii}|${k}`]?.ok) hech++; } } else { tot++; if (r.hecho?.[`${bi}|${ii}`]) hech++; } }));
  return `<section class="ses" style="--c:${c}" data-ses="${s.id}"><span class="meta">${DEP[s.deporte]?.n || ''}${s.duracion ? ` · ${s.duracion} min` : ''}${s.rpeObj ? ` · RPE objetivo ${esc(s.rpeObj)}` : ''}</span><h2>${esc(s.titulo || DEP[s.deporte]?.n)}</h2>${s.notas ? `<p>${esc(s.notas)}</p>` : ''}
    ${tot ? `<small class="muted">${hech} de ${tot} hechos</small><div class="progress"><i style="width:${tot ? hech / tot * 100 : 0}%"></i></div>` : ''}</section>
    ${(s.bloques || []).map((b, bi) => `<section class="block" style="--c:${c}"><div class="bh"><i></i>${esc(b.nombre || 'Bloque ' + (bi + 1))}${b.series && s.deporte === 'fuerza' ? ` · ${b.series} series` : ''}</div>
      ${(b.items || []).map((it, ii) => itemDep(s, b, bi, ii, it, r)).join('')}</section>`).join('')}
    <section class="card list" data-fin="${s.id}"><h3>${r.rpe ? 'Sesión registrada' : 'Al terminar la sesión'}</h3>
      <label class="l">Minutos totales<input class="f mono" inputmode="numeric" data-min="${s.id}" value="${esc(r.minutos || s.duracion || '')}"></label>
      <div class="l">¿Cómo de dura ha sido? (RPE 0–10)<div class="rpe">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-rpe="${s.id}|${i}" aria-pressed="${+r.rpe === i && r.rpe !== undefined && r.rpe !== ''}" aria-label="${i}: ${RPE_TXT[i]}">${i}</button>`).join('')}</div><small class="muted" id="rpeT-${s.id}">${r.rpe !== undefined && r.rpe !== '' ? RPE_TXT[+r.rpe] : 'Toca un número'}</small></div>
      <div class="row"><div class="grow"><small class="muted">Carga de la sesión</small><div class="ua" id="ua-${s.id}">${ua(r)} UA</div></div><button class="btn pri" data-guardar="${s.id}">Guardar</button></div>
      <textarea class="com" data-nota="${s.id}" placeholder="Comentario general de la sesión (opcional)">${esc(r.nota || '')}</textarea></section>`;
}
function itemDep(s, b, bi, ii, it, r) {
  const v = vidId(it.video), c = DEP[s.deporte]?.c;
  const extra = [it.dist && (s.deporte === 'natacion' ? it.dist + ' m' : it.dist), it.tiempo && (s.deporte === 'natacion' ? it.tiempo + ' min' : it.tiempo), it.ritmo, it.carga, it.rpe && (/^\d/.test(it.rpe) ? 'RPE ' + it.rpe : it.rpe), it.desc && (s.deporte === 'fuerza' ? 'Desc. ' + it.desc : 'Rec. ' + it.desc)].filter(Boolean).join(' · ');
  const cab = `<div class="exh"><div class="t"><h3>${esc(it.nombre || '')}</h3>${s.deporte === 'fuerza' && it.reps ? `<span class="rx">Reps ${esc(it.reps)}${extra ? ' · ' + esc(extra) : ''}</span>` : extra ? `<span class="rx">${esc(extra)}</span>` : ''}${it.notas ? `<span class="cue">${esc(it.notas)}</span>` : ''}${s.deporte === 'fuerza' ? ultimaVez(it, s) : ''}</div>
    ${v ? `<button type="button" class="thumb" data-v="${v}" data-n="${esc(it.nombre)}" aria-label="Ver vídeo: ${esc(it.nombre)}"><img src="https://i.ytimg.com/vi/${v}/hqdefault.jpg" alt="" loading="lazy"><span>${PLAY}</span></button>` : ''}
    ${s.deporte !== 'fuerza' ? `<button type="button" class="chk" data-hecho="${s.id}|${bi}|${ii}" aria-pressed="${!!r.hecho?.[`${bi}|${ii}`]}" aria-label="Marcar hecho">${CHECK}</button>` : ''}</div>`;
  let body = '';
  if (it.texto) body += `<pre class="txt">${esc(it.texto)}</pre>`;
  if (s.deporte === 'fuerza') {
    const n = nSeries(b, it);
    body += `<table class="sets"><thead><tr><th>Serie</th><th>Reps</th><th>Kg</th><th class="c"></th></tr></thead><tbody>${Array.from({ length: n }, (_, k) => { const id = `${s.id}|${bi}|${ii}|${k}`, x = r.sets?.[`${bi}|${ii}|${k}`] || {}; return `<tr class="${x.ok ? 'done' : ''}"><td class="n">${k + 1}</td><td class="r">${esc(repsDe(it, k))}</td><td><input data-kg="${id}" inputmode="decimal" placeholder="—" value="${esc(x.kg || '')}" aria-label="Kilos serie ${k + 1}"></td><td class="c"><button type="button" class="chk" data-set="${id}" aria-pressed="${!!x.ok}" aria-label="Serie ${k + 1} hecha">${CHECK}</button></td></tr>`; }).join('')}</tbody></table>`;
  }
  body += `<textarea class="com" data-com="${s.id}|${bi}|${ii}" rows="1" placeholder="Comentario para el entrenador (opcional)">${esc(r.coment?.[`${bi}|${ii}`] || '')}</textarea>`;
  return `<article class="ex" style="--c:${c}">${cab}${body}</article>`;
}
function ultimaVez(it, s) {
  let best = null;
  D.sesion.filter(x => x.fecha < s.fecha && x.deporte === 'fuerza').forEach(x => (x.bloques || []).forEach((b, bi) => (b.items || []).forEach((y, ii) => {
    if ((it.ej && y.ej === it.ej) || (!it.ej && y.nombre === it.nombre)) {
      const r = byId('registro', x.id); if (!r?.sets) return;
      const kg = Object.entries(r.sets).filter(([k, v]) => k.startsWith(`${bi}|${ii}|`) && v.kg).sort((a, b) => +a[0].split('|')[2] - +b[0].split('|')[2]).map(([, v]) => v.kg);
      if (kg.length && (!best || x.fecha > best.f)) best = { f: x.fecha, kg };
    }
  })));
  return best ? `<span class="last">Última vez (${fmtD(parseKey(best.f))}): ${esc(best.kg.join(' · '))} kg</span>` : '';
}
function enlazarSesionDep(m) {
  m.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v) return abrirVideo(b.dataset.v, b.dataset.n);
    if (b.dataset.set) { const [sid, bi, ii, k] = b.dataset.set.split('|'); const r = reg(sid), kk = `${bi}|${ii}|${k}`; r.sets[kk] = { ...(r.sets[kk] || {}), ok: !r.sets[kk]?.ok }; guardarReg(r); const on = r.sets[kk].ok; const y = scrollY; renderDep(); scrollTo(0, y); if (on) { const s = byId('sesion', sid), it = s.bloques[+bi].items[+ii]; iniciarDescanso(it.desc, it.nombre); } return; }
    if (b.dataset.hecho) { const [sid, bi, ii] = b.dataset.hecho.split('|'); const r = reg(sid), kk = `${bi}|${ii}`; r.hecho[kk] = !r.hecho[kk]; guardarReg(r); const y = scrollY; renderDep(); scrollTo(0, y); return; }
    if (b.dataset.rpe) { const [sid, v] = b.dataset.rpe.split('|'); const r = reg(sid); r.rpe = +v; const mi = m.querySelector(`[data-min="${sid}"]`); r.minutos = +mi.value || ''; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); $(`#rpeT-${sid}`).textContent = RPE_TXT[+v]; $(`#ua-${sid}`).textContent = ua(r) + ' UA'; return; }
    if (b.dataset.guardar) { const sid = b.dataset.guardar, r = reg(sid); r.minutos = +m.querySelector(`[data-min="${sid}"]`).value || ''; if (r.rpe === undefined || r.rpe === '') return toast('Elige el RPE de la sesión'); if (!r.minutos) return toast('Escribe los minutos'); guardarReg(r, true); toast(`Guardado: ${ua(r)} UA`); return; }
  };
  m.oninput = e => {
    const t = e.target;
    if (t.dataset.kg) { const [sid, bi, ii, k] = t.dataset.kg.split('|'); const r = reg(sid), kk = `${bi}|${ii}|${k}`; r.sets[kk] = { ...(r.sets[kk] || {}), kg: t.value }; guardarReg(r); }
    else if (t.dataset.com) { const [sid, bi, ii] = t.dataset.com.split('|'); const r = reg(sid); r.coment[`${bi}|${ii}`] = t.value; guardarReg(r); t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
    else if (t.dataset.nota) { const r = reg(t.dataset.nota); r.nota = t.value; guardarReg(r); }
    else if (t.dataset.min) { const r = reg(t.dataset.min); r.minutos = +t.value || ''; $(`#ua-${t.dataset.min}`).textContent = ua(r) + ' UA'; }
  };
}
let tReg;
function guardarReg(r, ya) {
  colaR[r.id] = r; LS.set('abs2-colaR', colaR);
  const c = LS.get('abs2-cache', null); if (c?.modo === 'dep') { const i = c.r.registros.findIndex(x => x.id === r.id); if (i >= 0) c.r.registros[i] = r; else c.r.registros.push(r); LS.set('abs2-cache', c); }
  clearTimeout(tReg); tReg = setTimeout(enviarRegs, ya ? 50 : 1200);
}
let enviando = false;
async function enviarRegs() {
  if (enviando || S.auth?.modo !== 'dep') return;
  const ids = Object.keys(colaR); if (!ids.length) return;
  enviando = true;
  try {
    for (const id of ids) { const r = colaR[id]; const j = await api({ a: 'registro', id: S.auth.id, pin: S.auth.pin, reg: r }); if (!j.ok) throw 0; if (colaR[id] === r) delete colaR[id]; }
    LS.set('abs2-colaR', colaR); setSync('Guardado en la hoja del entrenador ✓');
  } catch (e) { setSync('Sin conexión: se enviará al volver la red'); }
  enviando = false;
}

/* ---------- Vídeo emergente, descanso y editor a pantalla completa ---------- */
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
const vidId = u => (String(u || '').match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1];
function dialogs() {
  return `<dialog id="vd" aria-label="Vídeo del ejercicio"><div class="vbox"><button type="button" class="vclose" aria-label="Cerrar vídeo">×</button><div class="vframe"><iframe title="Vídeo" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div><p></p></div></dialog>
  <dialog id="ed"><div class="sheet"><header><button class="btn sm ghost" id="edX">Cancelar</button><h2 id="edT"></h2><button class="btn sm pri" id="edOk">Guardar</button></header><div class="body" id="edBody"></div></div></dialog>
  <dialog id="pk" aria-label="Elegir de la biblioteca"><div class="card" style="width:min(560px,94vw);max-height:84vh;display:flex;flex-direction:column;gap:8px"><div class="row"><b class="grow">Biblioteca</b><button class="icon" id="pkX" aria-label="Cerrar">✕</button></div><div class="row"><input class="f grow" id="pkQ" placeholder="Buscar"><select class="f" id="pkC" style="max-width:200px"></select></div><div class="list" id="pkL" style="overflow:auto"></div></div></dialog>
  <div id="rest" hidden role="status" aria-live="polite"><div class="rbar"><i></i></div><div class="rrow"><div class="rtx"><small><span id="rLbl">Descanso</span> · <span id="rName"></span></small><b id="rTime">0:00</b></div><button type="button" id="rPlus">+15 s</button><button type="button" id="rSkip">Cerrar</button></div></div>`;
}
let edOk = null;
function setupDialogs() {
  const vd = $('#vd');
  vd.addEventListener('click', e => { if (e.target === vd || e.target.closest('.vclose')) cerrarVideo(); });
  vd.addEventListener('close', () => vd.querySelector('iframe').src = 'about:blank');
  $('#edX').onclick = cerrarEd;
  $('#edOk').onclick = () => { if (edOk && edOk() === false) return; cerrarEd(); };
  $('#pkX').onclick = () => $('#pk').close();
  $('#pk').addEventListener('click', e => { if (e.target.id === 'pk') $('#pk').close(); });
  $('#rPlus').onclick = () => { if (R.fin || R.none) return; R.end += 15000; R.tot += 15; tick(); };
  $('#rSkip').onclick = ocultarDescanso;
  document.addEventListener('click', e => { const t = e.target.closest('#edBody .thumb'); if (t) abrirVideo(t.dataset.v, t.dataset.n); });
}
function abrirEd(titulo, html, ok, okTxt = 'Guardar') { $('#edT').textContent = titulo; $('#edBody').innerHTML = html; $('#edOk').textContent = okTxt; edOk = ok; const d = $('#ed'); if (!d.open) d.showModal(); $('#edBody').scrollTop = 0; }
function cerrarEd() { const d = $('#ed'); if (d.open) d.close(); edOk = null; }
function abrirVideo(v, n) { const d = $('#vd'); d.querySelector('p').textContent = n || ''; d.querySelector('iframe').src = `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&mute=1&loop=1&playlist=${v}&playsinline=1&controls=0&rel=0&modestbranding=1`; d.showModal(); }
function cerrarVideo() { const d = $('#vd'); d.querySelector('iframe').src = 'about:blank'; if (d.open) d.close(); }

const R = { end: 0, tot: 0, int: null, done: null, fin: false, none: false, ctx: null };
const mmss = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
function beep() { try { const a = R.ctx; if (!a) return; const t = a.currentTime; [0, .25, .5].forEach((o, i) => { const g = a.createGain(), os = a.createOscillator(); os.frequency.value = i === 2 ? 1175 : 880; g.gain.setValueAtTime(.0001, t + o); g.gain.exponentialRampToValueAtTime(.4, t + o + .02); g.gain.exponentialRampToValueAtTime(.0001, t + o + .2); os.connect(g).connect(a.destination); os.start(t + o); os.stop(t + o + .22); }); } catch (e) {} }
function tick() {
  const el = $('#rest'); if (!el) return;
  const left = Math.max(0, Math.ceil((R.end - Date.now()) / 1000));
  $('#rTime').textContent = mmss(left); el.querySelector('.rbar i').style.width = (R.tot ? left / R.tot * 100 : 0) + '%';
  if (left <= 0) { clearInterval(R.int); R.int = null; R.fin = true; el.classList.add('fin'); $('#rLbl').textContent = '¡A por la siguiente serie!'; beep(); try { navigator.vibrate && navigator.vibrate([300, 120, 300]); } catch (e) {} clearTimeout(R.done); R.done = setTimeout(ocultarDescanso, 5000); }
}
function ocultarDescanso() { clearInterval(R.int); R.int = null; clearTimeout(R.done); const el = $('#rest'); if (el) { el.hidden = true; el.classList.remove('fin', 'none'); } R.fin = R.none = false; }
function iniciarDescanso(desc, nombre) {
  try { R.ctx = R.ctx || new (window.AudioContext || window.webkitAudioContext)(); R.ctx.resume && R.ctx.resume(); } catch (e) {}
  const el = $('#rest'); clearTimeout(R.done); clearInterval(R.int); el.classList.remove('fin', 'none'); R.fin = R.none = false;
  $('#rName').textContent = nombre || '';
  const m = String(desc || '').match(/(\d+(?:[.,]\d+)?)\s*(s|seg|''|"|'|min|m\b)?/i);
  if (!m) { R.none = true; el.classList.add('none'); $('#rLbl').textContent = (desc ? String(desc).charAt(0).toUpperCase() + String(desc).slice(1) + ': sigue' : 'Sin descanso marcado: sigue') + ' con el siguiente ejercicio'; $('#rTime').textContent = ''; el.hidden = false; R.done = setTimeout(ocultarDescanso, 3000); return; }
  const n = parseFloat(m[1].replace(',', '.')), u = (m[2] || 's').toLowerCase();
  R.tot = Math.round(u === "'" || u.startsWith('m') ? n * 60 : n); R.end = Date.now() + R.tot * 1000;
  $('#rLbl').textContent = 'Descanso'; el.hidden = false; tick(); R.int = setInterval(tick, 250);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (R.int) tick(); if (S.auth?.modo === 'dep') enviarRegs(); else vaciarCola(); } });

iniciar();
