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
  ciclismo: { n: 'Ciclismo', c: 'var(--s-ciclismo)' },
  otro: { n: 'Otro', c: 'var(--s-otro)' },
};
const CATS = {
  fuerza: ['Warm up', 'Activación', 'Saltos, pliometría y fuerza explosiva', 'Fuerza · Empuje', 'Fuerza · Tracción', 'Fuerza · Dominante de rodilla', 'Fuerza · Dominante de cadera', 'Accesorios'],
  natacion: ['Potencia', 'R100', 'R200', 'R400', 'PAE', 'AEI', 'AEM', 'AEL', 'Kick sets', 'UW', 'Ejercicios de técnica', 'Warm up', 'Cool down'],
  carrera: ['Calentamiento', 'Técnica de carrera', 'Rodaje', 'Series', 'Tempo', 'Cuestas', 'Vuelta a la calma'],
  ciclismo: ['Calentamiento', 'Rodaje', 'Fuerza y cadencia', 'Umbral', 'VO2 máx y sprint', 'Test', 'Vuelta a la calma'],
  otro: ['General'],
};
// Categorías antiguas → nuevas (se aplica sola al entrar el entrenador)
const CAT_ANT_NAT = { 'Calentamiento': 'Warm up', 'Técnica': 'Ejercicios de técnica', 'Velocidad': 'Potencia', 'Vuelta a la calma': 'Cool down' };
const CAT_ANT = { 'Movilidad': 'Warm up', 'Pliometría y lanzamientos': 'Saltos, pliometría y fuerza explosiva', 'Derivados olímpicos': 'Saltos, pliometría y fuerza explosiva', 'Empuje': 'Fuerza · Empuje', 'Tracción': 'Fuerza · Tracción', 'Dominante de rodilla': 'Fuerza · Dominante de rodilla', 'Dominante de cadera': 'Fuerza · Dominante de cadera', 'Core': 'Accesorios', 'Prevención de hombro': 'Accesorios' };
const ordCat = (dep, c) => { const i = (CATS[dep] || []).indexOf(c); return i < 0 ? 99 : i; };
// Natación: cada ejercicio va a un estilo (o submarino, salidas, virajes) y se ordena por dificultad (orden manual del entrenador)
const ESTILOS = ['Crol', 'Espalda', 'Braza', 'Mariposa', 'Submarino', 'Salidas', 'Virajes'];
const NIVELES = ['Iniciación', 'Básico', 'Intermedio', 'Avanzado'];
const ordDif = (a, b) => (a.orden ?? 1e6) - (b.orden ?? 1e6) || (NIVELES.indexOf(a.nivel) + 1 || 9) - (NIVELES.indexOf(b.nivel) + 1 || 9) || String(a.id).localeCompare(String(b.id));
const ordenEj = (a, b) => ordCat(a.deporte, a.cat) - ordCat(b.deporte, b.cat) || (a.deporte === 'natacion' ? (ESTILOS.indexOf(a.estilo) + 1 || 99) - (ESTILOS.indexOf(b.estilo) + 1 || 99) || ordDif(a, b) : 0) || a.nombre.localeCompare(b.nombre, 'es');
// Pone estilo a los ejercicios de natación que no lo tienen, por su nombre (y los de la hoja «Tec Crol» → Crol)
function migrarEstilos() {
  const reglas = [[/viraxe|viraje|volteo/i, 'Virajes'], [/salida/i, 'Salidas'], [/submarin|\buw\b|ondulaci|delf[ií]n/i, 'Submarino'], [/espalda/i, 'Espalda'], [/braza/i, 'Braza'], [/mariposa/i, 'Mariposa'], [/\bcrol\b/i, 'Crol']];
  const cambios = D.ejercicio.filter(e => e.deporte === 'natacion' && !e.estilo && vidId(e.video)).map(e => {
    const t = e.nombre + ' ' + (e.texto || ''), r = reglas.find(([re]) => re.test(t));
    const est = r ? r[1] : /tec crol/i.test(e.fuente || '') ? 'Crol' : '';
    return est ? { tipo: 'ejercicio', doc: { ...e, estilo: est } } : null;
  }).filter(Boolean);
  if (cambios.length) guardar(cambios);
}
// La biblioteca es solo de vídeos: lo que no tiene vídeo de YouTube pasa a la base de datos como entrenamiento escrito
function migrarBib() {
  const sin = D.ejercicio.filter(e => !vidId(e.video));
  if (!sin.length) return;
  const refs = sin.filter(e => (e.texto || '').trim()).map(e => ({ tipo: 'referencia', doc: { id: 'bib-' + e.id, origen: 'Biblioteca', deporte: e.deporte, tipo: e.cat || '', titulo: e.nombre, texto: e.texto, medida: e.def?.dist ? e.def.dist + ' m' : '', autor: e.fuente || '', url: '' } }));
  refs.forEach(x => { if (!byId('referencia', x.doc.id)) D.referencia.push(x.doc); });
  if (refs.length) guardar(refs);
  borrar(sin.map(e => ({ tipo: 'ejercicio', id: e.id })));
}
const escrito = r => !!((r.serie || '').trim() || ((r.texto || '').trim() && !igCode(r.url)));
function migrarCats() {
  const cambios = D.ejercicio.filter(e => (e.deporte === 'fuerza' && CAT_ANT[e.cat]) || (e.deporte === 'natacion' && CAT_ANT_NAT[e.cat])).map(e => ({ tipo: 'ejercicio', doc: { ...e, cat: (e.deporte === 'natacion' ? CAT_ANT_NAT : CAT_ANT)[e.cat] } }));
  if (cambios.length) guardar(cambios);
}
const RPE_TXT = ['Reposo', 'Muy, muy fácil', 'Fácil', 'Moderado', 'Algo duro', 'Duro', 'Duro', 'Muy duro', 'Muy duro', 'Muy duro', 'Máximo'];

/* ---------- ECOs (igual que Train2Go) ----------
   ECOs = minutos en cada zona × coeficiente de la zona × factor del deporte.
   Coeficientes y factores medidos en la calculadora de ECOs de Train2Go (nov 2026):
   R0 1 · R1 2 · R1+ 2 · R2 3 · R3 5 · R3+ 9 · R4 15 · R5 40 · R6 50 por minuto; natación × 0,75, carrera × 1.
   Las distancias se pasan a minutos con el ritmo de cada zona, que sale del ritmo R3 de la persona
   (o el de Train2Go por defecto: 1:37/100 m y 4:19/km). El descanso cuenta como tiempo en su zona (R0 si no se dice otra). */
const ZONAS = [['r0', 'R0'], ['r1', 'R1'], ['r1p', 'R1+'], ['r2', 'R2'], ['r3', 'R3'], ['r3p', 'R3+'], ['r4', 'R4'], ['r5', 'R5'], ['r6', 'R6']];
const ZN = Object.fromEntries(ZONAS);
/* Intensidades de natación (las del entrenador) con los colores de la tabla de Rushall, en el mismo orden:
   Suave = Clear · A1 = White · A2 = Pink · A3 = Red · PAE = Orange · R400 = Blue · R200 = Purple · R100 = Green · Fuerte = Gold.
   Por dentro son las mismas 9 zonas (r0…r6) que usan los ECOs. */
const ZONAS_NAT = [['r0', 'Suave'], ['r1', 'A1'], ['r1p', 'A2'], ['r2', 'A3'], ['r3', 'PAE'], ['r3p', 'R400'], ['r4', 'R200'], ['r5', 'R100'], ['r6', 'Fuerte']];
const ZNAT_K = { suave: 'r0', a1: 'r1', a2: 'r1p', a3: 'r2', pae: 'r3', r400: 'r3p', r200: 'r4', r100: 'r5', fuerte: 'r6' };
const ZNAT_DESC = { r0: 'Recuperación', r1: 'Aeróbico suave', r1p: 'Aeróbico medio', r2: 'Aeróbico fuerte', r3: 'Potencia aeróbica', r3p: 'Ritmo de 400', r4: 'Ritmo de 200', r5: 'Ritmo de 100', r6: 'Máxima velocidad' };
const zonasDe = dep => dep === 'natacion' ? ZONAS_NAT : ZONAS;
const znDe = (dep, z) => (dep === 'natacion' ? Object.fromEntries(ZONAS_NAT) : ZN)[z];
// Busca en un trozo de texto la intensidad de natación (también acepta R0…R6 de Train2Go)
const ZNAT_RE = /(^|[^a-z0-9áéíóúñ])(suave|a[123]|pae|r400|r200|r100|fuerte)(?![a-z0-9áéíóúñ])/i;
const ZR_RE = /(^|[^a-z0-9])R\s?([0-6])(\s?\+|p\b)?(?!\d)/i;
function zonaNat(t) { let m = t.match(ZNAT_RE); if (m) return ZNAT_K[m[2].toLowerCase()]; m = t.match(ZR_RE); return m ? 'r' + m[2] + (m[3] ? 'p' : '') : ''; }
// Pinta un entreno de natación escrito tal cual (sangrías y líneas en blanco incluidas), con cada intensidad en su color
function txtHTML(texto, dep) {
  if (dep !== 'natacion') return `<pre class="txt">${esc(texto)}</pre>`;
  const pintar = (seg, z) => {
    if (!z) return esc(seg);
    const marcado = esc(seg).replace(/(^|[^a-z0-9áéíóúñ])(suave|a[123]|pae|r400|r200|r100|fuerte)(?![a-z0-9áéíóúñ])|(^|[^a-z0-9])(R\s?[0-6](?:\s?\+|p\b)?)(?!\d)/gi, (m, a, b, c, d) => `${a ?? c ?? ''}<b class="zp" data-z="${b ? ZNAT_K[b.toLowerCase()] : zonaNat(' ' + d) || z}">${b ? znDe('natacion', ZNAT_K[b.toLowerCase()]) : d}</b>`);
    return `<span class="zt" data-z="${z}">${marcado}</span>`;
  };
  const lineas = String(texto || '').split('\n').map(l => {
    const sang = l.match(/^\s*/)[0], cont = l.slice(sang.length);
    if (!cont) return '';
    const segs = cont.split(/(\s*\+\s*)/), zs = segs.map((x, i) => i % 2 ? '' : zonaNat(x) || zonaSin(x)), unicas = [...new Set(zs.filter(Boolean))];
    const comun = unicas.length === 1 ? unicas[0] : '';
    return esc(sang) + segs.map((x, i) => i % 2 ? esc(x) : pintar(x, zs[i] || comun)).join('');
  });
  return `<pre class="txt nat">${lineas.join('\n')}</pre>`;
}
// Palabras habituales en sets escritos (Instagram, Train2Go…) que equivalen a una intensidad; solo para colorear
function zonaSin(t) {
  t = String(t);
  if (/\b(?:400\s*(?:pace|rp|race\s*pace)|(?:rp|ritmo(?:\s+de)?)\s*400)\b/i.test(t)) return 'r3p';
  if (/\b(?:200\s*(?:pace|rp|race\s*pace)|(?:rp|ritmo(?:\s+de)?)\s*200)\b/i.test(t)) return 'r4';
  if (/\b(?:(?:50|100)\s*(?:pace|rp|race\s*pace)|(?:rp|ritmo(?:\s+de)?)\s*(?:50|100))\b/i.test(t)) return 'r5';
  if (/\b(fast|sprint|max(?:imo|imal|imum)?|all[\s-]*out|r[aá]pid[oa]s?|explosiv[oa]s?|spike)\b/i.test(t)) return 'r6';
  if (/\b(threshold|umbral|css)\b/i.test(t)) return 'r3';
  if (/\b(easy|recovery|recuperaci[oó]n|loosen|soltar|suelto|relajad[oa]|choice\s+easy|social)\b/i.test(t)) return 'r0';
  return '';
}
/* Saca solo la parte principal (main set) de un entreno escrito y lo deja maquetado: quita calentamiento y vuelta a la calma,
   parte en líneas lo que venía seguido con « · » y sangra lo que va dentro de cada «N x» / «3 Rounds». */
const SEC_RE = /^\s*[«"“]?\s*(warm[\s-]*up|calentamiento|pre[\s-]*set|activaci[oó]n|main[\s-]*set|serie principal|parte principal|cool[\s-]*down|warm[\s-]*down|swim[\s-]*down|loosen[\s-]*down|vuelta a la calma|enfriamiento)\b\s*[:\-–—]?\s*/i;
function mainSet(t) {
  const ls = String(t || '').replace(/\r/g, '').split('\n').flatMap(l => l.split(/\s+·\s+/)).map(l => l.replace(/\s+$/, ''));
  const tipo = l => { const m = l.match(SEC_RE); if (!m) return null; const w = m[1].toLowerCase(); return /main|principal/.test(w) ? 'main' : /up|calent|pre|activ/.test(w) ? 'up' : 'down'; };
  const tipos = ls.map(tipo), out = [];
  if (tipos.includes('main')) {
    let dentro = false;
    ls.forEach((l, i) => { if (tipos[i]) { dentro = tipos[i] === 'main'; const resto = l.replace(SEC_RE, ''); if (dentro && resto.trim() && !/^\d+\s*m?$/.test(resto.trim())) out.push(resto); return; } if (dentro) out.push(l); });
  } else if (tipos.some(Boolean)) {
    let fuera = null; // 'up' hasta la primera línea en blanco; 'down' hasta el final
    ls.forEach((l, i) => { if (tipos[i]) { fuera = tipos[i]; return; } if (fuera === 'up' && !l.trim()) { fuera = null; return; } if (!fuera) out.push(l); });
  } else out.push(...ls);
  // sangría dentro de las repeticiones de bloque
  const res = []; let sang = false;
  out.forEach(l => {
    const x = l.trim();
    if (!x) { sang = false; if (res.length && res.at(-1) !== '') res.push(''); return; }
    const cab = /^(\d+)\s*(x|×|rounds?|veces|vueltas|times|series)\b[^\d]*:?$/i.test(x) || /^\d+\s*[x×]\s*(\[[^\]]*\]|\([^)]*\))?\s*:?$/i.test(x) || (/:$/.test(x) && x.length < 40);
    if (cab) { if (res.length && res.at(-1) !== '' && sang) res.push(''); res.push(x); sang = true; return; }
    res.push(sang && !/^\s/.test(l) ? '    ' + x : l.replace(/^\s{5,}/, '    '));
  });
  while (res.length && res.at(-1) === '') res.pop();
  return res.join('\n');
}
const leyendaNat = () => `<details class="zley"><summary>Intensidades</summary><div>${ZONAS_NAT.map(([k, n]) => `<span><b class="zp" data-z="${k}">${n}</b> ${ZNAT_DESC[k]}</span>`).join('')}</div></details>`;
const ZCOEF = { r0: 1, r1: 2, r1p: 2, r2: 3, r3: 5, r3p: 9, r4: 15, r5: 40, r6: 50 };
const ZVEL = { r0: .41667, r1: .45, r1p: .48333, r2: .53333, r3: .61667, r3p: .66667, r4: .74667, r5: .86667, r6: 1 };
const ECO_DEP = { natacion: { f: .75, por: 100, r3: '1:37', u: '/100 m' }, carrera: { f: 1, por: 1000, r3: '4:19', u: '/km' } };
const conEcos = dep => !!ECO_DEP[dep];
const segs = t => { const m = String(t || '').trim().match(/^(\d+)(?:[:'´’](\d{1,2}))?/); return m ? +m[1] * 60 + (+m[2] || 0) : 0; };
const fmtMin = m => { const t = Math.round(m * 60), h = Math.floor(t / 3600), mi = Math.floor(t % 3600 / 60), s = t % 60; return h ? `${h} h ${String(mi).padStart(2, '0')}'` : s ? `${mi}'${String(s).padStart(2, '0')}"` : `${mi}'`; };
const fmtDist = m => m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`;
// Ritmo R3 de referencia: el de la sesión (deportista o grupo) o el de Train2Go
function ritmoR3(s, dep) {
  const q = s ? (s.grupo ? byId('grupo', s.grupo) : byId('deportista', s.dep)) : null;
  return segs(q?.ritmos?.[dep]) || r3Test(q, dep) || segs(ECO_DEP[dep].r3);
}
// R3 sacado del último test: el ritmo medio del 400 m (natación, por 100 m) o del 5 km (carrera, por km)
const TESTS = { nat400: { n: 'Natación · 400 m', dep: 'natacion', div: 4 }, run5k: { n: 'Carrera · 5 km', dep: 'carrera', div: 5 }, otro: { n: 'Otro test' } };
const tseg = t => { const m = String(t || '').trim().match(/^(?:(\d+):)?(\d+)[:'´’](\d{1,2})(?:[.,](\d))?$/) || String(t || '').trim().match(/^()(\d+)[:'´’](\d{1,2})()$/); if (!m) return 0; return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + (+m[4] || 0) / 10; };
function testR3(q, dep) { const t = (q?.tests || []).filter(x => TESTS[x.tipo]?.dep === dep && tseg(x.tiempo)).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0]; return t ? { t, s: Math.round(tseg(t.tiempo) / TESTS[t.tipo].div) } : null; }
const r3Test = (q, dep) => testR3(q, dep)?.s || 0;
const velZ = (dep, z, r3s) => ECO_DEP[dep].por / (r3s / 60) * ZVEL[z || 'r0'] / ZVEL.r3; // metros por minuto en la zona
function minutosDe(m, u, z, dep, r3s) {
  m = +String(m || '').replace(',', '.') || 0;
  if (u === 'min') return m; if (u === 'seg') return m / 60; if (u === 'h') return m * 60;
  const met = u === 'km' ? m * 1000 : m;
  return met / velZ(dep, z, r3s);
}
const metrosDe = (m, u, z, dep, r3s) => { m = +String(m || '').replace(',', '.') || 0; return u === 'km' ? m * 1000 : u === 'm' ? m : minutosDe(m, u, z, dep, r3s) * velZ(dep, z, r3s); };
// Una fila tipo Train2Go: rep × (actividad m1 u1 z1 + descanso m2 u2 z2)
function calcFila(f, dep, r3s) {
  const rep = Math.max(1, +f.rep || 1), z1 = f.z1 || 'r1', z2 = f.z2 || 'r0';
  const tw = f.rit && ['m', 'km'].includes(f.u1) ? metrosDe(f.m1, f.u1, z1, dep, r3s) / ECO_DEP[dep].por * f.rit / 60 : minutosDe(f.m1, f.u1, z1, dep, r3s), tr = f.m2 ? minutosDe(f.m2, f.u2 || 'seg', z2, dep, r3s) : 0;
  const metros = rep * (metrosDe(f.m1, f.u1, z1, dep, r3s) + (f.m2 && ['m', 'km'].includes(f.u2) ? metrosDe(f.m2, f.u2, z2, dep, r3s) : 0));
  const bruto = rep * (tw * ZCOEF[z1] + tr * ZCOEF[z2]);
  return { min: rep * (tw + tr), metros, aprox: !['m', 'km'].includes(f.u1), bruto, ecos: bruto * ECO_DEP[dep].f };
}
function calcSesion(s) {
  const dep = s.deporte; if (!conEcos(dep)) return null;
  const r3s = ritmoR3(s, dep); let min = 0, metros = 0, bruto = 0, n = 0;
  (s.bloques || []).forEach(b => (b.items || []).forEach(it => (it.filas || []).forEach(f => { if (!+f.m1) return; const c = calcFila(f, dep, r3s); min += c.min; metros += c.metros; bruto += c.bruto; n++; })));
  return n ? { min, metros, ecos: Math.round(bruto * ECO_DEP[dep].f), n } : null;
}
const ecoDe = s => calcSesion(s) || s.eco || null;
const ecoTxt = e => e ? [e.metros && fmtDist(e.metros), e.ecos && e.ecos + ' ECOs'].filter(Boolean).join(' · ') : '';
const txtFila = (f, dep) => `${+f.rep > 1 ? f.rep + ' × ' : ''}${f.m1}${{ m: ' m', km: ' km', min: "'", seg: '"', h: ' h' }[f.u1] || ''} ${znDe(dep, f.z1 || 'r1')}${+f.m2 ? ` · d/${f.m2}${{ m: ' m', km: ' km', min: "'", seg: '"' }[f.u2 || 'seg']}${f.z2 && f.z2 !== 'r0' ? ' ' + znDe(dep, f.z2) : ''}` : ''}`;

/* Lee la forma de escribir de Train2Go ("8x50 d/10\" R2", "3x(700 R1+ d/30\" + 4x25 R3+ d/15\")", "10' R0-R1",
   "2,5k R2 @4'35\"", "9x200:" con líneas "3 R1+ @4'20\" c/4'35\"") y la pasa a filas.
   Es una ayuda para no teclear: las filas se revisan y se corrigen a mano. */
function leerT2G(txt, dep, r3s) {
  const filas = [], ZRE = /(?:^|[^a-záéíóúñ])R\s?([0-6])(\s?\+|p\b)?/i, por = ECO_DEP[dep].por;
  const nat = dep === 'natacion';
  const zona = t => { if (nat) return zonaNat(t); const m = t.match(ZRE); return m ? 'r' + m[1] + (m[2] ? 'p' : '') : ''; };
  const hayZ = t => nat ? !!zonaNat(t) : ZRE.test(t);
  const suave = t => /(^|\s)(su|suave|f[aá]cil|soltar|trote|var|cal|calentar|relax|recuperaci[oó]n|rec|descanso|parado|pausa)(\s|$|[.,:])/i.test(t);
  const medida = t => {
    t = t.trim(); let m;
    if ((m = t.match(/^(\d+)\s*h\b/i))) return { m1: +m[1], u1: 'h' };
    if ((m = t.match(/^(\d+)\s*['’´]\s*(\d+)\s*(?:"|''|”)?/))) return { m1: +(+m[1] + +m[2] / 60).toFixed(2), u1: 'min' };
    if ((m = t.match(/^(\d+)\s*(?:['’´]|min\b)/i))) return { m1: +m[1], u1: 'min' };
    if ((m = t.match(/^(\d+)\s*(?:"|''|”|seg\b|s\b)/i))) return { m1: +m[1], u1: 'seg' };
    if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*km?\b/i)) && /k/i.test(m[0])) return { m1: +m[1].replace(',', '.'), u1: 'km' };
    if ((m = t.match(/^(\d+(?:\.\d{3})?)\s*m\b/i))) return { m1: +m[1].replace('.', ''), u1: 'm' };
    if ((m = t.match(/^(\d+)(?![\d'"’´”.,x×ºª°])/i)) && +m[1] >= (dep === 'natacion' ? 25 : 100)) return { m1: +m[1], u1: 'm' };
    return null;
  };
  const aSeg = t => { const x = medida(t); return x && { min: x.m1 * 60, seg: x.m1, h: x.m1 * 3600 }[x.u1]; };
  const minW = f => f.rit ? metrosDe(f.m1, f.u1, f.z1, dep, r3s) / por * f.rit / 60 : minutosDe(f.m1, f.u1, f.z1, dep, r3s);
  const parte = (p, mult, base) => {
    p = p.trim(); if (!p) return;
    let rep = 1, m = p.match(/^(\d+)\s*[x×]\s*/i);
    if (m) { rep = +m[1]; p = p.slice(m[0].length); }
    let med = medida(p);
    if (!med && base) { med = base; if (m) rep = rep; else { const n = p.match(/^(\d+)\s/); if (n) rep = +n[1]; } }
    if (!med) return;
    const f = { rep: rep * mult, ...med, z1: zona(p), m2: '', u2: 'seg', z2: 'r0' };
    if (!f.z1) { f.z1 = suave(p) ? 'r0' : 'r1'; f.sup = 1; }
    const at = p.match(/@\s*(\d+\s*['’´:]\s*\d+|\d+\s*["”])/);
    if (at && ['m', 'km'].includes(f.u1)) { const r = aSeg(at[1].replace(':', "'")); if (r) f.rit = r; }
    const d = p.match(/\bd\s*\/\s*(\d+\s*['’´]\s*\d+\s*(?:"|''|”)?|\d+\s*(?:"|''|”|['’´]|min\b|seg\b|s\b|m\b|km\b))\s*(R\s?[0-6](?:\s?\+|p\b)?)?/i);
    if (d) { const x = medida(d[1]); if (x) { f.m2 = x.m1; f.u2 = x.u1 === 'h' ? 'min' : x.u1; } if (d[2]) f.z2 = zona(' ' + d[2]); }
    const c = p.match(/\bc\s*\/\s*(\d+\s*['’´:]\s*\d+|\d+\s*["”'’´])/i);
    if (c && !d) { const ciclo = aSeg(c[1].replace(':', "'")); if (ciclo) { const r = Math.round(ciclo - minW(f) * 60); if (r > 0) { f.m2 = r; f.u2 = 'seg'; } } }
    filas.push(f);
  };
  const partes = (t, mult, base) => t.split(/\s\+\s/).forEach(p => parte(p, mult, base));
  let multBloque = 1, base = null;
  String(txt || '').split(/\n/).forEach(l => {
    const linea = l.trim().replace(/^[-–•·*]\s*/, '');
    if (!linea) { multBloque = 1; base = null; return; }
    if (/^\d+\s*[º°ª]/.test(linea) || /^\d+\s*[.)]\s/.test(linea)) return; // detalle de cada repetición ("1º: 50 puños…")
    let m = linea.match(/^(\d+)\s*(?:veces|bloques|rondas|series)\b[^:]*:?\s*$/i) || linea.match(/^(\d+)\s*[x×]\s*(?:\[[^\]\d]*\]|[a-záéíóúñ][a-záéíóúñ ]*)?\s*:?\s*$/i);
    const vz = linea.match(/\(\s*(\d+)\s*veces\s*\)/i); // "15': 30\" prog + 2'30\" R0 (5 veces)"
    if (vz && !m) { partes(linea.replace(vz[0], '').replace(/^[^:]{1,12}:\s*/, ''), +vz[1] * multBloque); return; }
    if (m) { multBloque = +m[1]; base = null; return; }
    if ((m = linea.match(/^(\d+)\s*[x×]\s*(\d+)\s*:\s*$/i))) { base = { m1: +m[2], u1: 'm', n: +m[1] }; return; } // "9x200:" y debajo "3 R1+ …"
    if ((m = linea.match(/^(\d+)\s*[x×]\s*\((.*)\)/i))) { partes(m[2], +m[1] * multBloque); return; }
    if ((m = linea.match(/^(\d+)\s*[x×]\s*([^:]*):\s*(.+)$/i)) && !/(@|[cd]\s*\/)\s*\d*$/i.test(m[2]) && hayZ(m[3]) && (m[2] = m[3])) { partes(m[2], +m[1] * multBloque); return; } // "2x6': 2' R1 + 2' R2…"
    if ((m = linea.match(/^([^:]{1,24}):\s*(.+)$/)) && !/(@|[cd]\s*\/)\s*\d*$/i.test(m[1])) { // no si los «:» son de una hora («@ 1:40») // "400: 75 cr + 25 otro estilo" o "15': 10' R0 + 5' R1"
      if (hayZ(m[2]) && /^\s*(\d+\s*[x×]\s*)?\d/.test(m[2])) { partes(m[2], multBloque); return; }
      if (medida(m[1].replace(/^\d+\s*[x×]\s*/i, '')) || /^\d+\s*[x×]/.test(m[1])) { parte(m[1] + ' ' + (zona(linea) ? znDe(dep, zona(linea)) : m[2]), multBloque); return; }
    }
    if (base && /^\d+\s/.test(linea) && !medida(linea.replace(/^\d+\s+/, ''))) { parte(linea, multBloque, base); return; }
    partes(linea, multBloque);
  });
  return filas;
}

/* ---------- Estado ---------- */
const S = {
  auth: LS.get('abs2-auth', null), // {modo:'coach', clave} | {modo:'dep', id, pin, nombre}
  datos: { deportista: [], grupo: [], ejercicio: [], sesion: [], plan: [], registro: [], referencia: [], actividad: [], mensaje: [], checkin: [], favorita: [] },
  lista: null, tab: null, ui: {}, guardando: 0,
};
const D = S.datos;
const byId = (t, id) => (D[t] || []).find(x => x.id === id);
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
const depsOrd = () => D.deportista.filter(d => !d.archivado).sort(porNombre);
const gruposOrd = () => [...D.grupo].sort(porNombre);
const miembros = g => g ? depsOrd().filter(d => (d.grupos || []).includes(g.id)) : [];
// Destinatarios de una sesión: un grupo ("g:ID") o un deportista ("ID")
function quien(k) {
  if (String(k || '').startsWith('g:')) { const g = byId('grupo', k.slice(2)); return g && { k, grupo: g, nombre: g.nombre, filtro: s => s.grupo === g.id, asig: { grupo: g.id } }; }
  const d = byId('deportista', k); return d && !d.archivado && { k, dep: d, nombre: d.nombre, filtro: s => s.dep === d.id, asig: { dep: d.id } };
}
const destinos = () => [...gruposOrd().map(g => quien('g:' + g.id)), ...depsOrd().map(d => quien(d.id))];
const chipsDestinos = (attr, sel) => { const gs = gruposOrd(), ds = depsOrd(); return `${gs.length ? `<div class="l">Grupos<div class="chips">${gs.map(g => `<button type="button" class="chip" ${attr}="g:${g.id}" aria-pressed="${sel === 'g:' + g.id}"><i style="--c:var(--accent)"></i>${esc(g.nombre)}</button>`).join('')}</div></div>` : ''}<div class="l">Deportistas<div class="chips">${ds.map(d => `<button type="button" class="chip" ${attr}="${d.id}" aria-pressed="${sel === d.id}">${esc(d.nombre)}</button>`).join('')}</div></div>`; };
// Registro de una sesión en el móvil del deportista: en las de grupo cada uno tiene el suyo
const rid = s => s.grupo ? `${s.id}~${S.yo?.id}` : s.id;
const regDe = s => s && byId('registro', rid(s));

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
  const qs = new URLSearchParams(location.search);
  if (qs.get('strava')) { setTimeout(() => toast(qs.get('strava') === 'ok' ? 'Strava conectado: tus entrenos llegarán solos' : 'No se ha conectado Strava', 3500), 900); history.replaceState(null, '', location.pathname + (qs.get('g') ? '?g=' + encodeURIComponent(qs.get('g')) : '')); }
  if (S.auth?.modo === 'coach') return entrarCoach(S.auth.clave, true);
  if (S.auth?.modo === 'dep') return entrarDep(S.auth.id, S.auth.pin, true);
  pantallaAcceso();
}
// Código del grupo: llega en el enlace (?g=CODIGO) y se recuerda en el móvil
function codigoG() {
  const u = new URLSearchParams(location.search).get('g');
  if (u) LS.set('abs2-g', u.trim().toUpperCase());
  return LS.get('abs2-g', '');
}
const codigoAlta = () => new URLSearchParams(location.search).get('alta') || '';
async function cargarLista() {
  const g = codigoG(), al = codigoAlta();
  try { const j = await api(al ? { a: 'lista', alta: al } : g ? { a: 'lista', g } : { a: 'lista' }); if (j.ok) { if (j.grupoMal) LS.del('abs2-g'); S.lista = j; LS.set('abs2-lista', j); } }
  catch (e) { S.lista = LS.get('abs2-lista', null); }
}
function salir() { LS.del('abs2-auth'); LS.del('abs2-cache'); S.auth = null; location.reload(); }

/* ---------- Alta con el enlace personal (…/?alta=CÓDIGO) ---------- */
function pantallaAlta(L) {
  const box = $('#lg'), pinIn = id => `<input class="f mono" id="${id}" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required>`;
  if (L.altaOk === false) { box.innerHTML = `<h2>Enlace no válido</h2><p class="muted">Este enlace ya no sirve. Pide a tu entrenador el enlace nuevo.</p><button class="btn ghost sm" id="yaT">Ya tengo perfil: entrar</button>`; $('#yaT').onclick = () => { S.verLista = true; history.replaceState(null, '', location.pathname); pantallaAcceso(); }; return; }
  box.innerHTML = `<h2>Crea tu perfil</h2><p class="muted small" style="margin-top:0">Tu entrenador te ha invitado a ABS Entrenamiento. Escribe tu nombre y elige un PIN de 4 cifras: es lo que usarás para entrar.</p>
    <form id="fa" class="list"><label class="l">Nombre y apellido<input class="f" id="an" autocomplete="name" required></label>
      <label class="l">Elige un PIN de 4 cifras${pinIn('ap')}</label><label class="l">Repite el PIN${pinIn('ap2')}</label>
      <div class="l">¿Qué entrenas?<div class="chips">${Object.entries(DEP).map(([k, v]) => `<button type="button" class="chip" data-adp="${k}" aria-pressed="false"><i style="--c:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
      <label class="l">¿Cuál es tu objetivo? (opcional)<input class="f" id="aob" placeholder="p. ej. aprobar la oposición, bajar de 1:05 en 100 libre…"></label>
      <label class="l">¿Tienes alguna lesión o molestia? (opcional)<input class="f" id="ale" placeholder="Si no, déjalo vacío"></label>
      <div class="l">¿Qué días puedes entrenar? (opcional)<div class="chips">${DIAS.map((n, i) => `<button type="button" class="chip" data-adia="${i + 1}" aria-pressed="false">${n}</button>`).join('')}</div></div>
      <button class="btn pri">Crear mi perfil y entrar</button><p id="erra" class="small" style="color:var(--bad)"></p></form>
    <button class="btn ghost sm" id="yaT" type="button">Ya tengo perfil: entrar</button>`;
  box.querySelectorAll('[data-adp],[data-adia]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
  $('#yaT').onclick = () => { S.verLista = true; pantallaAcceso(); };
  $('#fa').onsubmit = async e => {
    e.preventDefault();
    const nombre = $('#an').value.trim(), pin = $('#ap').value, err = $('#erra');
    if (nombre.split(/\s+/).length < 2) return err.textContent = 'Escribe tu nombre y apellido.';
    if (!/^\d{4}$/.test(pin)) return err.textContent = 'El PIN tiene que tener 4 cifras.';
    if (pin !== $('#ap2').value) return err.textContent = 'Los dos PIN no coinciden.';
    const sel = a => [...box.querySelectorAll(`[${a}][aria-pressed="true"]`)].map(b => b.getAttribute(a));
    err.textContent = 'Creando tu perfil…';
    try {
      const j = await api({ a: 'alta', alta: codigoAlta(), nombre, pin, deportes: sel('data-adp'), ficha: { objetivo: $('#aob').value.trim(), lesion: $('#ale').value.trim(), dias: sel('data-adia').map(Number) } });
      if (!j.ok) return err.textContent = ({ existe: 'Ya hay alguien con ese nombre. Pulsa «Ya tengo perfil» y entra con tu PIN.', enlace: 'Este enlace ya no sirve. Pide el nuevo a tu entrenador.', nombre: 'Escribe tu nombre y apellido.', pin: 'El PIN tiene que tener 4 cifras.' })[j.error] || 'No se pudo crear.';
      history.replaceState(null, '', location.pathname); S.lista = null; entrarDep(j.id, pin);
      setTimeout(() => toast('¡Listo! Tu entrenador ya puede prepararte el plan.', 4000), 1200);
    } catch (x) { err.textContent = 'No hay conexión.'; }
  };
}
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
  const deps = L.deportistas || [], G = L.grupo;
  if (codigoAlta() && !S.verLista) return pantallaAlta(L);
  const pinIn = (id, extra = '') => `<input class="f mono" id="${id}" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required ${extra}>`;
  box.innerHTML = `${G ? `<p class="small muted" style="margin:0">Grupo</p><h2 style="margin-top:0">${esc(G.nombre)}</h2>` : '<h2>Entra</h2>'}
    ${L.grupoMal ? '<p class="small" style="color:var(--bad)">Ese enlace de grupo no existe. Pide el enlace nuevo a tu entrenador.</p>' : ''}
    <form id="fd" class="list"><label class="l">Nombre y apellido<input class="f" id="dn" autocomplete="username" autocapitalize="words" required placeholder="Como te dio de alta tu entrenador"></label>
    <label class="l"><span id="pnL">PIN (4 cifras)</span>${pinIn('pn', 'autocomplete="current-password"')}</label>
    <label class="l hidden" id="pn2W">Es tu primera vez: repite el PIN para crearlo${pinIn('pn2')}</label>
    <button class="btn pri">Entrar</button><p id="err" class="small" style="color:var(--bad)"></p></form>
    ${G ? `<button class="btn ghost" id="vu" type="button">¿Es tu primera vez? Únete al grupo</button>
    <form id="fu" class="list hidden"><label class="l">Nombre y apellido<input class="f" id="un" autocomplete="name" required></label>
      <label class="l">Elige un PIN de 4 cifras (lo usarás para entrar)${pinIn('up')}</label>
      <label class="l">Repite el PIN${pinIn('up2')}</label>
      <label class="l">¿Cuál es tu objetivo? (opcional)<input class="f" id="uob" placeholder="p. ej. bajar de 1:05 en 100 libre, aprobar la oposición…"></label>
      <label class="l">¿Tienes alguna lesión o molestia? (opcional)<input class="f" id="ule" placeholder="Si no, déjalo vacío"></label>
      <div class="l">¿Qué días puedes entrenar? (opcional)<div class="chips">${DIAS.map((n, i) => `<button type="button" class="chip" data-udia="${i + 1}" aria-pressed="false">${n}</button>`).join('')}</div></div>
      <button class="btn pri">Unirme y entrar</button><p id="erru" class="small" style="color:var(--bad)"></p></form>` : ''}
    <button class="btn ghost sm" id="vc" type="button">Soy el entrenador →</button>`;
  $('#vc').onclick = () => pantallaAcceso('coach');
  $('#pn2').required = false;
  $('#fd').onsubmit = async e => {
    e.preventDefault();
    const nombre = $('#dn').value.trim(), pin = $('#pn').value, err = $('#err'), primera = !$('#pn2W').classList.contains('hidden');
    if (!/^\d{4}$/.test(pin)) return err.textContent = 'El PIN tiene que tener 4 cifras.';
    if (primera && pin !== $('#pn2').value) return err.textContent = 'Los dos PIN no coinciden.';
    err.textContent = 'Entrando…';
    try {
      const j = await api({ a: 'entrar', nombre, pin, pin2: primera ? $('#pn2').value : '' });
      if (j.ok) { err.textContent = ''; return entrarDep(j.id, pin); }
      if (j.error === 'nuevo') { $('#pn2W').classList.remove('hidden'); $('#pn2').required = true; $('#pn2').focus(); return err.textContent = ''; }
      err.textContent = ({ pin: 'Nombre o PIN incorrectos.', espera: 'Demasiados intentos. Espera 15 minutos o pide ayuda a tu entrenador.' })[j.error] || 'No se pudo entrar.';
    } catch (x) { err.textContent = 'No hay conexión.'; }
  };
  if (G) {
    $('#vu').onclick = () => { $('#fu').classList.toggle('hidden'); $('#un').focus(); };
    document.querySelectorAll('[data-udia]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
    $('#fu').onsubmit = async e => {
      e.preventDefault();
      const nombre = $('#un').value.trim(), pin = $('#up').value, err = $('#erru');
      if (!/^\d{4}$/.test(pin)) return err.textContent = 'El PIN tiene que tener 4 cifras.';
      if (pin !== $('#up2').value) return err.textContent = 'Los dos PIN no coinciden.';
      err.textContent = 'Entrando…';
      try {
        const ficha = { objetivo: $('#uob').value.trim(), lesion: $('#ule').value.trim(), dias: [...document.querySelectorAll('[data-udia][aria-pressed="true"]')].map(b => +b.dataset.udia) };
        const j = await api({ a: 'unirse', g: codigoG(), nombre, pin, ficha });
        if (!j.ok) return err.textContent = ({ existe: 'Ya hay alguien con ese nombre. Entra arriba con tu nombre y tu PIN.', grupo: 'Ese grupo ya no existe.', nombre: 'Escribe tu nombre y apellido.', pin: 'El PIN tiene que tener 4 cifras.' })[j.error] || 'No se pudo completar.';
        S.lista = null; entrarDep(j.id, pin);
      } catch (x) { err.textContent = 'No hay conexión.'; }
    };
  }
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
    // Series escritas (transcritas de las imágenes de Instagram): se añaden a su entrenamiento de referencia si no tiene una propia
    (j.datos.serie || []).forEach(x => { const r = D.referencia.find(d => d.id === x.id); if (r && !r.serie && x.serie) r.serie = x.serie; });
    // aplica lo que quedó pendiente en la cola
    colaG.forEach(c => c.op === 'guardar' ? c.docs.forEach(x => { const l = D[x.tipo]; const i = l.findIndex(d => d.id === x.doc.id); if (i >= 0) l[i] = x.doc; else l.push(x.doc); }) : c.items.forEach(x => D[x.tipo] = D[x.tipo].filter(d => d.id !== x.id)));
    LS.set('abs2-cache', { modo: 'coach', datos: D });
    migrarCats(); migrarBib(); migrarEstilos(); marcoCoach(); vaciarCola(); importarFastForce(); importarHyroxDavid(); stravaSyncCoach(); pushCoach();
  } catch (e) {
    if (cache?.modo === 'coach') { Object.assign(D, cache.datos); marcoCoach(); setSync('Sin conexión: trabajando con la última copia'); }
    else if (!silencioso) $('#err').textContent = 'No hay conexión con la hoja.';
  }
}
// Iconos de trazo (24×24) para la barra lateral / inferior
const ICO = {
  inicio: '<path d="M4 10.5L12 4l8 6.5V19a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  dep: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  grupos: '<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15 15c2.5-.4 4.6.8 5.4 3.6"/>',
  bib: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  planes: '<path d="M4 18h3v-6H4zM10.5 18h3V8h-3zM17 18h3V5h-3z"/>',
  bd: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  ia: '<path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  carga: '<path d="M3.5 18.5l5-6 4 3.5 7.5-9"/><path d="M15 7h5v5"/>',
  mas: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  hoy: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  semana: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  micarga: '<path d="M3.5 18.5l5-6 4 3.5 7.5-9"/><path d="M15 7h5v5"/>',
  salir: '<path d="M14 4.5h4a2 2 0 012 2v11a2 2 0 01-2 2h-4M10 16l4-4-4-4M14 12H3.5"/>',
};
const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k] || ''}</svg>`;
// Las cuatro primeras van siempre en la barra del móvil; el resto, en «Más»
const TABS_C = [['inicio', 'Inicio'], ['cal', 'Calendario'], ['dep', 'Deportistas'], ['grupos', 'Grupos'], ['bib', 'Biblioteca'], ['planes', 'Planes'], ['bd', 'Base de datos'], ['ia', 'Asistente IA'], ['carga', 'Estadísticas']];
function marcoCoach() {
  S.tab = S.tab || 'inicio';
  const tit = TABS_C.find(t => t[0] === S.tab)?.[1] || '';
  document.body.innerHTML = `<div class="shell"><aside class="side" aria-label="Secciones"><div class="logo">ABS</div>
      <nav>${TABS_C.map(([k, n], i) => `<button type="button" class="${i > 3 ? 'extra' : ''}" data-tab="${k}" aria-pressed="${S.tab === k}" title="${n}">${ico(k)}<span>${n}</span></button>`).join('')}
      <button type="button" class="mas" id="mas" aria-expanded="false" aria-pressed="${TABS_C.slice(4).some(t => t[0] === S.tab)}">${ico('mas')}<span>Más</span></button></nav>
      <button type="button" class="sout" id="out2" title="Salir">${ico('salir')}<span>Salir</span></button></aside>
    <div class="content"><header class="topbar"><div class="logo m">ABS</div><div class="grow"><small>Entrenador</small><h1>${tit}</h1></div><span id="sync" class="small muted">${esc(S.ui.sync || '')}</span><button class="btn sm ghost out" id="out">Salir</button></header>
    <main id="main"></main></div></div>
    <div class="masmenu" id="masmenu" hidden>${TABS_C.slice(4).map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${S.tab === k}">${ico(k)}${n}</button>`).join('')}</div>${dialogs()}`;
  $('#out').onclick = salir; $('#out2').onclick = salir;
  $('#mas').onclick = e => { e.stopPropagation(); const mm = $('#masmenu'); mm.hidden = !mm.hidden; $('#mas').setAttribute('aria-expanded', !mm.hidden); };
  if (!S.masL) { S.masL = 1; document.addEventListener('click', e => { const mm = $('#masmenu'); if (mm && !mm.hidden && !mm.contains(e.target)) mm.hidden = true; }); }
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; LS.set('abs2-tab', S.tab); S.ui.selOn = false; S.ui.sel?.clear(); $('#selbar')?.remove(); marcoCoach(); scrollTo(0, 0); });
  setupDialogs();
  renderCoach();
}
function renderCoach() {
  LS.set('abs2-cache', { modo: 'coach', datos: D });
  const m = $('#main');
  ({ inicio: vInicio, dep: vDeportistas, grupos: vGrupos, cal: vCalendario, planes: vPlanes, bib: vBiblioteca, bd: vBaseDatos, ia: vIA, carga: vCarga })[S.tab](m);
}

// Paso único: carga en el grupo Preparación física CDNS las 11 sesiones del mesociclo Fast Force (23/11–16/12),
// justo después del High Force. Solo añade las que faltan, así que no pisa nada.
async function importarFastForce() {
  if (LS.get('abs2-mig-fastforce', false)) return;
  try {
    const docs = await (await fetch('migracion-fast-force.json', { cache: 'no-store' })).json();
    const faltan = docs.filter(x => !byId(x.tipo, x.doc.id));
    if (faltan.length) { guardar(faltan); renderCoach(); toast('Fast Force cargado en Preparación física CDNS (23/11–16/12)', 3500); }
    LS.set('abs2-mig-fastforce', true);
  } catch (e) {}
}

// Paso único: carga en el perfil de David Lata las 24 sesiones de Hyrox en pareja (2/11–13/12), aunque coincidan
// con las de sus grupos. Si el perfil no existe, lo crea sin PIN (lo elige él la primera vez que entra).
async function importarHyroxDavid() {
  if (LS.get('abs2-mig-hyrox-dl', false)) return;
  try {
    const docs = await (await fetch('migracion-hyrox-david.json', { cache: 'no-store' })).json();
    const n = t => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const todos = D.deportista.filter(x => n(x.nombre) === 'david lata');
    let d = todos.find(x => !x.archivado) || todos[0];
    const nuevos = [];
    if (!d) { d = { id: 'd' + uid(), nombre: 'David Lata', pin: '', deportes: ['fuerza', 'carrera', 'otro'], grupos: [], notas: 'Hyrox 13 de diciembre (en pareja).' }; nuevos.push({ tipo: 'deportista', doc: d }); }
    const faltan = docs.filter(x => !byId('sesion', x.doc.id)).map(x => ({ tipo: 'sesion', doc: { ...x.doc, dep: d.id } }));
    if (nuevos.length || faltan.length) { guardar([...nuevos, ...faltan]); renderCoach(); toast('Hyrox cargado en el perfil de David Lata (2/11–13/12)', 3500); }
    LS.set('abs2-mig-hyrox-dl', true);
  } catch (e) {}
}

/* ---------- Inicio: quién entrena hoy y cómo va cada uno ---------- */
const sesionesDe = d => D.sesion.filter(s => s.dep === d.id || (s.grupo && (d.grupos || []).includes(s.grupo)));
function hechaPor(s, d) {
  const r = s.grupo ? D.registro.find(x => x.ses === s.id && x.dep === d.id) : byId('registro', s.id);
  if (r && ((r.rpe !== undefined && r.rpe !== '') || Object.values(r.sets || {}).some(v => v.ok || v.kg) || Object.values(r.hecho || {}).some(Boolean))) return 'reg';
  const tipos = Object.entries(DEP_STRAVA).filter(([, v]) => v === s.deporte).map(([k]) => k);
  return actividadesDe(d.id, s.fecha).some(a => tipos.includes(a.tipo)) ? 'strava' : '';
}
async function pushCoach() {
  try { const j = await api({ a: 'coach', op: 'pushEstado', clave: S.auth.clave }); if (j.ok) { S.pushE = j.estado; S.pushApp = j.estado.appId; if (S.pushApp) cargarPush('coach'); if (S.tab === 'inicio' && !$('#ed')?.open) renderCoach(); } } catch (e) {}
}
// Avisos del entrenador: mensajes nuevos, sesiones sin hacer, semanas sin plan, planes que se acaban y check-ins preocupantes
function avisosCoach() {
  const v = vistos(), off = LS.get('abs2-avisoOff', {}), hoy = key(today()), lunS = key(addDays(monday(today()), 7)), domS = key(addDays(monday(today()), 13)), hace7 = key(addDays(today(), -7));
  const out = [];
  depsOrd().filter(d => !d.archivado).forEach(d => {
    const ss = sesionesDe(d), nom = esc(d.nombre);
    // mensajes y comentarios sin leer (últimas 3 semanas)
    ss.filter(s => s.fecha >= key(addDays(today(), -21)) && s.fecha <= key(addDays(today(), 1))).forEach(s => {
      const r = s.grupo ? D.registro.find(x => x.ses === s.id && x.dep === d.id) : byId('registro', s.id);
      const nuevos = hilo(s, d, r).filter(m => m.de === 'dep' && !v[m.k]);
      if (nuevos.length) out.push({ k: 'msg|' + nuevos.map(m => m.k).join('§'), t: '💬', h: `<b>${nom}</b> ha escrito en «${esc(s.titulo || DEP[s.deporte]?.n)}» (${fmtD(parseKey(s.fecha))}): <i>${esc(nuevos.at(-1).txt.slice(0, 90))}</i>`, s: s.id, d: d.id });
    });
    const noHechas = ss.filter(s => s.fecha >= hace7 && s.fecha < hoy && !hechaPor(s, d));
    const kN = 'nh:' + d.id + ':' + noHechas.map(s => s.id).join(',');
    if (noHechas.length && !off[kN]) out.push({ k: kN, t: '⏳', h: `<b>${nom}</b> no ha registrado ${noHechas.length === 1 ? 'una sesión' : noHechas.length + ' sesiones'} en los últimos 7 días: ${noHechas.map(s => DIAS[(parseKey(s.fecha).getDay() + 6) % 7]).join(', ')}`, u: d.id });
    const activo = ss.some(s => s.fecha >= key(addDays(today(), -28)));
    const kNu = 'nuevo:' + d.id;
    if (/enlace/.test(d.alta || '') && !ss.length && !off[kNu]) out.push({ k: kNu, t: '👋', h: `<b>${nom}</b> se ha registrado y aún no tiene plan${(d.objetivos || [])[0]?.titulo ? ` · objetivo: <i>${esc(d.objetivos[0].titulo)}</i>` : ''}`, u: d.id, ficha: 1 });
    if (activo) {
      const prox = ss.filter(s => s.fecha >= lunS && s.fecha <= domS).length, ult = ss.map(s => s.fecha).sort().at(-1);
      const kS = 'sp:' + d.id + ':' + lunS;
      if (!prox && !off[kS]) out.push({ k: kS, t: '📅', h: `<b>${nom}</b> no tiene nada programado la semana que viene`, u: d.id });
      const kF = 'fin:' + d.id + ':' + ult;
      if (ult && ult >= hoy && ult <= key(addDays(today(), 10)) && !off[kF]) out.push({ k: kF, t: '🏁', h: `A <b>${nom}</b> se le acaba el plan el ${fmtD(parseKey(ult))}`, u: d.id });
    }
    const c = checkinDe(d.id, lunesDe()), kC = 'ck:' + d.id + ':' + lunesDe();
    if (checkinMal(c) && !off[kC]) out.push({ k: kC, t: '⚠️', h: `Check-in de <b>${nom}</b>: ${CHECK_P.map(([k, n]) => `${n.split(' ')[0].toLowerCase()} ${c[k]}`).join(' · ')}${c.nota ? ` · <i>${esc(c.nota.slice(0, 80))}</i>` : ''}`, u: d.id, ficha: 1 });
    const les = (d.lesiones || []).filter(l => !l.hasta || l.hasta >= hoy);
    const kL = 'les:' + d.id + ':' + les.map(l => l.id).join(',');
    if (les.length && ss.some(s => s.fecha >= hoy && s.fecha <= key(addDays(today(), 7))) && !off[kL]) out.push({ k: kL, t: '🩹', h: `<b>${nom}</b> tiene una molestia anotada: ${esc(les.map(l => l.desc).join(' · ').slice(0, 100))}`, u: d.id, ficha: 1 });
  });
  return out;
}
function vInicio(m) {
  const hoy = key(today());
  S.ui.semIni = S.ui.semIni || key(monday(today()));
  const lunD = parseKey(S.ui.semIni), lun = key(lunD), dom = key(addDays(lunD, 6)), estaSem = lun === key(monday(today()));
  const dias = Array.from({ length: 7 }, (_, i) => key(addDays(lunD, i)));
  const filas = depsOrd().filter(d => !d.archivado).map(d => {
    const ss = sesionesDe(d), sem = ss.filter(s => s.fecha >= lun && s.fecha <= dom);
    const hechas = sem.filter(s => hechaPor(s, d)).length;
    let ePlan = 0, eHecho = 0, mPlan = 0, mHecho = 0;
    sem.filter(s => conEcos(s.deporte)).forEach(s => { const x = realizado(s, d); if (x.plan) { ePlan += x.plan.ecos || 0; mPlan += x.plan.metros || 0; } eHecho += x.ecos || 0; mHecho += x.dist || 0; });
    return { d, sem, hechas, deHoy: ss.filter(s => s.fecha === hoy), pct: sem.length ? Math.round(hechas / sem.length * 100) : null, ePlan, eHecho, mPlan, mHecho, ck: checkinDe(d.id, lun) };
  }).filter(x => x.sem.length || x.d.grupos?.length || D.sesion.some(s => s.dep === x.d.id && s.fecha >= key(addDays(lunD, -28))))
    .sort((a, b) => (estaSem ? (b.deHoy.length > 0) - (a.deHoy.length > 0) : 0) || (b.sem.length > 0) - (a.sem.length > 0) || a.d.nombre.localeCompare(b.d.nombre, 'es'));
  const tot = filas.reduce((a, x) => a + x.sem.length, 0), hech = filas.reduce((a, x) => a + x.hechas, 0);
  const entrenanHoy = filas.filter(x => x.deHoy.length);
  const color = p => p === null ? 'var(--faint)' : p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--s-carrera)' : 'var(--bad)';
  const avs = avisosCoach();
  m.innerHTML = `${avisosBox()}${avs.length ? `<section class="card avisos"><div class="row"><h3 class="grow">Avisos <span class="small muted">· ${avs.length}</span></h3></div>${avs.map(a => `<div class="av"><span class="ico">${a.t}</span><button class="grow lnkb" ${a.s ? `data-avs="${a.s}|${a.d}"` : `data-avu="${a.u}" ${a.ficha ? 'data-avf="1"' : ''}`}>${a.h}</button><button class="icon" data-avx="${esc(a.k)}" aria-label="Quitar aviso">✕</button></div>`).join('')}</section>` : ''}
    <div class="stepper"><button id="iwP" aria-label="Semana anterior">‹</button><div class="d"><b>${fmtD(lunD)} – ${fmtD(addDays(lunD, 6))}${estaSem ? ' · esta semana' : ''}</b><span>${hech} de ${tot} sesiones hechas${tot ? ` (${Math.round(hech / tot * 100)} %)` : ''}${estaSem ? ` · hoy entrenan ${entrenanHoy.length}` : ''}</span></div><button id="iwN" aria-label="Semana siguiente">›</button></div>
    ${!estaSem ? '<button class="btn sm ghost" id="iwh" style="align-self:center">Volver a esta semana</button>' : ''}
    ${filas.length ? `<div class="list">${filas.map(x => `<div class="card urow2">
      <button class="uhead" data-u="${x.d.id}"><div class="avatar">${esc(ini(x.d.nombre))}</div>
        <div class="t"><b>${esc(x.d.nombre)}</b><small>${x.sem.length ? `${x.hechas} de ${x.sem.length} sesiones hechas` : 'Sin sesiones esta semana'}${estaSem && x.deHoy.length ? ` · <span class="hoyt">entrena hoy</span>` : ''}</small>
        ${x.ePlan ? `<small class="mono">ECOs ≈${x.eHecho} de ${x.ePlan}${x.mPlan ? ` · ${fmtDist(x.mHecho)} de ${fmtDist(x.mPlan)}` : ''}</small>` : ''}
        ${x.ck ? `<small>${checkinMal(x.ck) ? '⚠️' : '✓'} Check-in: ${CHECK_P.map(([k, n]) => n.split(' ')[0] + ' ' + x.ck[k]).join(' · ')}</small>` : ''}</div>
        <div class="pct" style="--c:${color(x.pct)};--p:${x.pct || 0}"><b>${x.pct === null ? '—' : x.pct + '%'}</b><small>${x.hechas}/${x.sem.length}</small></div></button>
      <div class="wk7">${dias.map((k, i) => { const l = x.sem.filter(s => s.fecha === k); return `<div class="d7 ${k === hoy ? 'hoy' : ''} ${k < hoy ? 'pas' : ''}"><span>${DIAS[i].slice(0, 1)}<b>${parseKey(k).getDate()}</b></span>${l.map(s => { const h = hechaPor(s, x.d); return `<button class="s7 ${h ? 'ok' : k < hoy ? 'no' : ''}" style="--c:${DEP[s.deporte]?.c}" data-vs="${s.id}|${x.d.id}" title="${esc(s.titulo || DEP[s.deporte]?.n)}">${h ? '✓ ' : ''}${esc(s.titulo || DEP[s.deporte]?.n)}</button>`; }).join('')}</div>`; }).join('')}</div></div>`).join('')}</div>`
      : '<div class="empty">No hay deportistas con sesiones esta semana.</div>'}
    <p class="small muted" style="margin:0">Una sesión cuenta como hecha si la ha registrado en la app (RPE, kilos o marcada) o si ese día tiene una actividad de Strava del mismo deporte. Toca un nombre para ir a su calendario y editar la semana, o una sesión para ver lo que hizo.</p>`;
  enlazarAvisos();
  m.querySelectorAll('[data-avx]').forEach(b => b.onclick = () => { const k = b.dataset.avx; if (k.startsWith('msg|')) marcarVisto(k.slice(4).split('§')); else { const o = LS.get('abs2-avisoOff', {}); o[k] = 1; LS.set('abs2-avisoOff', o); } vInicio(m); });
  m.querySelectorAll('[data-avs]').forEach(b => b.onclick = () => { const [sid, did] = b.dataset.avs.split('|'); verSesion(byId('sesion', sid), did); });
  m.querySelectorAll('[data-avu]').forEach(b => b.onclick = () => { if (b.dataset.avf) return editDeportista(byId('deportista', b.dataset.avu)); S.ui.dep = b.dataset.avu; S.ui.semana = key(monday(today())); S.tab = 'cal'; marcoCoach(); });
  $("#iwP").onclick = () => { S.ui.semIni = key(addDays(lunD, -7)); vInicio(m); };
  $("#iwN").onclick = () => { S.ui.semIni = key(addDays(lunD, 7)); vInicio(m); };
  const h = $('#iwh'); if (h) h.onclick = () => { S.ui.semIni = null; vInicio(m); };
  m.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { S.ui.dep = b.dataset.u; S.ui.semana = lun; S.tab = 'cal'; marcoCoach(); scrollTo(0, 0); });
  m.querySelectorAll('[data-vs]').forEach(b => b.onclick = () => { const [sid, did] = b.dataset.vs.split('|'); verSesion(byId('sesion', sid), did); });
}

/* ---------- Deportistas ---------- */
function vDeportistas(m) {
  const deps = D.deportista.filter(d => !d.archivado).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const arch = D.deportista.filter(d => d.archivado);
  m.innerHTML = `<div class="row"><h2 class="grow">Deportistas</h2><button class="btn pri" id="enA">🔗 Enlace para nuevos</button><label class="btn" style="cursor:pointer">Importar<input type="file" id="dimp" accept=".json,application/json" hidden></label><button class="btn" id="cfP">🔔 Avisos</button><button class="btn" id="t2gB" title="${esc(t2gUltima())}">🔄 Train2Go</button><button class="btn strava-b" id="cfS">${STRAVA_LOGO} Strava</button><button class="btn pri" id="nd">+ Nuevo deportista</button></div>
    ${deps.length ? `<div class="list">${deps.map(d => `<button class="item" data-d="${d.id}"><div class="avatar">${esc(ini(d.nombre))}</div><div class="t"><b>${esc(d.nombre)}</b><small>${esc([...(d.grupos || []).map(g => byId('grupo', g)?.nombre), d.grupo, (d.deportes || []).map(x => DEP[x]?.n).join(' · ')].filter(Boolean).join(' · '))}</small></div><span class="chip mono">${d.pin ? 'PIN ' + esc(d.pin) : 'Sin PIN'}</span></button>`).join('')}</div>` : '<div class="empty">Aún no hay deportistas. Crea el primero para asignarle sesiones o un plan.</div>'}
    ${arch.length ? `<details><summary class="muted small">Archivados (${arch.length})</summary><div class="list" style="margin-top:8px">${arch.map(d => `<button class="item" data-d="${d.id}"><div class="avatar">${esc(ini(d.nombre))}</div><div class="t"><b>${esc(d.nombre)}</b></div></button>`).join('')}</div></details>` : ''}`;
  $('#nd').onclick = () => editDeportista();
  $('#cfS').onclick = () => configStrava();
  $('#cfP').onclick = () => configAvisos();
  $('#t2gB').onclick = () => abrirT2G();
  $('#enA').onclick = () => enlaceAlta();
  $('#dimp').onchange = e => { const fi = e.target.files[0]; e.target.value = ''; if (fi) importarArchivo(fi); };
  m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => editDeportista(byId('deportista', b.dataset.d)));
}
// Ritmo R3 (umbral) para pasar distancias a tiempo y calcular ECOs
const ritmosEd = q => `<div class="l">Ritmo R3 (para calcular los ECOs)<div class="grid2">${Object.entries(ECO_DEP).map(([k, v]) => `<label class="l">${DEP[k].n} (${v.u.slice(1)})<input class="f mono" data-rit="${k}" value="${esc(q.ritmos?.[k] || '')}" placeholder="${v.r3}" inputmode="numeric"></label>`).join('')}</div><small class="muted">En minutos:segundos. Vacío = el de Train2Go por defecto.</small></div>`;
function leerRitmos(q) { q.ritmos = {}; document.querySelectorAll('[data-rit]').forEach(i => { const v = i.value.trim().replace(/['´’.]/, ':').replace(/"$/, ''); if (segs(v)) q.ritmos[i.dataset.rit] = v; }); if (!Object.keys(q.ritmos).length) delete q.ritmos; }
// Ficha: objetivos, marcas, tests, lesiones y disponibilidad (en un grupo, solo objetivos/competiciones)
function fichaEd(q, el, modo) {
  ['objetivos', 'marcas', 'tests', 'lesiones'].forEach(k => q[k] = q[k] || []);
  const hoy = key(today());
  const CAMP = {
    objetivos: [['tipo', 'Tipo', 'sel', [['principal', 'Principal'], ['intermedio', 'Intermedio']]], ['titulo', modo === 'grupo' ? 'Competición u objetivo' : 'Objetivo'], ['fecha', 'Fecha', 'date']],
    marcas: [['prueba', 'Prueba (p. ej. 100 libre)'], ['tiempo', 'Marca'], ['fecha', 'Fecha', 'date']],
    tests: [['tipo', 'Test', 'sel', Object.entries(TESTS).map(([k, v]) => [k, v.n])], ['tiempo', 'Tiempo (m:ss)'], ['fecha', 'Fecha', 'date'], ['nota', 'Nota']],
    lesiones: [['desc', 'Lesión o molestia'], ['desde', 'Desde', 'date'], ['hasta', 'Hasta (vacío = sigue)', 'date']],
  };
  const TIT = { objetivos: modo === 'grupo' ? 'Objetivos y competiciones del grupo' : 'Objetivos', marcas: 'Marcas personales', tests: 'Tests', lesiones: 'Salud: lesiones y molestias' };
  const sec = k => `<div class="fsec"><div class="row"><b class="grow">${TIT[k]}</b><button type="button" class="btn sm" data-fa2="${k}">+ Añadir</button></div>
    ${k === 'tests' ? `<small class="muted">El ritmo R3 sale solo del último test (400 m de natación → ritmo por 100 m; 5 km de carrera → ritmo por km) si no lo escribes arriba.${['natacion', 'carrera'].map(dp => { const t = testR3(q, dp); return t ? ` ${DEP[dp].n}: <b class="mono">${fmtMin(t.s / 60)}${ECO_DEP[dp].u}</b> (${fmtD(parseKey(t.t.fecha || hoy))}).` : ''; }).join('')}</small>` : ''}
    ${q[k].length ? `<div class="frows">${q[k].map((x, i) => `<div class="frow ${k === 'lesiones' && (!x.hasta || x.hasta >= hoy) ? 'activa' : ''}">${CAMP[k].map(([c, n, t, opts]) => t === 'sel' ? `<label>${n}<select data-fv2="${k}|${i}|${c}">${opts.map(([v, l]) => `<option value="${v}" ${x[c] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : `<label>${n}<input data-fv2="${k}|${i}|${c}" ${t === 'date' ? 'type="date"' : ''} value="${esc(x[c] || '')}"></label>`).join('')}<button type="button" class="icon" data-fd2="${k}|${i}" aria-label="Quitar">✕</button></div>`).join('')}</div>` : '<small class="muted">Nada anotado.</small>'}</div>`;
  const ckH = () => { const l = D.checkin.filter(c => c.dep === q.id).sort((a, b) => b.semana.localeCompare(a.semana)).slice(0, 8); return l.length ? `<div class="fsec"><b>Check-ins semanales</b><div class="scroll"><table class="data"><thead><tr><th>Semana</th>${CHECK_P.map(([, n]) => `<th class="n">${n.split(' ')[0]}</th>`).join('')}<th>Nota</th></tr></thead><tbody>${l.map(c => `<tr class="${checkinMal(c) ? 'mal' : ''}"><td>${fmtD(parseKey(c.semana))}</td>${CHECK_P.map(([k]) => `<td class="n">${esc(c[k])}</td>`).join('')}<td class="small">${esc(c.nota || '')}</td></tr>`).join('')}</tbody></table></div><small class="muted">Sueño y motivación: 5 es lo mejor. Fatiga, molestias y estrés: 5 es lo peor.</small></div>` : ''; };
  const pinta = () => {
    el.innerHTML = sec('objetivos') + (modo === 'dep' ? sec('tests') + sec('marcas') + sec('lesiones')
      + `<div class="fsec"><b>Días que puede entrenar</b><div class="chips">${DIAS.map((n, i) => `<button type="button" class="chip" data-fdia="${i + 1}" aria-pressed="${(q.disponibilidad || []).includes(i + 1)}">${n}</button>`).join('')}</div><small class="muted">Si no marcas ninguno, se entiende que todos.</small></div>` + ckH() : '');
    el.querySelectorAll('[data-fv2]').forEach(i => i.oninput = i.onchange = () => { const [k, n, c] = i.dataset.fv2.split('|'); q[k][+n][c] = i.value; });
    el.querySelectorAll('[data-fa2]').forEach(b => b.onclick = () => { const k = b.dataset.fa2; q[k].push({ id: uid(), ...(k === 'objetivos' ? { tipo: q.objetivos.some(o => o.tipo === 'principal') ? 'intermedio' : 'principal' } : k === 'tests' ? { tipo: 'nat400', fecha: hoy } : k === 'lesiones' ? { desde: hoy } : { fecha: hoy }) }); pinta(); });
    el.querySelectorAll('[data-fd2]').forEach(b => b.onclick = () => { const [k, n] = b.dataset.fd2.split('|'); q[k].splice(+n, 1); pinta(); });
    el.querySelectorAll('[data-fdia]').forEach(b => b.onclick = () => { const n = +b.dataset.fdia, l = new Set(q.disponibilidad || []); l.has(n) ? l.delete(n) : l.add(n); q.disponibilidad = [...l].sort(); b.setAttribute('aria-pressed', l.has(n)); });
    el.querySelectorAll('select[data-fv2$="|tipo"]').forEach(i => i.addEventListener('change', () => { if (i.dataset.fv2.startsWith('tests')) pinta(); }));
  };
  pinta();
}
const objetivosDe = Q => Q.grupo ? (Q.grupo.objetivos || []) : Q.dep ? [...(Q.dep.objetivos || []), ...(Q.dep.grupos || []).flatMap(g => byId('grupo', g)?.objetivos || [])] : [];
const ini = n => String(n).trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
function editDeportista(d) {
  const nuevo = !d;
  d = d ? clone(d) : { id: uid(), nombre: '', pin: String(Math.floor(1000 + Math.random() * 9000)), deportes: [], grupos: S.ui.dep?.startsWith('g:') ? [S.ui.dep.slice(2)] : [], notas: '' };
  d.grupos = d.grupos || [];
  abrirEd(nuevo ? 'Nuevo deportista' : d.nombre, `
    <div class="card list">
      <label class="l">Nombre y apellido<input class="f" id="dn" value="${esc(d.nombre)}" required></label>
      <label class="l">PIN de acceso (4 cifras)<input class="f mono" id="dpn" value="${esc(d.pin || '')}" inputmode="numeric" maxlength="4" style="max-width:160px"><small class="muted">Si lo dejas vacío, lo crea el deportista la primera vez que entra.</small></label>
      <div class="l">Grupos${D.grupo.length ? `<div class="chips">${gruposOrd().map(g => `<button type="button" class="chip" data-dgr="${g.id}" aria-pressed="${d.grupos.includes(g.id)}"><i style="--c:var(--accent)"></i>${esc(g.nombre)}</button>`).join('')}</div>` : '<small class="muted">Todavía no hay grupos. Créalos en la pestaña Grupos.</small>'}</div>
      ${d.grupo ? `<p class="small muted">Grupo anotado antes: ${esc(d.grupo)}</p>` : ''}
      <div class="l">Deportes<div class="chips">${Object.entries(DEP).map(([k, v]) => `<button type="button" class="chip" data-dp="${k}" aria-pressed="${(d.deportes || []).includes(k)}"><i style="--c:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
      ${ritmosEd(d)}
      <div id="ficha"></div>
      ${nuevo ? '' : `<div class="l">Strava<div class="row">${S.stravaE?.conectados?.[d.id] ? `<span class="chip"><i style="--c:#fc4c02"></i>Conectado${S.stravaE.conectados[d.id].nombre ? ' · ' + esc(S.stravaE.conectados[d.id].nombre) : ''}</span><button type="button" class="btn sm ghost danger" id="stOff">Desconectar</button>` : `<span class="small muted grow">Sin conectar.</span><button type="button" class="btn sm" id="stL">Copiar enlace para conectar</button>`}</div></div>`}
      <label class="l">Notas<textarea class="f" id="dno">${esc(d.notas || '')}</textarea></label>
    </div>
    ${nuevo ? '' : `<div class="row"><button class="btn danger" id="arc">${d.archivado ? 'Recuperar' : 'Archivar'}</button><button class="btn danger" id="del">Borrar deportista y sus sesiones</button></div>`}`,
    () => {
      d.nombre = $('#dn').value.trim(); d.pin = $('#dpn').value.trim(); d.notas = $('#dno').value; leerRitmos(d);
      if (!d.nombre) return toast('Falta el nombre'), false;
      if (d.pin && !/^\d{4}$/.test(d.pin)) return toast('El PIN debe tener 4 cifras'), false;
      guardar([{ tipo: 'deportista', doc: d }]); renderCoach();
    });
  fichaEd(d, $('#ficha'), 'dep');
  const stL = $('#stL'); if (stL) stL.onclick = async () => {
    if (!S.stravaE?.configurado) return toast('Primero activa Strava en Deportistas → Strava');
    const j = await api({ a: 'coach', op: 'stravaUrl', clave: S.auth.clave, dep: d.id }).catch(() => ({}));
    if (!j.ok) return toast('No se ha podido crear el enlace');
    try { await navigator.clipboard.writeText(j.url); toast('Enlace copiado: mándaselo a ' + d.nombre.split(' ')[0]); } catch (e) { prompt('Copia este enlace', j.url); }
  };
  const stOff = $('#stOff'); if (stOff) stOff.onclick = async () => { if (!confirm('¿Desconectar el Strava de ' + d.nombre + '?')) return; const j = await api({ a: 'coach', op: 'stravaDesconectar', clave: S.auth.clave, dep: d.id }).catch(() => ({})); if (j.ok) { S.stravaE = j.estado; toast('Desconectado'); cerrarEd(); renderCoach(); } };
  document.querySelectorAll('[data-dgr]').forEach(b => b.onclick = () => { const k = b.dataset.dgr; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); d.grupos = on ? [...new Set([...d.grupos, k])] : d.grupos.filter(x => x !== k); });
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

/* ---------- Grupos ---------- */
const enlaceG = g => `${location.origin}${location.pathname.replace(/index\.html$/, '')}?g=${encodeURIComponent(g.codigo)}`;
function codigoNuevo(nombre) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const base = norm(nombre || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  let c = base.length >= 3 && !D.grupo.some(g => g.codigo === base) ? base : '';
  while (!c || D.grupo.some(g => g.codigo === c)) c = Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  return c;
}
async function copiarEnlace(g) {
  const url = enlaceG(g);
  try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
  catch (e) { const i = document.querySelector(`[data-gl="${g.id}"]`); if (i) { i.select(); toast('Copia el enlace seleccionado'); } }
}
function vGrupos(m) {
  const gs = gruposOrd();
  m.innerHTML = `<div class="row"><h2 class="grow">Grupos</h2><button class="btn pri" id="ng">+ Nuevo grupo</button></div>
    <p class="muted small" style="margin-top:0">Todo el grupo recibe el mismo entrenamiento. Envía su enlace por WhatsApp: cada persona entra con su nombre y su PIN, y registra sus propios kilos, RPE y comentarios. Quien no esté en la lista puede unirse desde el enlace.</p>
    ${gs.length ? `<div class="list">${gs.map(g => { const n = miembros(g).length, ns = D.sesion.filter(x => x.grupo === g.id).length; return `<div class="card list">
      <div class="row"><div class="avatar">${esc(ini(g.nombre))}</div><div class="grow"><b>${esc(g.nombre)}</b><div class="small muted">${n} ${n === 1 ? 'persona' : 'personas'} · ${ns} ${ns === 1 ? 'sesión' : 'sesiones'} · código <span class="mono">${esc(g.codigo)}</span></div></div><button class="btn sm" data-ge="${g.id}">Editar</button></div>
      <div class="row"><input class="f mono grow" readonly value="${esc(enlaceG(g))}" aria-label="Enlace del grupo ${esc(g.nombre)}" data-gl="${g.id}" style="min-width:0"><button class="btn sm pri" data-gc="${g.id}">Copiar enlace</button>${navigator.share ? `<button class="btn sm" data-gs="${g.id}">Compartir</button>` : ''}<button class="btn sm ghost" data-gk="${g.id}">Calendario</button></div></div>`; }).join('')}</div>`
      : '<div class="empty">Aún no hay grupos. Crea uno, asígnale un plan o sesiones y envía el enlace.</div>'}`;
  $('#ng').onclick = () => editGrupo();
  m.querySelectorAll('[data-ge]').forEach(b => b.onclick = () => editGrupo(byId('grupo', b.dataset.ge)));
  m.querySelectorAll('[data-gc]').forEach(b => b.onclick = () => copiarEnlace(byId('grupo', b.dataset.gc)));
  m.querySelectorAll('[data-gs]').forEach(b => b.onclick = () => { const g = byId('grupo', b.dataset.gs); navigator.share({ title: g.nombre, text: `Entrenamiento de ${g.nombre}: entra con tu nombre y tu PIN`, url: enlaceG(g) }).catch(() => {}); });
  m.querySelectorAll('[data-gk]').forEach(b => b.onclick = () => { S.ui.dep = 'g:' + b.dataset.gk; S.tab = 'cal'; LS.set('abs2-tab', 'cal'); marcoCoach(); });
  m.querySelectorAll('[data-gl]').forEach(i => i.onfocus = () => i.select());
}
function editGrupo(g) {
  const nuevo = !g;
  g = g ? clone(g) : { id: uid(), nombre: '', codigo: '', deportes: [], notas: '' };
  const antes = new Set(miembros(byId('grupo', g.id)).map(d => d.id)), sel = new Set(antes);
  abrirEd(nuevo ? 'Nuevo grupo' : g.nombre, `<div class="card list">
      <label class="l">Nombre del grupo<input class="f" id="gn" value="${esc(g.nombre)}" placeholder="p. ej. Preparación física CDNS" required></label>
      <label class="l">Código del enlace<input class="f mono" id="gc" value="${esc(g.codigo)}" placeholder="Se crea solo" maxlength="12" style="max-width:200px;text-transform:uppercase"><small class="muted">Va al final del enlace (…?g=CÓDIGO). Si lo cambias, el enlace anterior deja de funcionar.</small></label>
      <div class="l">Deportes<div class="chips">${Object.entries(DEP).map(([k, v]) => `<button type="button" class="chip" data-gdp="${k}" aria-pressed="${(g.deportes || []).includes(k)}"><i style="--c:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
      <div class="l">Personas del grupo${depsOrd().length ? `<div class="chips">${depsOrd().map(d => `<button type="button" class="chip" data-gm="${d.id}" aria-pressed="${sel.has(d.id)}">${esc(d.nombre)}</button>`).join('')}</div>` : ''}<small class="muted">También se apuntan solas al entrar con el enlace.</small></div>
      ${ritmosEd(g)}
      <div id="ficha"></div>
      <label class="l">Notas<textarea class="f" id="gno">${esc(g.notas || '')}</textarea></label></div>
    ${nuevo ? '' : '<button class="btn danger" id="delg">Borrar grupo y sus sesiones</button>'}`,
    () => {
      g.nombre = $('#gn').value.trim();
      if (!g.nombre) return toast('Falta el nombre'), false;
      const c = $('#gc').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c && c.length < 3) return toast('El código necesita al menos 3 letras o números'), false;
      if (c && D.grupo.some(x => x.id !== g.id && x.codigo === c)) return toast('Ese código ya lo usa otro grupo'), false;
      g.codigo = c || codigoNuevo(g.nombre); g.notas = $('#gno').value; leerRitmos(g);
      const docs = [{ tipo: 'grupo', doc: g }];
      D.deportista.forEach(d => {
        const tenia = (d.grupos || []).includes(g.id), tiene = sel.has(d.id);
        if (tenia !== tiene) docs.push({ tipo: 'deportista', doc: { ...d, grupos: tiene ? [...(d.grupos || []), g.id] : d.grupos.filter(x => x !== g.id) } });
      });
      guardar(docs); renderCoach();
      if (nuevo) toast('Grupo creado: copia su enlace y envíalo');
    });
  fichaEd(g, $('#ficha'), 'grupo');
  document.querySelectorAll('[data-gdp]').forEach(b => b.onclick = () => { const k = b.dataset.gdp; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); g.deportes = on ? [...new Set([...(g.deportes || []), k])] : g.deportes.filter(x => x !== k); });
  document.querySelectorAll('[data-gm]').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); on ? sel.add(b.dataset.gm) : sel.delete(b.dataset.gm); });
  if (!nuevo) $('#delg').onclick = () => {
    const ses = D.sesion.filter(x => x.grupo === g.id);
    if (!confirm(`¿Borrar el grupo "${g.nombre}", sus ${ses.length} sesiones y lo que registraron en ellas? Las personas no se borran. No se puede deshacer.`)) return;
    const ids = new Set(ses.map(x => x.id));
    borrar([{ tipo: 'grupo', id: g.id }, ...ses.map(x => ({ tipo: 'sesion', id: x.id })), ...D.registro.filter(r => ids.has(r.ses)).map(r => ({ tipo: 'registro', id: r.id }))]);
    const docs = D.deportista.filter(d => (d.grupos || []).includes(g.id)).map(d => ({ tipo: 'deportista', doc: { ...d, grupos: d.grupos.filter(x => x !== g.id) } }));
    if (docs.length) guardar(docs);
    if (S.ui.dep === 'g:' + g.id) S.ui.dep = null;
    cerrarEd(); renderCoach();
  };
}

/* ---------- Calendario ---------- */
function selDep(id) {
  const gs = gruposOrd(), ds = depsOrd();
  const op = (k, n) => `<option value="${k}" ${k === S.ui.dep ? 'selected' : ''}>${esc(n)}</option>`;
  return `<select class="f" id="${id}" style="max-width:300px" aria-label="Grupo o deportista">${gs.length ? `<optgroup label="Grupos">${gs.map(g => op('g:' + g.id, g.nombre)).join('')}</optgroup>` : ''}<optgroup label="Deportistas">${ds.map(d => op(d.id, d.nombre)).join('')}</optgroup></select>`;
}
function vCalendario(m) {
  const ds = destinos();
  if (!ds.length) { m.innerHTML = '<div class="empty">Primero crea un grupo o un deportista.</div>'; return; }
  if (!quien(S.ui.dep)) S.ui.dep = ds[0].k;
  S.ui.semana = S.ui.semana || key(monday(new Date()));
  const lun = parseKey(S.ui.semana), Q = quien(S.ui.dep);
  const ses = D.sesion.filter(Q.filtro);
  const fin = addDays(lun, 6), deSemana = ses.filter(s => s.fecha >= key(lun) && s.fecha <= key(fin));
  const ecoSem = deSemana.reduce((a, s) => a + (conEcos(s.deporte) ? ecoDe(s)?.ecos || 0 : 0), 0);
  const resumen = (ecoSem ? `${ecoSem} ECOs previstos · ` : '') + (Q.grupo ? `${miembros(Q.grupo).length} personas · ${deSemana.length} ${deSemana.length === 1 ? 'sesión' : 'sesiones'}` : `Carga registrada: ${deSemana.reduce((a, s) => a + ua(byId('registro', s.id)), 0)} UA`);
  m.innerHTML = `<div class="row calbar">${selDep('cd')}<div class="row grow" style="justify-content:flex-end">${Q.grupo ? '<button class="btn sm" id="ce">Copiar enlace</button>' : ''}<button class="btn sm" id="ipl">📋 De la planificación</button><button class="btn sm" id="inat">🏊 Pegar natación</button><button class="btn sm" id="ap">Asignar plan</button><button class="btn sm" id="cs">Copiar semana a…</button><button class="btn sm ${S.ui.selOn ? 'pri' : ''}" id="selB">${S.ui.selOn ? 'Terminar selección' : 'Seleccionar'}</button></div></div>
    ${fichaAviso(Q)}
    ${barraTemporada(lun, ses, objetivosDe(Q))}
    <div class="stepper"><button id="pw" aria-label="Semana anterior">‹</button><div class="d"><b>${fmtD(lun)} – ${fmtD(fin)}</b><span>${resumen}</span></div><button id="nw" aria-label="Semana siguiente">›</button></div>
    <div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = addDays(lun, i), k = key(d), lista = ses.filter(s => s.fecha === k);
      const nod = Q.dep?.disponibilidad?.length && !Q.dep.disponibilidad.includes(i + 1), obj = objetivosDe(Q).filter(o => o.fecha === k);
      return `<div class="wday ${k === key(today()) ? 'today' : ''} ${nod ? 'nodisp' : ''}" data-drop="${k}"><div class="dh"><span>${DIAS[i]}${nod ? ' · <i>no disponible</i>' : ''}</span><b>${d.getDate()}</b></div>${obj.map(o => `<div class="objd">🏁 ${esc(o.titulo || 'Objetivo')}</div>`).join('')}
        ${lista.map(s => scard(s)).join('')}${Q.dep ? actividadesDe(Q.dep.id, k).map(actMini).join('') : ''}<button class="add" data-add="${k}">+ Sesión</button></div>`;
    }).join('')}</div>`;
  $('#cd').onchange = e => { S.ui.dep = e.target.value; renderCoach(); };
  $('#pw').onclick = () => { S.ui.semana = key(addDays(lun, -7)); renderCoach(); };
  $('#nw').onclick = () => { S.ui.semana = key(addDays(lun, 7)); renderCoach(); };
  $('#ap').onclick = () => asignarPlan();
  $('#inat').onclick = () => importarNatacion(Q.k);
  $('#ipl').onclick = () => importarPlani(Q.k);
  $('#cs').onclick = () => copiarSemana(lun, Q);
  const ce = $('#ce'); if (ce) ce.onclick = () => copiarEnlace(Q.grupo);
  m.querySelectorAll('[data-add]').forEach(b => b.onclick = () => nuevaSesion(b.dataset.add));
  m.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => { S.ui.semana = b.dataset.wk; renderCoach(); });
  const wa = m.querySelector('.season [aria-current]'); if (wa) wa.scrollIntoView({ block: 'nearest', inline: 'center' });
  S.ui.sel = S.ui.sel || new Set();
  m.querySelectorAll('[data-s]').forEach(b => {
    if (S.ui.sel.has(b.dataset.s)) b.classList.add('sel');
    b.onclick = () => { if (!S.ui.selOn) return verSesion(byId('sesion', b.dataset.s)); S.ui.sel.has(b.dataset.s) ? S.ui.sel.delete(b.dataset.s) : S.ui.sel.add(b.dataset.s); b.classList.toggle('sel'); barraSel(); };
    // Arrastrar una sesión a otro día la mueve; con Ctrl (o Alt) pulsado, la copia
    b.draggable = true;
    b.ondragstart = e => { e.dataTransfer.setData('text/plain', b.dataset.s); e.dataTransfer.effectAllowed = 'copyMove'; b.classList.add('drag'); };
    b.ondragend = () => b.classList.remove('drag');
  });
  m.querySelectorAll('[data-drop]').forEach(w => {
    w.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move'; w.classList.add('over'); };
    w.ondragleave = () => w.classList.remove('over');
    w.ondrop = e => {
      e.preventDefault(); w.classList.remove('over');
      const s0 = byId('sesion', e.dataTransfer.getData('text/plain')); if (!s0 || s0.fecha === w.dataset.drop && !(e.ctrlKey || e.altKey)) return;
      if (e.ctrlKey || e.altKey) { const n = clone(s0); n.id = uid(); n.fecha = w.dataset.drop; guardar([{ tipo: 'sesion', doc: n }]); toast('Sesión copiada al ' + fmtD(parseKey(n.fecha))); }
      else { guardar([{ tipo: 'sesion', doc: { ...s0, fecha: w.dataset.drop } }]); toast('Sesión movida al ' + fmtD(parseKey(w.dataset.drop))); }
      renderCoach();
    };
  });
  $('#selB').onclick = () => { S.ui.selOn = !S.ui.selOn; if (!S.ui.selOn) S.ui.sel.clear(); renderCoach(); };
  barraSel();
}
// Barra de acciones para varias sesiones seleccionadas (mover, copiar o borrar de golpe)
function barraSel() {
  let bar = $('#selbar');
  if (!S.ui.selOn) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'selbar'; bar.className = 'selbar'; document.body.appendChild(bar); }
  const n = S.ui.sel.size;
  bar.innerHTML = `<b>${n ? n + (n === 1 ? ' sesión' : ' sesiones') : 'Toca las sesiones'}</b><button class="btn sm" id="sbM" ${n ? '' : 'disabled'}>Mover…</button><button class="btn sm" id="sbC" ${n ? '' : 'disabled'}>Copiar…</button><button class="btn sm danger" id="sbB" ${n ? '' : 'disabled'}>Borrar</button><button class="btn sm ghost" id="sbX">Cancelar</button>`;
  const sel = () => [...S.ui.sel].map(id => byId('sesion', id)).filter(Boolean);
  $('#sbX').onclick = () => { S.ui.selOn = false; S.ui.sel.clear(); renderCoach(); };
  $('#sbB').onclick = () => { const l = sel(); if (!confirm(`¿Borrar ${l.length} ${l.length === 1 ? 'sesión' : 'sesiones'} y lo que se registró en ellas?`)) return; const ids = new Set(l.map(x => x.id)); borrar([...l.map(x => ({ tipo: 'sesion', id: x.id })), ...D.registro.filter(r => ids.has(r.ses) || ids.has(r.id)).map(r => ({ tipo: 'registro', id: r.id }))]); S.ui.sel.clear(); renderCoach(); toast('Borradas'); };
  const mover = copia => {
    const l = sel(), min = l.map(x => x.fecha).sort()[0];
    abrirEd(copia ? 'Copiar sesiones' : 'Mover sesiones', `<div class="card list"><p class="muted" style="margin:0">${l.length} sesiones, del ${fmtD(parseKey(min))} al ${fmtD(parseKey(l.map(x => x.fecha).sort().at(-1)))}. Se mantienen los días entre ellas.</p>
      <label class="l">La primera pasa al día<input class="f" type="date" id="smF" value="${min}"></label>${copia ? chipsDestinos('data-smd', S.ui.dep) : ''}</div>`, () => {
      const off = Math.round((parseKey($('#smF').value) - parseKey(min)) / 864e5);
      if (copia) {
        const dest = [...document.querySelectorAll('[data-smd][aria-pressed="true"]')].map(b => b.dataset.smd); if (!dest.length) return toast('Elige a quién copiarlas'), false;
        const docs = []; dest.forEach(k => l.forEach(x => { const n = clone(x); delete n.dep; delete n.grupo; Object.assign(n, { id: uid(), ...quien(k).asig, fecha: key(addDays(parseKey(x.fecha), off)) }); docs.push({ tipo: 'sesion', doc: n }); }));
        guardar(docs); toast(`${docs.length} sesiones copiadas`);
      } else { if (!off) return; guardar(l.map(x => ({ tipo: 'sesion', doc: { ...x, fecha: key(addDays(parseKey(x.fecha), off)) } }))); toast('Sesiones movidas'); }
      S.ui.sel.clear(); S.ui.selOn = false; renderCoach();
    }, copia ? 'Copiar' : 'Mover');
    document.querySelectorAll('[data-smd]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
  };
  $('#sbM').onclick = () => mover(false); $('#sbC').onclick = () => mover(true);
}
// Temporada: 20 semanas alrededor de la que se ve, coloreadas por el plan (fase) de sus sesiones
const FASE_C = ['#8fd0c9', '#b9a6ee', '#f2b27c', '#9cc3f0', '#e9a2b8', '#b5d98f', '#f0d27a'];
function fichaAviso(Q) {
  const hoy = key(today()), x = [];
  if (Q.dep) (Q.dep.lesiones || []).filter(l => !l.hasta || l.hasta >= hoy).forEach(l => x.push(`🩹 <b>${esc(l.desc || 'Molestia')}</b> desde ${l.desde ? fmtD(parseKey(l.desde)) : '—'}`));
  const prox = objetivosDe(Q).filter(o => o.fecha && o.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  if (prox) { const dd = Math.round((parseKey(prox.fecha) - today()) / 864e5); x.push(`🏁 <b>${esc(prox.titulo || 'Objetivo')}</b> el ${fmtD(parseKey(prox.fecha))} · faltan ${dd} días (${Math.ceil(dd / 7)} semanas)`); }
  if (Q.dep?.disponibilidad?.length) x.push(`📅 Puede entrenar: ${Q.dep.disponibilidad.map(n => DIAS[n - 1]).join(', ')}`);
  return x.length ? `<div class="fav">${x.map(t => `<span>${t}</span>`).join('')}</div>` : '';
}
function barraTemporada(lun, ses, objs = []) {
  const ini = addDays(lun, -8 * 7), sem = Array.from({ length: 20 }, (_, i) => addDays(ini, i * 7));
  const color = id => FASE_C[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % FASE_C.length];
  const cel = sem.map(l => {
    const k0 = key(l), k1 = key(addDays(l, 6)), ss = ses.filter(s => s.fecha >= k0 && s.fecha <= k1);
    const pid = ss.map(s => s.plan?.id).find(Boolean), p = pid && byId('plan', pid);
    const eco = ss.reduce((a, s) => a + (conEcos(s.deporte) ? ecoDe(s)?.ecos || 0 : 0), 0);
    const ob = objs.filter(o => o.fecha && o.fecha >= k0 && o.fecha <= k1);
    return { k0, l, n: ss.length, p, c: p ? color(p.id) : ss.length ? '#d9dee2' : '', eco, act: k0 === key(lun), hoy: k0 === key(monday(today())), ob };
  });
  // Agrupa semanas seguidas del mismo plan en una franja con su nombre
  const fr = []; cel.forEach(c => { const u = fr.at(-1); if (u && u.p === c.p) u.n++; else fr.push({ p: c.p, c: c.c, n: 1 }); });
  return `<div class="season card"><div class="sh"><b>Temporada</b><small class="muted">Cada color es un plan · toca una semana para ir a ella</small></div><div class="scroll"><div class="sgrid" style="--n:${cel.length}">
    ${fr.map(f => `<div class="fase" style="grid-column:span ${f.n};--c:${f.c || 'transparent'}">${f.p ? esc(f.p.nombre) : ''}</div>`).join('')}
    ${cel.map(c => `<button type="button" class="wk ${c.hoy ? 'hoy' : ''}" data-wk="${c.k0}" ${c.act ? 'aria-current="true"' : ''} title="${fmtD(c.l)}${c.ob.map(o => ' · 🏁 ' + esc(o.titulo || '')).join('')}"><span>${c.ob.length ? '🏁 ' : ''}${c.l.getDate()}/${c.l.getMonth() + 1}</span><i style="--h:${Math.min(100, c.n * 18)}%;--c:${c.c || 'var(--line)'}"></i><small>${c.eco ? c.eco : c.n ? c.n + ' s' : ''}</small></button>`).join('')}</div></div></div>`;
}
function scard(s, plan) {
  const dep = S.auth?.modo === 'dep';
  const r = plan ? null : dep ? regDe(s) : s.grupo ? null : byId('registro', s.id);
  const nReg = !plan && !dep && s.grupo ? D.registro.filter(x => x.ses === s.id && (ua(x) || Object.values(x.sets || {}).some(v => v.ok || v.kg))).length : 0;
  return `<button class="scard" style="--c:${DEP[s.deporte]?.c || 'var(--muted)'}" data-s="${s.id}" ${plan ? `data-ps="${s.id}"` : ''}><b>${esc(s.titulo || DEP[s.deporte]?.n)}</b><small>${esc(DEP[s.deporte]?.n || '')}${s.duracion ? ` · ${s.duracion}'` : ''}</small>${conEcos(s.deporte) && ecoDe(s) ? `<small class="mono">${ecoTxt(ecoDe(s))}</small>` : ''}${r && r.rpe ? `<small class="ok">✓ RPE ${r.rpe} · ${ua(r)} UA</small>` : ''}${!plan && !dep && r ? (() => { const nc = Object.values(r.coment || {}).filter(Boolean).length + (r.nota ? 1 : 0), nk = Object.values(r.sets || {}).filter(v => v.kg).length; return nk || nc ? `<small class="ok">${nk ? `✓ ${nk} series con kilos` : ''}${nk && nc ? ' · ' : ''}${nc ? `💬 ${nc}` : ''}</small>` : ''; })() : ''}${nReg ? `<small class="ok">✓ ${nReg} de ${miembros(byId('grupo', s.grupo)).length} han registrado</small>` : ''}</button>`;
}
function nuevaSesion(fecha) {
  const Q = quien(S.ui.dep), dep = Q.dep || Q.grupo;
  const tipos = dep.deportes?.length ? dep.deportes : Object.keys(DEP);
  abrirEd('Nueva sesión', `<div class="card list"><p class="muted">${fmtLong(parseKey(fecha))} · ${Q.grupo ? 'Grupo ' : ''}${esc(dep.nombre)}</p>
    <div class="l">Deporte<div class="chips">${Object.entries(DEP).map(([k, v]) => `<button type="button" class="chip" data-nd="${k}" aria-pressed="${k === tipos[0]}"><i style="--c:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
    ${D.favorita.length ? `<label class="l">O empieza desde una favorita<select class="f" id="deFav"><option value="">—</option>${D.favorita.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(f => `<option value="${f.id}">★ ${esc(f.nombre)} · ${esc(DEP[f.ses?.deporte]?.n || '')}</option>`).join('')}</select></label>` : ''}
    <label class="l">O copia una sesión de un plan<select class="f" id="dePlan"><option value="">Sesión en blanco</option>${D.plan.map(p => `<optgroup label="${esc(p.nombre)}">${(p.sesiones || []).map(s => `<option value="${p.id}|${s.id}">S${s.semana} ${DIAS[s.dia - 1]} · ${esc(s.titulo || DEP[s.deporte]?.n)}</option>`).join('')}</optgroup>`).join('')}</select></label></div>`,
    () => {
      const v = $('#dePlan').value, fv = $('#deFav')?.value;
      let s;
      if (fv) s = clone(byId('favorita', fv).ses);
      else if (v) { const [pid, sid] = v.split('|'); s = clone(byId('plan', pid).sesiones.find(x => x.id === sid)); delete s.semana; delete s.dia; }
      else s = { titulo: '', deporte: document.querySelector('[data-nd][aria-pressed="true"]').dataset.nd, duracion: '', bloques: [] };
      delete s.dep; delete s.grupo; Object.assign(s, { id: uid(), ...Q.asig, fecha });
      setTimeout(() => editSesion(s, true), 0);
    }, 'Continuar');
  document.querySelectorAll('[data-nd]').forEach(b => b.onclick = () => document.querySelectorAll('[data-nd]').forEach(x => x.setAttribute('aria-pressed', x === b)));
}
/* ---------- Importar entrenos de natación escritos ----------
   Se pega el texto (uno o varios días). Cada día empieza con una línea de fecha: «Lunes 9/11», «9/11», «09-11-2026»
   o «2026-11-09»; lo que va detrás de la fecha es el título. Si no hay ninguna fecha, todo va al día elegido. */
const DIA_RE = /^\s*((?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom)[a-záéíóú]*\.?,?\s+)?(\d{1,2})\s*([\/.-])\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2,4}))?\s*(?:[:·–—-]\s*)?(.*)$/i;
const ISO_RE = /^\s*(\d{4})-(\d{2})-(\d{2})\s*(?:[:·–—-]\s*)?(.*)$/;
function fechaDe(linea) {
  let m = linea.match(ISO_RE), y, mo, d, resto;
  if (m) [, y, mo, d, resto] = m.map((x, i) => i && i < 4 ? +x : x);
  else if ((m = linea.match(DIA_RE)) && !/^\s*\d+\s*[x×]/i.test(linea)) {
    d = +m[2]; mo = +m[4]; resto = m[6];
    if (!m[1] && !m[5] && m[3] !== '/') return null; // «1-2 suave» no es una fecha
    if (/^\s*\d/.test(resto || '')) return null; // «1/2 50 …» tampoco
    y = m[5] ? (+m[5] < 100 ? 2000 + +m[5] : +m[5]) : null;
    if (!y) { const h = today(); y = h.getFullYear(); if (mo < h.getMonth() + 1 - 6) y++; else if (mo > h.getMonth() + 1 + 6) y--; }
  } else return null;
  const f = new Date(y, mo - 1, d);
  if (f.getMonth() !== mo - 1 || f.getDate() !== d) return null;
  return { fecha: key(f), titulo: String(resto || '').trim() };
}
function partirNatacion(txt, fechaPorDefecto) {
  const dias = []; let cur = null;
  String(txt || '').replace(/\r/g, '').split('\n').forEach(l => {
    const f = l.trim() && l.trim().length <= 60 ? fechaDe(l) : null;
    if (f) { cur = { ...f, lineas: [] }; dias.push(cur); return; }
    if (!cur) { if (!l.trim()) return; cur = { fecha: fechaPorDefecto, titulo: '', lineas: [] }; dias.push(cur); }
    cur.lineas.push(l.replace(/\t/g, '    '));
  });
  return dias.map(d => {
    while (d.lineas.length && !d.lineas[0].trim()) d.lineas.shift();
    while (d.lineas.length && !d.lineas.at(-1).trim()) d.lineas.pop();
    const sang = Math.min(...d.lineas.filter(x => x.trim()).map(x => x.match(/^ */)[0].length), 99);
    return { ...d, texto: d.lineas.map(x => x.slice(Math.min(sang, x.match(/^ */)[0].length))).join('\n') };
  }).filter(d => d.texto.trim());
}
function importarNatacion(k) {
  const ds = [...gruposOrd().map(g => ['g:' + g.id, 'Grupo · ' + g.nombre]), ...depsOrd().map(d => [d.id, d.nombre])];
  abrirEd('Importar natación', `<div class="card list">
    <label class="l">Para<select class="f" id="inQ">${opts(ds, k)}</select><small class="muted">Si es un grupo, lo ve cada persona del grupo en Hoy y en Programa. Para un grupo nuevo, créalo antes en Grupos.</small></label>
    <label class="l">Entrenos (pega uno o varios días)<textarea class="f mono" id="inT" rows="14" placeholder="Lunes 9/11 · Aeróbico\n300 Suave\n6x50 @ :50 A1\n\n6x [Patada]\n    100 @ 1:40 A1\n    3x25 @ :30 R100\n\nMartes 10/11\n…"></textarea>
    <small class="muted">Cada día empieza con su fecha en una línea (Lunes 9/11, 9/11 o 2026-11-09); lo que pongas detrás es el título. Se respetan las líneas en blanco y las sangrías. Intensidades: Suave, A1, A2, A3, PAE, R400, R200, R100, Fuerte.</small></label>
    <label class="l">Día si el texto no lleva fecha<input class="f" type="date" id="inF" value="${key(today())}" style="max-width:200px"></label>
    <label class="row small"><input type="checkbox" id="inR"> Sustituir la sesión de natación que ya haya ese día</label>
    ${leyendaNat()}
    <div id="inP"></div></div>`, () => {
    const Q = quien($('#inQ').value), dias = partirNatacion($('#inT').value, $('#inF').value);
    if (!dias.length) return toast('Pega al menos un entreno'), false;
    const ya = D.sesion.filter(s => Q.filtro(s) && s.deporte === 'natacion'), docs = [], fuera = [];
    dias.forEach(d => {
      const s = { id: uid(), ...Q.asig, fecha: d.fecha, titulo: d.titulo || 'Natación', deporte: 'natacion', duracion: '', origen: 'Importado (texto)', bloques: [{ nombre: d.titulo || 'Entrenamiento', items: [{ nombre: '', texto: d.texto }] }] };
      const fs = leerT2G(d.texto, 'natacion', ritmoR3(s, 'natacion')).filter(f => +f.m1); if (fs.length) s.bloques[0].items[0].filas = fs;
      if ($('#inR').checked) ya.filter(x => x.fecha === d.fecha).forEach(x => fuera.push({ tipo: 'sesion', id: x.id }));
      docs.push({ tipo: 'sesion', doc: s });
    });
    if (fuera.length) borrar(fuera);
    guardar(docs); S.ui.dep = Q.k; S.ui.semana = key(monday(parseKey(dias[0].fecha))); renderCoach();
    toast(`${docs.length} ${docs.length === 1 ? 'sesión importada' : 'sesiones importadas'} para ${Q.nombre}`);
  }, 'Importar');
  const prev = () => {
    const Q = quien($('#inQ').value), dias = partirNatacion($('#inT').value, $('#inF').value);
    $('#inP').innerHTML = dias.length ? `<h3 style="margin:12px 0 6px">Así lo verán (${dias.length} ${dias.length === 1 ? 'día' : 'días'})</h3>` + dias.map(d => {
      const s = { ...Q.asig, deporte: 'natacion', bloques: [{ items: [{ filas: leerT2G(d.texto, 'natacion', ritmoR3(Q.asig.grupo ? { grupo: Q.asig.grupo } : { dep: Q.asig.dep }, 'natacion')).filter(f => +f.m1) }] }] }, e = calcSesion(s);
      const hay = D.sesion.some(x => Q.filtro(x) && x.deporte === 'natacion' && x.fecha === d.fecha);
      return `<div class="card list" style="margin-top:8px"><p class="small" style="margin:0"><b>${fmtLong(parseKey(d.fecha))}</b>${d.titulo ? ' · ' + esc(d.titulo) : ''}${e ? ' · ' + ecoTxt(e) + ' (aprox.)' : ''}${hay ? ' · <span class="warn">ya hay natación ese día</span>' : ''}</p>${txtHTML(d.texto, 'natacion')}</div>`;
    }).join('') : '';
  };
  ['#inQ', '#inT', '#inF'].forEach(id => $(id).addEventListener('input', prev));
}
/* ---------- Importar de la planificación de natación (swim coach) ----------
   Lee las pestañas «Sesión dd-mm-aa» de la hoja Plani ABS/JUN: cada fila es tarea · tiempo · metros, con cabeceras
   «Warm up: …», «MAIN SET — ABS · …», «Warm down: …», filas «Transiciones» y «TOTAL ABS» / «TOTAL INFANTIL»
   que cierran la parte de cada grupo. Si una parte no trae calentamiento, usa el de la primera. */
const hms = t => { const m = String(t || '').trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/); return m ? (m[3] !== undefined ? +m[1] * 60 + +m[2] + +m[3] / 60 : +m[1] + +m[2] / 60) : 0; };
const CAB_RE = /^(warm\s*-?\s*up|main\s*set|warm\s*-?\s*down|cool\s*-?\s*down|calentamiento|parte principal|vuelta a la calma)\b/i;
function partesPlani(filas) {
  const segs = []; let cur = { bloques: [] }, b = null;
  filas.forEach(([t, ti, me]) => {
    t = String(t || '').trim(); if (!t) return;
    const tot = t.match(/^TOTAL\s+(.+)$/i);
    if (tot) { if (cur.bloques.length) { cur.nombre = tot[1].trim(); cur.min = hms(ti); cur.metros = +String(me).replace(/\D/g, '') || 0; segs.push(cur); } cur = { bloques: [] }; b = null; return; }
    if (/^transici/i.test(t)) return;
    if (CAB_RE.test(t)) {
      const tipo = /main|principal/i.test(t) ? 'main' : /up|calentamiento/i.test(t) ? 'up' : 'down';
      let nombre = t.split(':')[0].replace(/\s*[—–-]\s*[A-ZÁÉÍÓÚÑ0-9 ]+?(?=\s*·|$)/, '').trim();
      nombre = nombre.replace(/^main\s*set/i, 'Main set').replace(/^warm\s*-?\s*up/i, 'Warm up').replace(/^warm\s*-?\s*down/i, 'Warm down');
      const foco = tipo === 'main' ? (t.split(':')[0].split('·')[1] || '').trim() : '';
      b = { tipo, nombre, foco, min: hms(ti), metros: +String(me).replace(/\D/g, '') || 0, items: [] }; cur.bloques.push(b); return;
    }
    if (!b) { b = { tipo: 'main', nombre: 'Entrenamiento', min: 0, metros: 0, items: [] }; cur.bloques.push(b); }
    b.items.push({ texto: t, min: hms(ti), metros: +String(me).replace(/\D/g, '') || 0 });
  });
  if (cur.bloques.length) { cur.nombre = cur.nombre || 'Sesión'; segs.push(cur); }
  const up = segs[0]?.bloques.find(x => x.tipo === 'up');
  segs.forEach(sg => { if (up && !sg.bloques.some(x => x.tipo === 'up')) sg.bloques.unshift(up); });
  return segs;
}
function sesionPlani(dia, parte, Q) {
  const sg = partesPlani(dia.filas).find(x => x.nombre.toUpperCase() === parte.toUpperCase()); if (!sg) return null;
  const main = sg.bloques.find(x => x.tipo === 'main');
  const s = { id: `plani-${(Q.grupo ? 'g' + Q.grupo.id : Q.dep.id)}-${dia.fecha}-${parte.toLowerCase().replace(/[^a-z0-9]/g, '')}`, ...Q.asig, fecha: dia.fecha, deporte: 'natacion', origen: 'Planificación · ' + dia.hoja,
    titulo: main?.foco || 'Natación', duracion: Math.round(sg.min) || '', bloques: [] };
  const r3s = ritmoR3(s, 'natacion'); let todas = true;
  s.bloques = sg.bloques.map(b => ({ nombre: b.nombre + (b.metros ? ` · ${b.metros} m` : ''), tiempo: b.min ? fmtMin(b.min) : '', items: b.items.map(x => {
    const it = { nombre: '', texto: x.texto, dist: x.metros ? String(x.metros) : '', tiempo: x.min ? String(Math.round(x.min)) : '' };
    const fs = leerT2G(x.texto, 'natacion', r3s).filter(f => +f.m1), m = fs.reduce((a, f) => a + calcFila(f, 'natacion', r3s).metros, 0);
    if (x.metros && Math.abs(m - x.metros) <= x.metros * .05) it.filas = fs; else if (x.metros) todas = false;
    return it;
  }) }));
  if (!todas) s.bloques.forEach(b => b.items.forEach(it => delete it.filas));
  s.eco = { metros: sg.metros || sg.bloques.reduce((a, b) => a + b.metros, 0), ecos: 0 };
  return s;
}
async function importarPlani(k) {
  toast('Leyendo la planificación…', 8000);
  let j; try { j = await api({ a: 'coach', op: 'plani', clave: S.auth.clave }); } catch (e) { return toast('No se pudo leer la planificación'); }
  if (!j.ok) return toast(j.error === 'clave' ? 'Vuelve a entrar como entrenador' : j.error || 'No se pudo leer la planificación');
  if (!j.dias.length) return toast('No hay pestañas «Sesión dd-mm-aa» en ' + j.nombre);
  const grupos = [...gruposOrd().map(g => ['g:' + g.id, 'Grupo · ' + g.nombre]), ...depsOrd().map(d => [d.id, d.nombre])];
  const partes = [...new Set(j.dias.flatMap(d => partesPlani(d.filas).map(x => x.nombre.toUpperCase())))];
  const prefs = LS.get('abs2-plani', {}), lun = key(monday(today()));
  abrirEd('De la planificación', `<div class="card list"><p class="muted small" style="margin:0">Hoja «${esc(j.nombre)}» · pestañas «Sesión dd-mm-aa»</p>
    <label class="l">Para<select class="f" id="plQ">${opts(grupos, k)}</select></label>
    <label class="l">Parte de la sesión<select class="f" id="plP">${opts(partes.map(p => [p, p]), prefs[k] || partes[0])}</select><small class="muted">Cada día de la planificación trae una parte por grupo (TOTAL ABS, TOTAL INFANTIL…).</small></label>
    <div class="l">Días<div class="chips">${j.dias.map(d => `<button type="button" class="chip" data-pld="${d.fecha}" aria-pressed="${d.fecha >= lun}">${fmtD(parseKey(d.fecha))}</button>`).join('')}</div><small class="muted">Si un día ya se importó, se actualiza (no se duplica).</small></div>
    <div id="plV"></div></div>`, () => {
    const Q = quien($('#plQ').value), parte = $('#plP').value;
    const sel = j.dias.filter(d => document.querySelector(`[data-pld="${d.fecha}"]`).getAttribute('aria-pressed') === 'true');
    const docs = sel.map(d => sesionPlani(d, parte, Q)).filter(Boolean).map(doc => ({ tipo: 'sesion', doc }));
    if (!docs.length) return toast('Elige al menos un día con esa parte'), false;
    prefs[Q.k] = parte; LS.set('abs2-plani', prefs);
    guardar(docs); S.ui.dep = Q.k; S.ui.semana = key(monday(parseKey(docs[0].doc.fecha))); renderCoach();
    toast(`${docs.length} ${docs.length === 1 ? 'sesión' : 'sesiones'} de ${parte} para ${Q.nombre}`);
  }, 'Importar');
  const vista = () => {
    const Q = quien($('#plQ').value), parte = $('#plP').value;
    const sel = j.dias.filter(d => document.querySelector(`[data-pld="${d.fecha}"]`).getAttribute('aria-pressed') === 'true');
    $('#plV').innerHTML = sel.map(d => { const s = sesionPlani(d, parte, Q); if (!s) return `<p class="small muted">${fmtLong(parseKey(d.fecha))}: no tiene parte ${esc(parte)}</p>`;
      const ya = byId('sesion', s.id);
      return `<details class="card list" style="margin-top:8px"><summary class="small"><b>${fmtLong(parseKey(d.fecha))}</b> · ${esc(s.titulo)} · ${ecoTxt(ecoDe(s))}${s.duracion ? ` · ${s.duracion} min` : ''}${ya ? ' · <span class="warn">se actualiza</span>' : ''}</summary>
        ${s.bloques.map(b => `<p class="small" style="margin:8px 0 4px"><b>${esc(b.nombre)}</b>${b.tiempo ? ' · ' + b.tiempo : ''}</p>${b.items.map(it => txtHTML(it.texto, 'natacion')).join('<div style="height:6px"></div>')}`).join('')}</details>`; }).join('');
  };
  document.querySelectorAll('[data-pld]').forEach(b => b.onclick = () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); vista(); });
  $('#plQ').onchange = () => { if (prefs[$('#plQ').value]) $('#plP').value = prefs[$('#plQ').value]; vista(); };
  $('#plP').onchange = vista; vista();
}
/* ---------- Train2Go → ABS ----------
   Recibe lo que saca docs/t2g-extract.js de Train2Go (actividades con su % hecho y comentarios de los últimos días)
   y lo guarda en ABS: sesiones «t2g-a<id>», deportistas «t2g-d<id>», mensajes «t2g-c<id>» y el % hecho en el registro.
   Lo que ya estaba no se duplica. Lo lanza la tarea programada desde el Chrome del entrenador. */
function t2gSync(p) {
  if (S.auth?.modo !== 'coach') return { error: 'entra como entrenador' };
  if (typeof p === 'string') p = JSON.parse(p);
  if (p.error) return { error: p.error };
  const docs = [], cuenta = { deportistas: 0, sesiones: 0, hechas: 0, comentarios: 0 };
  const dSp = { natacion: 'Natación', carrera: 'Carrera', fuerza: 'Gimnasio', ciclismo: 'Ciclismo', otro: 'Sesión' };
  (p.pupils || []).forEach(u => {
    const depId = 't2g-d' + u.id; let d = byId('deportista', depId);
    if (!d) { d = { id: depId, nombre: u.n || 'Deportista Train2Go', pin: '', deportes: [], grupos: [], notas: 'Viene de Train2Go.' }; docs.push({ tipo: 'deportista', doc: d }); D.deportista.push(d); cuenta.deportistas++; }
    (u.days || []).forEach(day => {
      const ids = [];
      (day.acts || []).forEach(a => {
        const sid = 't2g-a' + a.id; let s = byId('sesion', sid);
        if (!s) {
          s = { id: sid, dep: depId, fecha: day.f, titulo: a.tit || dSp[a.sp] || 'Sesión', deporte: DEP[a.sp] ? a.sp : 'otro', duracion: '', origen: 'Train2Go',
            bloques: [{ nombre: 'Sesión', items: [{ nombre: a.tit || dSp[a.sp] || 'Sesión', texto: [a.med, a.desc].filter(Boolean).join('\n') }] }] };
          docs.push({ tipo: 'sesion', doc: s }); D.sesion.push(s); cuenta.sesiones++;
        }
        ids.push(sid);
        const r0 = byId('registro', sid);
        if (a.pct > 0 && (!r0 || r0.t2g !== a.pct)) {
          const r = { ...(r0 || { id: sid, ses: sid, dep: depId, fecha: s.fecha, sets: {}, coment: {} }), t2g: a.pct, hecho: { ...(r0?.hecho || {}) } };
          (s.bloques || []).forEach((b, bi) => (b.items || []).forEach((it, ii) => { r.hecho[`${bi}|${ii}`] = true; }));
          docs.push({ tipo: 'registro', doc: r }); cuenta.hechas++;
        }
      });
      (day.com || []).forEach(c => {
        const id = 't2g-c' + c.id; if (byId('mensaje', id)) return;
        let ses = ids[0] || D.sesion.find(s => s.dep === depId && s.fecha === day.f)?.id;
        if (!ses) { const s = { id: `t2g-dia-${u.id}-${day.f}`, dep: depId, fecha: day.f, titulo: 'Comentarios del día', deporte: 'otro', origen: 'Train2Go', bloques: [] }; if (!byId('sesion', s.id)) { docs.push({ tipo: 'sesion', doc: s }); D.sesion.push(s); } ses = s.id; }
        const de = norm(c.a || '') === norm(d.nombre) || norm(c.a || '') === norm(u.n || '') ? 'dep' : 'coach';
        const f = new Date(String(c.t).replace(' ', 'T'));
        const m = { id, ses, dep: depId, de, txt: c.x, fecha: isNaN(f) ? new Date().toISOString() : f.toISOString(), origen: 'Train2Go', quien: de === 'dep' ? d.nombre : '' };
        docs.push({ tipo: 'mensaje', doc: m }); D.mensaje.push(m); if (de === 'dep') cuenta.comentarios++; else marcarVisto([id]);
      });
    });
  });
  if (docs.length) { guardar(docs); try { renderCoach(); } catch (e) {} }
  LS.set('abs2-t2g', { at: p.at || new Date().toISOString(), ...cuenta });
  return cuenta;
}
const t2gUltima = () => { const u = LS.get('abs2-t2g', null); return u ? `Última vez: ${new Date(u.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${u.comentarios} comentarios nuevos · ${u.hechas} sesiones hechas` : 'Aún no se ha traído nada de Train2Go'; };
// Abre Train2Go en otra pestaña; allí se ejecuta t2g-extract.js, que devuelve los datos a esta pestaña (postMessage)
function abrirT2G() { const w = window.open('https://app.train2go.com/trainer/index', 'abs-t2g'); toast(w ? 'Abierto Train2Go: esperando sus datos…' : 'El navegador ha bloqueado la ventana de Train2Go'); return !!w; }
addEventListener('message', e => {
  if (e.origin !== 'https://app.train2go.com' || e.data?.tipo !== 'abs-t2g') return;
  let r; try { r = t2gSync(e.data.data); } catch (x) { r = { error: x.message }; }
  window.__t2gRes = r;
  toast(r.error ? 'Train2Go: ' + r.error : `Train2Go: ${r.comentarios} comentarios nuevos · ${r.hechas} sesiones hechas · ${r.sesiones} sesiones nuevas`, 6000);
  try { e.source.postMessage({ tipo: 'abs-t2g-ok', r }, e.origin); } catch (x) {}
});
function asignarPlan() {
  if (!D.plan.length) return toast('Todavía no hay planes. Créalos en la pestaña Planes.');
  abrirEd('Asignar plan', `<div class="card list">
    <label class="l">Plan<select class="f" id="apl">${D.plan.map(p => `<option value="${p.id}">${esc(p.nombre)} · ${p.semanas} sem.</option>`).join('')}</select></label>
    <label class="l">Empieza el lunes<input class="f" type="date" id="afe" value="${key(monday(addDays(new Date(), 7)))}"></label>
    <div class="l">¿Desde qué semana del plan?<div class="chips"><button type="button" class="chip" data-am="ini" aria-pressed="true">Desde la semana 1</button><button type="button" class="chip" data-am="sem" aria-pressed="false">Desde otra semana</button><button type="button" class="chip" data-am="exa" aria-pressed="false">Ajustar a la fecha del examen</button></div></div>
    <label class="l hidden" id="wSem">Empieza en la semana del plan<select class="f" id="asem"></select></label>
    <label class="l hidden" id="wExa">Fecha del examen<input class="f" type="date" id="aex"></label>
    <p class="small" id="ares"></p>
    ${chipsDestinos('data-ad', S.ui.dep)}
    <p class="small muted">Se crean las sesiones en el calendario de cada grupo o deportista elegido (en un grupo, una sola vez para todos). Si el aspirante tiene menos semanas que el plan, se usan las últimas semanas del plan, para que la puesta a punto caiga justo antes del examen.</p></div>`,
    () => {
      const r = calc(); if (!r) return false;
      const sel = [...document.querySelectorAll('[data-ad][aria-pressed="true"]')].map(b => b.dataset.ad);
      if (!sel.length) return toast('Elige al menos un grupo o deportista'), false;
      const docs = [];
      sel.forEach(k => (r.p.sesiones || []).filter(s => s.semana >= r.desde).forEach(s => {
        const f = addDays(r.ini, (s.semana - r.desde) * 7 + (s.dia - 1));
        if (r.hasta && key(f) > r.hasta) return;
        const n = clone(s); delete n.semana; delete n.dia;
        Object.assign(n, { id: uid(), ...quien(k).asig, fecha: key(f), plan: { id: r.p.id, semana: s.semana, dia: s.dia } });
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
function copiarSemana(lun, Q) {
  const fin = key(addDays(lun, 6)), ses = D.sesion.filter(s => Q.filtro(s) && s.fecha >= key(lun) && s.fecha <= fin);
  if (!ses.length) return toast('Esta semana no tiene sesiones');
  abrirEd('Copiar semana', `<div class="card list"><p class="muted">${ses.length} sesiones de ${esc(Q.nombre)} (${fmtD(lun)} – ${fmtD(addDays(lun, 6))})</p>
    <label class="l">A la semana que empieza el lunes<input class="f" type="date" id="cfe" value="${key(lun)}"></label>
    ${chipsDestinos('data-cd', '')}</div>`,
    () => {
      const dest = monday(parseKey($('#cfe').value)), off = Math.round((dest - lun) / 864e5);
      const sel = [...document.querySelectorAll('[data-cd][aria-pressed="true"]')].map(b => b.dataset.cd);
      if (!sel.length) return toast('Elige al menos un grupo o deportista'), false;
      const docs = [];
      sel.forEach(k => ses.forEach(s => { const n = clone(s); delete n.dep; delete n.grupo; Object.assign(n, { id: uid(), ...quien(k).asig, fecha: key(addDays(parseKey(s.fecha), off)) }); docs.push({ tipo: 'sesion', doc: n }); }));
      guardar(docs); renderCoach(); toast(`${docs.length} sesiones copiadas`);
    }, 'Copiar');
  document.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
}

/* ---------- Editor de sesión (sirve para calendario y planes) ---------- */
function editSesion(s, nueva, enPlan) {
  s = clone(s); s.bloques = s.bloques || [];
  const dep = enPlan ? null : s.grupo ? byId('grupo', s.grupo) : byId('deportista', s.dep);
  const r3s = () => conEcos(s.deporte) ? ritmoR3(enPlan ? null : s, s.deporte) : 0;
  const pintar = () => {
    const c = DEP[s.deporte]?.c;
    $('#edBody').innerHTML = `
      ${conEcos(s.deporte) ? `<div class="ecobar" id="ecoTot"></div>` : ''}
      <div class="card list">
        ${enPlan ? `<p class="muted small">Plan: ${esc(enPlan.nombre)} · Semana ${s.semana} · ${DIAS[s.dia - 1]}</p>` : `<p class="muted small">${s.grupo ? 'Grupo ' : ''}${esc(dep?.nombre || '')} · ${fmtLong(parseKey(s.fecha))}</p>`}
        <div class="grid2"><label class="l">Título<input class="f" data-k="titulo" value="${esc(s.titulo)}" placeholder="p. ej. Fuerza · Día 1"></label>
        <label class="l">Deporte<select class="f" data-k="deporte">${Object.entries(DEP).map(([k, v]) => `<option value="${k}" ${k === s.deporte ? 'selected' : ''}>${v.n}</option>`).join('')}</select></label>
        ${enPlan ? `<label class="l">Semana<input class="f" type="number" min="1" max="${enPlan.semanas}" data-k="semana" value="${s.semana}"></label><label class="l">Día<select class="f" data-k="dia">${DIAS.map((d, i) => `<option value="${i + 1}" ${i + 1 == s.dia ? 'selected' : ''}>${d}</option>`).join('')}</select></label>` : `<label class="l">Fecha<input class="f" type="date" data-k="fecha" value="${s.fecha}"></label>`}
        <label class="l">Duración prevista (min)<input class="f" type="number" min="0" data-k="duracion" value="${esc(s.duracion)}"></label>
        <label class="l">RPE objetivo<input class="f" data-k="rpeObj" value="${esc(s.rpeObj || '')}" placeholder="p. ej. 6–7"></label>
        <label class="l">Subtítulo<input class="f" data-k="subtitulo" value="${esc(s.subtitulo || '')}" placeholder="p. ej. Semana 1 · Base"></label></div>
        <label class="l">Notas para el deportista<textarea class="f" data-k="notas">${esc(s.notas || '')}</textarea></label>
      </div>
      ${s.bloques.map((b, bi) => `<div class="eblock" style="--c:${c}">
        <div class="row"><input class="f grow" data-b="${bi}" data-bk="nombre" value="${esc(b.nombre)}" placeholder="Nombre del bloque" style="font-weight:700">
        ${s.deporte === 'fuerza' ? `<label class="l" style="width:90px">${b.circuito ? 'Vueltas' : 'Series'}<input class="f" type="number" min="1" data-b="${bi}" data-bk="series" value="${esc(b.series || '')}"></label>` : ''}
        <label class="l" style="width:80px">Tiempo<input class="f" data-b="${bi}" data-bk="tiempo" value="${esc(b.tiempo || '')}" placeholder="10'"></label>
        <span class="chip">${(b.items || []).length} ${(b.items || []).length === 1 ? 'ejercicio' : 'ejercicios'}</span>${conEcos(s.deporte) ? `<span class="small mono btot" data-btot="${bi}"></span>` : ''}<button class="icon" data-mb="${bi}|-1" aria-label="Subir bloque">↑</button><button class="icon" data-mb="${bi}|1" aria-label="Bajar bloque">↓</button><button class="icon" data-db="${bi}" aria-label="Borrar bloque">✕</button></div>
        ${s.deporte === 'fuerza' ? `<div class="row circed"><label class="chk2"><input type="checkbox" data-b="${bi}" data-bk="circuito" ${b.circuito ? 'checked' : ''}> Circuito / biserie: los ejercicios se hacen seguidos</label>${b.circuito ? `<label class="l" style="width:170px">Descanso al acabar la vuelta<input class="f" data-b="${bi}" data-bk="descV" value="${esc(b.descV || '')}" placeholder="p. ej. 90 s"></label>` : ''}</div>` : ''}
        ${(b.items || []).map((it, ii) => itemEd(s.deporte, bi, ii, it, r3s())).join('')}
        <div class="row"><button class="btn sm" data-ai="${bi}">+ Desde la biblioteca</button><button class="btn sm ghost" data-ab="${bi}">+ Línea libre</button></div>
      </div>`).join('')}
      <div class="row"><button class="btn" id="nb">+ Añadir bloque</button>${s.deporte === 'fuerza' ? '<button class="btn ghost" id="nbF">+ Estructura de fuerza (warm up, activación, saltos y pliometría, fuerza 1, fuerza 2, accesorios)</button>' : ''}</div>
      <div class="row"><button class="btn sm" id="favB">★ Guardar como favorita</button>${nueva ? '' : `<button class="btn sm" id="dup">Duplicar</button><button class="btn sm danger" id="dels">Borrar sesión</button>`}</div>
      ${nueva || enPlan ? '' : resultados(s)}`;
    enlazar();
  };
  const leer = () => {
    document.querySelectorAll('#edBody [data-k]').forEach(i => { s[i.dataset.k] = ['semana', 'dia'].includes(i.dataset.k) ? +i.value : i.value; });
    document.querySelectorAll('#edBody [data-bk]').forEach(i => { s.bloques[+i.dataset.b][i.dataset.bk] = i.type === 'checkbox' ? i.checked : i.value; });
    document.querySelectorAll('#edBody [data-ik]').forEach(i => { const [bi, ii] = i.dataset.i.split('|').map(Number); s.bloques[bi].items[ii][i.dataset.ik] = i.value; });
    document.querySelectorAll('#edBody [data-fr]').forEach(i => { const [bi, ii, fi] = i.dataset.fr.split('|').map(Number), f = s.bloques[bi].items[ii].filas[fi]; const v = i.value; f[i.dataset.fk] = ['rep', 'm1', 'm2'].includes(i.dataset.fk) ? (v === '' ? '' : +v.replace(',', '.') || v) : v; if (i.dataset.fk === 'z1' && i.dataset.z !== v) delete f.sup; });
  };
  // Totales en vivo (por ítem, por bloque y de la sesión) sin repintar el formulario
  const totales = () => {
    if (!conEcos(s.deporte)) return;
    const d = s.deporte, r = r3s(), tx = c => `${c.metros ? fmtDist(c.metros) + ' · ' : ''}${fmtMin(c.min)} · <b>${c.ecos} ECOs</b>`;
    let T = { metros: 0, min: 0, ecos: 0 };
    s.bloques.forEach((b, bi) => {
      let B = { metros: 0, min: 0, ecos: 0 };
      (b.items || []).forEach((it, ii) => {
        let I = { metros: 0, min: 0, ecos: 0 };
        (it.filas || []).forEach((f, fi) => { if (!+f.m1) return; const c = calcFila(f, d, r); I.metros += c.metros; I.min += c.min; I.ecos += c.ecos; const e = document.querySelector(`[data-fe="${bi}|${ii}|${fi}"]`); if (e) e.textContent = Math.round(c.ecos); });
        const e = document.querySelector(`[data-ftot="${bi}|${ii}"]`); if (e) e.innerHTML = I.min ? tx({ ...I, ecos: Math.round(I.ecos) }) : '';
        ['metros', 'min', 'ecos'].forEach(k => B[k] += I[k]);
      });
      const e = document.querySelector(`[data-btot="${bi}"]`); if (e) e.innerHTML = B.min ? tx({ ...B, ecos: Math.round(B.ecos) }) : '';
      ['metros', 'min', 'ecos'].forEach(k => T[k] += B[k]);
    });
    const e = $('#ecoTot'); if (e) e.innerHTML = T.min ? `<span>Total</span><b>${T.metros ? fmtDist(T.metros) : '—'}</b><b>${fmtMin(T.min)}</b><b class="big">${Math.round(T.ecos)} ECOs</b><small>Ritmo R3: ${fmtMin(r / 60)}${ECO_DEP[d].u}</small>` : `<span>Escribe el entreno como en Train2Go y pulsa «Rellenar filas desde el texto», o añade filas: se calculan distancia, tiempo y ECOs.</span>`;
  };
  const enlazar = () => {
    const B = $('#edBody');
    B.querySelector('[data-k="deporte"]').onchange = () => { leer(); pintar(); };
    totales();
    B.oninput = e => { if (e.target.dataset.fr) { leer(); totales(); } };
    B.onchange = e => { if (e.target.dataset.fr && e.target.tagName === 'SELECT') { e.target.dataset.z = e.target.value; leer(); totales(); } };
    B.querySelectorAll('[data-fa]').forEach(x => x.onclick = () => { leer(); const [bi, ii] = x.dataset.fa.split('|').map(Number), it = s.bloques[bi].items[ii], u = it.filas?.at(-1); (it.filas = it.filas || []).push(u ? { ...u, sup: undefined } : { rep: 1, m1: '', u1: s.deporte === 'carrera' ? 'min' : 'm', z1: 'r1', m2: '', u2: 'seg', z2: 'r0' }); pintar(); });
    B.querySelectorAll('[data-fd]').forEach(x => x.onclick = () => { leer(); const [bi, ii, fi] = x.dataset.fd.split('|').map(Number); s.bloques[bi].items[ii].filas.splice(fi, 1); pintar(); });
    B.querySelectorAll('[data-ft]').forEach(x => x.onclick = () => {
      leer(); const [bi, ii] = x.dataset.ft.split('|').map(Number), it = s.bloques[bi].items[ii];
      const fs = leerT2G(it.texto || '', s.deporte, r3s());
      if (!fs.length) return toast('No he sabido leer ninguna fila: añádelas con «+ Fila»', 3500);
      if (it.filas?.length && !confirm('¿Cambiar las filas actuales por las que salen del texto?')) return;
      it.filas = fs; pintar(); toast(`${fs.length} filas. Revisa las marcadas en amarillo`);
    });
    $('#nb').onclick = () => { leer(); s.bloques.push({ id: uid(), nombre: '', series: s.deporte === 'fuerza' ? 3 : '', items: [] }); pintar(); };
    const nbF = $('#nbF'); if (nbF) nbF.onclick = () => { leer(); ['Warm up', 'Activación', 'Saltos, pliometría y fuerza explosiva', 'Fuerza 1 · dominante de cadera + empuje', 'Fuerza 2 · dominante de rodilla + tracción', 'Accesorios'].forEach((n, i) => s.bloques.push({ id: uid(), nombre: n, series: i < 2 ? 2 : 3, items: [] })); pintar(); };
    B.querySelectorAll('[data-db]').forEach(x => x.onclick = () => { leer(); s.bloques.splice(+x.dataset.db, 1); pintar(); });
    B.querySelectorAll('[data-mb]').forEach(x => x.onclick = () => { leer(); const [i, d] = x.dataset.mb.split('|').map(Number); const j = i + d; if (j < 0 || j >= s.bloques.length) return; [s.bloques[i], s.bloques[j]] = [s.bloques[j], s.bloques[i]]; pintar(); });
    B.querySelectorAll('[data-ab]').forEach(x => x.onclick = () => { leer(); s.bloques[+x.dataset.ab].items.push({ id: uid(), nombre: '' }); pintar(); });
    B.querySelectorAll('[data-ai]').forEach(x => x.onclick = () => { leer(); elegirEjercicio(s.deporte, ej => { s.bloques[+x.dataset.ai].items.push(itemDesde(ej)); pintar(); }); });
    B.querySelectorAll('[data-di]').forEach(x => x.onclick = () => { leer(); const [bi, ii] = x.dataset.di.split('|').map(Number); s.bloques[bi].items.splice(ii, 1); pintar(); });
    B.querySelectorAll('[data-mi]').forEach(x => x.onclick = () => { leer(); const [bi, ii, d] = x.dataset.mi.split('|').map(Number); const it = s.bloques[bi].items, j = ii + d; if (j < 0 || j >= it.length) return; [it[ii], it[j]] = [it[j], it[ii]]; pintar(); });
    B.querySelectorAll('[data-bk="circuito"]').forEach(x => x.onchange = () => { leer(); pintar(); });
    $('#favB').onclick = () => {
      leer(); const nombre = prompt('Nombre de la sesión favorita', s.titulo || DEP[s.deporte]?.n || 'Sesión'); if (!nombre) return;
      const c = clone(s); ['id', 'fecha', 'dep', 'grupo', 'plan', 'semana', 'dia', 'eco'].forEach(k => delete c[k]);
      guardar([{ tipo: 'favorita', doc: { id: uid(), nombre: nombre.trim(), ses: c } }]); toast('Guardada en favoritas (Planes → Sesiones favoritas)');
    };
    const dup = $('#dup'); if (dup) dup.onclick = () => { leer(); const n = clone(s); n.id = uid(); n.titulo = (n.titulo || '') + ' (copia)'; cerrarEd(); editSesion(n, true, enPlan); };
    const dels = $('#dels'); if (dels) dels.onclick = () => {
      if (!confirm('¿Borrar esta sesión?')) return;
      if (enPlan) { enPlan.sesiones = enPlan.sesiones.filter(x => x.id !== s.id); guardar([{ tipo: 'plan', doc: enPlan }]); }
      else borrar([{ tipo: 'sesion', id: s.id }, ...D.registro.filter(r => r.ses === s.id).map(r => ({ tipo: 'registro', id: r.id }))]);
      cerrarEd(); renderCoach();
    };
  };
  abrirEd(nueva ? 'Nueva sesión' : (s.titulo || 'Sesión'), '', () => {
    leer();
    s.bloques.forEach(b => b.items = (b.items || []).filter(it => it.nombre || it.texto || it.filas?.length));
    s.bloques.forEach(b => b.items.forEach(it => { if (it.filas) it.filas = it.filas.filter(f => +f.m1); if (it.filas && !it.filas.length) delete it.filas; }));
    const c = calcSesion(enPlan ? { ...s, dep: null, grupo: null } : s);
    if (c) { s.eco = { ecos: c.ecos, metros: Math.round(c.metros), min: Math.round(c.min) }; if (!s.duracion) s.duracion = Math.round(c.min); } else delete s.eco;
    if (enPlan) { const i = enPlan.sesiones.findIndex(x => x.id === s.id); if (i >= 0) enPlan.sesiones[i] = s; else enPlan.sesiones.push(s); guardar([{ tipo: 'plan', doc: enPlan }]); }
    else guardar([{ tipo: 'sesion', doc: s }]);
    renderCoach();
  });
  pintar();
}
// Vista del entrenador de una sesión ya programada: el plan tal cual lo ve el deportista, con lo que ha hecho
// cada persona (kilos por serie, series hechas, comentarios, RPE) y lo que ha llegado de Strava ese día.
function verSesion(s, quienId) {
  const gente = s.grupo ? miembros(byId('grupo', s.grupo)) : [byId('deportista', s.dep)].filter(Boolean);
  const regDep = d => d && (s.grupo ? D.registro.find(r => r.ses === s.id && r.dep === d.id) : byId('registro', s.id));
  const conAlgo = r => r && (r.rpe !== undefined && r.rpe !== '' || Object.values(r.sets || {}).some(v => v.ok || v.kg) || Object.values(r.hecho || {}).some(Boolean) || Object.values(r.coment || {}).some(Boolean) || r.nota);
  const sel = gente.find(d => d.id === quienId) || gente.find(d => conAlgo(regDep(d))) || gente[0];
  const r = regDep(sel) || {}, c = DEP[s.deporte]?.c, e = conEcos(s.deporte) && ecoDe(s);
  const acts = sel ? actividadesDe(sel.id, s.fecha) : [];
  const presc = (it, b) => [s.deporte === 'fuerza' && it.reps && 'Reps ' + it.reps, it.carga, it.rpe && (/^\d/.test(it.rpe) ? 'RPE ' + it.rpe : it.rpe), it.desc && 'Desc. ' + it.desc].filter(Boolean).join(' · ');
  const html = `
    <div class="card list"><p class="muted small" style="margin:0">${s.grupo ? 'Grupo ' + esc(byId('grupo', s.grupo)?.nombre || '') + ' · ' : ''}${fmtLong(parseKey(s.fecha))} · ${DEP[s.deporte]?.n || ''}${s.duracion ? ` · ${s.duracion} min` : ''}${e ? ' · ' + ecoTxt(e) : ''}</p>
      ${s.notas ? `<p class="small" style="margin:0;white-space:pre-wrap">${esc(s.notas)}</p>` : ''}
      ${gente.length > 1 ? `<div class="chips">${gente.map(d => `<button type="button" class="chip" data-vq="${d.id}" aria-pressed="${d === sel}">${conAlgo(regDep(d)) ? '<i style="--c:var(--ok)"></i>' : ''}${esc(d.nombre)}</button>`).join('')}</div>` : ''}
    </div>
    ${sel ? `<div class="vres card"><div class="row"><div class="avatar">${esc(ini(sel.nombre))}</div><b class="grow">${esc(sel.nombre)}</b>
      ${r.rpe !== undefined && r.rpe !== '' ? `<span class="kv"><small>RPE</small><b>${esc(r.rpe)}</b></span><span class="kv"><small>Min</small><b>${esc(r.minutos || '—')}</b></span><span class="kv"><small>Carga</small><b>${ua(r)} UA</b></span>` : '<small class="muted">Aún no ha registrado esta sesión</small>'}</div>
      ${r.nota ? `<p class="bubble">${esc(r.nota)}</p>` : ''}
      ${acts.map(actCard).join('')}${realizadoHTML(s, sel)}</div>
    <div class="card list"><h3>Conversación con ${esc(String(sel.nombre).split(' ')[0])}</h3>${hiloHTML(s, sel, regDep(sel), 'coach')}</div>` : ''}
    ${(s.bloques || []).map((b, bi) => `<section class="block" style="--c:${c}"><div class="bh"><i></i>${esc(b.nombre || 'Bloque ' + (bi + 1))}${b.series && s.deporte === 'fuerza' ? ` · ${b.series} ${b.circuito ? 'vueltas' : 'series'}` : ''}${b.tiempo ? `<em>${esc(b.tiempo)}</em>` : ''}</div>${b.circuito ? `<p class="circ">↻ Circuito${b.descV ? ` · descanso ${esc(b.descV)} al acabar cada vuelta` : ''}</p>` : ''}
      ${(b.items || []).map((it, ii) => {
        const v = vidId(it.video), com = r.coment?.[`${bi}|${ii}`], px = presc(it, b);
        let body = '';
        if (it.texto) body += txtHTML(it.texto, s.deporte);
        else if (it.filas?.length) body += `<ul class="filas ${s.deporte === 'natacion' ? 'nat' : ''}">${it.filas.map(f => `<li><i data-z="${f.z1 || 'r1'}"></i>${esc(txtFila(f, s.deporte))}</li>`).join('')}</ul>`;
        if (s.deporte === 'fuerza') { const n = nSeries(b, it); body += `<table class="sets"><thead><tr><th>Serie</th><th>Reps</th><th>Kg</th><th class="c"></th></tr></thead><tbody>${Array.from({ length: n }, (_, k) => { const x = r.sets?.[`${bi}|${ii}|${k}`] || {}; return `<tr class="${x.ok ? 'done' : ''}"><td class="n">${k + 1}</td><td class="r">${esc(repsDe(it, k))}</td><td class="kg mono">${x.kg ? esc(x.kg) + ' kg' : '<span class="muted">—</span>'}</td><td class="c">${x.ok ? `<span class="chk" aria-pressed="true" aria-label="Hecha">${CHECK}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>`; }
        if (com) body += `<p class="bubble">${esc(com)}</p>`;
        return `<article class="ex" style="--c:${c}"><div class="exh"><div class="t"><h3>${esc(it.nombre || '')}</h3>${px ? `<span class="rx">${esc(px)}</span>` : ''}${it.notas ? `<span class="cue">${esc(it.notas)}</span>` : ''}</div>
          ${v ? `<button type="button" class="thumb" ${tramo(it.video)} data-n="${esc(it.nombre)}" aria-label="Ver vídeo"><img src="https://i.ytimg.com/vi/${v}/hqdefault.jpg" alt="" loading="lazy"><span>${PLAY}</span></button>` : ''}
          ${s.deporte !== 'fuerza' && r.hecho?.[`${bi}|${ii}`] ? `<span class="chk" aria-pressed="true" aria-label="Hecho">${CHECK}</span>` : ''}</div>${body}</article>`;
      }).join('')}</section>`).join('')}`;
  abrirEd(s.titulo || DEP[s.deporte]?.n || 'Sesión', html, () => { setTimeout(() => editSesion(s), 0); }, 'Editar');
  document.querySelectorAll('[data-vq]').forEach(b => b.onclick = () => verSesion(s, b.dataset.vq));
  if (sel) marcarVisto(hilo(s, sel, regDep(sel)).map(m => m.k));
  document.querySelectorAll('#edBody [data-msgf]').forEach(f => f.onsubmit = e => { e.preventDefault(); const t = f.querySelector('textarea'), txt = t.value.trim(); if (!txt) return; enviarMensaje(s.id, sel.id, txt, 'coach'); verSesion(s, sel.id); toast('Enviado'); });
}
// Actividades que han llegado de Strava (o Garmin a través de Strava) para un deportista y un día
const actividadesDe = (dep, fecha) => (D.actividad || []).filter(a => a.dep === dep && a.fecha === fecha).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
const DEP_STRAVA = { Swim: 'natacion', Run: 'carrera', TrailRun: 'carrera', VirtualRun: 'carrera', Ride: 'ciclismo', VirtualRide: 'ciclismo', GravelRide: 'ciclismo', MountainBikeRide: 'ciclismo', WeightTraining: 'fuerza', Workout: 'otro', Walk: 'otro', Hike: 'otro' };
const actMini = a => { const dep = DEP_STRAVA[a.tipo] || 'otro'; return `<a class="actm" style="--c:${DEP[dep]?.c}" href="https://www.strava.com/activities/${encodeURIComponent(a.sid)}" target="_blank" rel="noopener"><span>${STRAVA_LOGO}</span><b>${esc(a.nombre || DEP[dep]?.n)}</b><small>${[a.dist && fmtDist(a.dist), a.mov && fmtMin(a.mov / 60)].filter(Boolean).join(' · ')}</small></a>`; };
function actCard(a) {
  const dep = DEP_STRAVA[a.tipo] || 'otro', km = a.dist ? fmtDist(a.dist) : '', t = a.mov ? fmtMin(a.mov / 60) : '';
  const ritmo = a.dist && a.mov ? (dep === 'natacion' ? fmtMin(a.mov / 60 / (a.dist / 100)) + '/100 m' : dep === 'carrera' ? fmtMin(a.mov / 60 / (a.dist / 1000)) + '/km' : dep === 'ciclismo' ? (a.dist / 1000 / (a.mov / 3600)).toFixed(1).replace('.', ',') + ' km/h' : '') : '';
  return `<a class="act" style="--c:${DEP[dep]?.c}" href="https://www.strava.com/activities/${encodeURIComponent(a.sid)}" target="_blank" rel="noopener"><span class="src">Strava${a.hora ? ' · ' + esc(a.hora) : ''}</span><b>${esc(a.nombre || DEP[dep]?.n || 'Actividad')}</b>
    <span class="nums">${[km, t, ritmo, a.fc && '♥ ' + Math.round(a.fc), a.desn && '↑ ' + Math.round(a.desn) + ' m'].filter(Boolean).map(x => `<span>${x}</span>`).join('')}</span></a>`;
}
// Lo que ha registrado cada persona en una sesión (vista del entrenador)
function resultados(s) {
  const gente = s.grupo ? miembros(byId('grupo', s.grupo)) : [byId('deportista', s.dep)].filter(Boolean);
  if (!gente.length) return '';
  const regDep = d => s.grupo ? D.registro.find(r => r.ses === s.id && r.dep === d.id) : byId('registro', s.id);
  const conAlgo = r => r && (ua(r) || Object.values(r.sets || {}).some(v => v.ok || v.kg) || Object.values(r.hecho || {}).some(Boolean) || Object.values(r.coment || {}).some(Boolean) || r.nota);
  const n = gente.filter(d => conAlgo(regDep(d))).length;
  const filas = gente.map(d => {
    const r = regDep(d);
    if (!conAlgo(r)) return `<div class="row"><b class="grow">${esc(d.nombre)}</b><small class="muted">Sin registrar</small></div>`;
    const ejs = [];
    (s.bloques || []).forEach((b, bi) => (b.items || []).forEach((it, ii) => {
      const kg = Object.entries(r.sets || {}).filter(([k, v]) => k.startsWith(`${bi}|${ii}|`) && v.kg).sort((x, y) => +x[0].split('|')[2] - +y[0].split('|')[2]).map(([, v]) => v.kg);
      const c = r.coment?.[`${bi}|${ii}`];
      if (kg.length || c) ejs.push(`<li>${esc(it.nombre)}${kg.length ? `: <span class="mono">${esc(kg.join(' · '))} kg</span>` : ''}${c ? ` <i class="muted">«${esc(c)}»</i>` : ''}</li>`);
    }));
    return `<div><div class="row"><b class="grow">${esc(d.nombre)}</b>${r.rpe !== undefined && r.rpe !== '' ? `<span class="chip mono">RPE ${esc(r.rpe)} · ${esc(r.minutos || 0)}' · ${ua(r)} UA</span>` : '<small class="muted">Sin RPE</small>'}</div>${ejs.length ? `<ul class="small" style="margin:4px 0 0;padding-left:18px">${ejs.join('')}</ul>` : ''}${r.nota ? `<p class="small muted" style="margin:4px 0 0">«${esc(r.nota)}»</p>` : ''}</div>`;
  }).join('');
  return `<details class="card" ${n ? 'open' : ''}><summary><b>Registros</b> <span class="small muted">· ${n} de ${gente.length}</span></summary><div class="list" style="margin-top:10px">${filas}</div></details>`;
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
  ciclismo: [['tiempo', 'Tiempo'], ['ritmo', 'Potencia / zona / cadencia'], ['desc', 'Recuperación'], ['rpe', 'RPE']],
  otro: [['tiempo', 'Tiempo'], ['rpe', 'RPE']],
};
const UNID = [['m', 'm'], ['km', 'km'], ['min', "min"], ['seg', 'seg']];
const opts = (lista, v) => lista.map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('');
function filasEd(dep, bi, ii, it, r3s) {
  const fs = it.filas || [], id = `${bi}|${ii}`;
  const fila = (f, fi) => { const k = `${id}|${fi}`, c = calcFila(f, dep, r3s); return `<tr class="${f.sup ? 'sup' : ''}">
    <td><input class="rep" data-fr="${k}" data-fk="rep" value="${esc(f.rep || 1)}" inputmode="numeric" aria-label="Repeticiones"></td><td class="x">×</td>
    <td><div class="mz"><input data-fr="${k}" data-fk="m1" value="${esc(f.m1 ?? '')}" inputmode="decimal" aria-label="Medida"><select data-fr="${k}" data-fk="u1" aria-label="Unidad">${opts(UNID, f.u1 || 'm')}</select><select class="z" data-fr="${k}" data-fk="z1" data-z="${f.z1 || 'r1'}" aria-label="Zona">${opts(zonasDe(dep), f.z1 || 'r1')}</select></div></td>
    <td><div class="mz"><input data-fr="${k}" data-fk="m2" value="${esc(f.m2 ?? '')}" inputmode="decimal" placeholder="—" aria-label="Descanso"><select data-fr="${k}" data-fk="u2" aria-label="Unidad del descanso">${opts(UNID, f.u2 || 'seg')}</select><select class="z" data-fr="${k}" data-fk="z2" data-z="${f.z2 || 'r0'}" aria-label="Zona del descanso">${opts(zonasDe(dep), f.z2 || 'r0')}</select></div></td>
    <td class="eco mono" data-fe="${k}">${+f.m1 ? Math.round(c.ecos) : ''}</td><td><button type="button" class="icon" data-fd="${k}" aria-label="Quitar fila">✕</button></td></tr>`; };
  return `<div class="t2g ${dep === 'natacion' ? 'nat' : ''}"><table><thead><tr><th>Rep</th><th></th><th>Actividad · zona</th><th>Descanso · zona</th><th>ECOs</th><th></th></tr></thead><tbody>${fs.map(fila).join('')}</tbody></table>
    ${fs.some(f => f.sup) ? '<p class="small muted" style="margin:4px 0 0">Las filas marcadas no decían zona: se ha supuesto. Revísalas.</p>' : ''}
    <div class="row"><button type="button" class="btn sm" data-fa="${id}">+ Fila</button><button type="button" class="btn sm ghost" data-ft="${id}">Rellenar filas desde el texto</button><span class="grow"></span><span class="tot mono" data-ftot="${id}"></span></div></div>`;
}
function itemEd(dep, bi, ii, it, r3s) {
  const id = `${bi}|${ii}`;
  const conTexto = dep !== 'fuerza', eco = conEcos(dep);
  return `<div class="eitem"><div class="top"><label class="grow">Ejercicio / tarea<input data-i="${id}" data-ik="nombre" value="${esc(it.nombre)}" placeholder="${conTexto ? 'p. ej. Calentamiento, 6x100 progresivo' : 'Nombre del ejercicio'}"></label>
    <button class="icon" data-mi="${bi}|${ii}|-1" aria-label="Subir">↑</button><button class="icon" data-mi="${bi}|${ii}|1" aria-label="Bajar">↓</button><button class="icon" data-di="${id}" aria-label="Quitar">✕</button></div>
    ${conTexto ? `<label>${dep === 'natacion' ? 'Entreno escrito tal cual (p. ej. «6x50 @ :50 A1» o «200 A2 + 100 A3»; respeta sangrías)' : eco ? 'Entreno escrito como en Train2Go (p. ej. 8x50 R2 d/15")' : 'Descripción (texto tal cual lo verá el deportista)'}<textarea data-i="${id}" data-ik="texto" ${eco ? 'class="mono"' : ''}>${esc(it.texto || '')}</textarea></label>` : ''}
    ${dep === 'natacion' ? leyendaNat() : ''}${eco ? filasEd(dep, bi, ii, it, r3s) : ''}
    <div class="fields">${eco ? '' : (CAMPOS[dep] || CAMPOS.otro).map(([k, n]) => `<label>${n}<input data-i="${id}" data-ik="${k}" value="${esc(it[k] || '')}"></label>`).join('')}
    <label>Vídeo (enlace)<input data-i="${id}" data-ik="video" value="${esc(it.video || '')}" placeholder="YouTube"></label></div>
    <label>Indicación<input data-i="${id}" data-ik="notas" value="${esc(it.notas || '')}"></label></div>`;
}
function elegirEjercicio(dep, cb) {
  const dl = $('#pk'); let f = { q: '', dep, cat: '' };
  const pintar = () => {
    const lista = D.ejercicio.filter(e => (!f.dep || e.deporte === f.dep) && (!f.cat || e.cat === f.cat) && (!f.q || norm(e.nombre).includes(norm(f.q)))).sort(ordenEj);
    let ult = null;
    $('#pkL').innerHTML = lista.length ? lista.slice(0, 300).map(e => `${e.cat !== ult ? `<div class="bh" style="--c:${DEP[e.deporte]?.c}"><i></i>${esc((ult = e.cat) || 'Sin categoría')}</div>` : ''}<button class="item" data-pe="${e.id}"><div class="t"><b>${esc(e.nombre)}</b><small>${esc(e.cat || '')}</small></div>${e.video ? '<span class="small muted">▶</span>' : ''}</button>`).join('') : '<div class="empty">Nada en la biblioteca con ese filtro.</div>';
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
    ${D.plan.length ? `<div class="list">${D.plan.map(p => `<button class="item" data-p="${p.id}"><div class="t"><b>${esc(p.nombre)}</b><small>${p.semanas} semanas · ${(p.sesiones || []).length} sesiones${p.desc ? ' · ' + esc(p.desc.slice(0, 80)) : ''}</small></div></button>`).join('')}</div>` : '<div class="empty">Aún no hay planes. Un plan es una plantilla de varias semanas que luego asignas a uno o varios deportistas.</div>'}
    <h2 style="margin-top:10px">Sesiones favoritas</h2><p class="muted small" style="margin:0">Sesiones sueltas guardadas con «★ Guardar como favorita» en el editor. Al crear una sesión en el calendario puedes empezar desde una de ellas.</p>
    ${D.favorita.length ? `<div class="libgrid">${D.favorita.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(f => `<div class="item"><div class="t"><b>★ ${esc(f.nombre)}</b><small>${esc(DEP[f.ses?.deporte]?.n || '')}${f.ses?.duracion ? ` · ${f.ses.duracion}'` : ''} · ${(f.ses?.bloques || []).reduce((a, b) => a + (b.items || []).length, 0)} ejercicios</small></div><button class="icon" data-fvx="${f.id}" aria-label="Quitar de favoritas">✕</button></div>`).join('')}</div>` : '<div class="empty">Todavía no hay sesiones favoritas.</div>'}`;
  m.querySelectorAll('[data-fvx]').forEach(b => b.onclick = () => { if (confirm('¿Quitar esta sesión de favoritas?')) { borrar([{ tipo: 'favorita', id: b.dataset.fvx }]); vPlanes(m); } });
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
  const f = S.ui.bib = S.ui.bib || { dep: 'fuerza', cat: '', q: '', est: '' };
  const nat = f.dep === 'natacion', est = nat ? f.est || '' : '';
  const lista = D.ejercicio.filter(e => vidId(e.video) && e.deporte === f.dep && (!f.cat || e.cat === f.cat) && (!est || (est === '-' ? !e.estilo : e.estilo === est)) && (!f.q || norm(e.nombre + ' ' + (e.texto || '')).includes(norm(f.q)))).sort(est ? ordDif : ordenEj);
  const grupos = []; lista.forEach(e => { const g = grupos[grupos.length - 1]; if (g && g.cat === (e.cat || '')) g.l.push(e); else grupos.push({ cat: e.cat || '', l: [e] }); });
  const nEst = k => D.ejercicio.filter(e => e.deporte === 'natacion' && vidId(e.video) && (k === '-' ? !e.estilo : e.estilo === k)).length;
  const tarjeta = (e, i) => `<div class="item ejrow">${est ? `<span class="pos mono">${i + 1}</span>` : ''}<button class="t lnkb" data-e="${e.id}">${vidId(e.video) ? `<img src="https://i.ytimg.com/vi/${vidId(e.video)}/default.jpg" alt="" width="48" height="36" style="border-radius:6px;object-fit:cover;flex:none" loading="lazy">` : ''}<span><b>${esc(e.nombre)}</b><small>${[nat && !est && e.estilo, e.nivel, e.dur ? e.dur + ' s' : '', e.fuente].filter(Boolean).map(esc).join(' · ')}</small></span></button>${est && !f.q && !f.cat ? `<button class="icon" data-eo="${e.id}|-1" aria-label="Más fácil">↑</button><button class="icon" data-eo="${e.id}|1" aria-label="Más difícil">↓</button>` : ''}</div>`;
  const n = k => D.ejercicio.filter(e => e.deporte === k && vidId(e.video)).length;
  const vacia = !D.ejercicio.length && !D.plan.length;
  m.innerHTML = `<div class="row"><h2 class="grow">Biblioteca</h2><button class="btn pri" id="ne">+ Nuevo</button></div>
    ${vacia ? '<div class="card row"><div class="grow"><b>Biblioteca vacía</b><div class="small muted">Puedes empezar con los ejercicios de fuerza del mesociclo High Force (con vídeo), calentamientos de natación de @swimcoachjj y los dos planes High Force de 4 semanas.</div></div><button class="btn pri" id="ini">Cargar biblioteca inicial</button></div>' : ''}
    <div class="chips">${Object.entries(DEP).map(([k, v]) => `<button class="chip" data-bd="${k}" aria-pressed="${f.dep === k}"><i style="--c:${v.c}"></i>${v.n} · ${n(k)}</button>`).join('')}</div>
    ${nat ? `<div class="seg2" role="group" aria-label="Estilo"><button type="button" data-est="" aria-pressed="${!est}">Todos</button>${ESTILOS.map(k => `<button type="button" data-est="${k}" aria-pressed="${est === k}">${k}<small>${nEst(k)}</small></button>`).join('')}${nEst('-') ? `<button type="button" data-est="-" aria-pressed="${est === '-'}">Sin estilo<small>${nEst('-')}</small></button>` : ''}</div>` : ''}
    <div class="row"><input class="f grow" id="bq" placeholder="Buscar" value="${esc(f.q)}" style="max-width:320px"><select class="f" id="bc" style="max-width:260px"><option value="">Todas las categorías</option>${(CATS[f.dep] || []).map(c => `<option ${c === f.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    ${est && lista.length ? `<p class="small muted" style="margin:0">De más fácil a más difícil. Usa las flechas para cambiar el orden.</p><div class="list">${lista.map(tarjeta).join('')}</div>`
      : lista.length ? grupos.map(g => `<h3 style="margin-top:6px">${esc(g.cat || 'Sin categoría')} <span class="small muted">· ${g.l.length}</span></h3><div class="libgrid">${g.l.map(e => tarjeta(e)).join('')}</div>`).join('') : '<div class="empty">No hay nada aquí todavía.</div>'}`;
  m.querySelectorAll('[data-bd]').forEach(b => b.onclick = () => { f.dep = b.dataset.bd; f.cat = ''; vBiblioteca(m); });
  m.querySelectorAll('[data-est]').forEach(b => b.onclick = () => { f.est = b.dataset.est; vBiblioteca(m); });
  m.querySelectorAll('[data-eo]').forEach(b => b.onclick = () => {
    const [id, d] = b.dataset.eo.split('|'), i = lista.findIndex(e => e.id === id), j = i + +d;
    if (j < 0 || j >= lista.length) return;
    const nueva = lista.slice(); [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    const docs = nueva.map((e, k) => ({ e, k: (k + 1) * 10 })).filter(x => x.e.orden !== x.k).map(x => ({ tipo: 'ejercicio', doc: { ...x.e, orden: x.k } }));
    guardar(docs); const y = scrollY; vBiblioteca(m); scrollTo(0, y);
  });
  $('#bq').oninput = e => { f.q = e.target.value; clearTimeout(f._t); f._t = setTimeout(() => { vBiblioteca(m); const i = $('#bq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $('#bc').onchange = e => { f.cat = e.target.value; vBiblioteca(m); };
  const bi = $('#ini'); if (bi) bi.onclick = async () => { bi.disabled = true; try { const docs = await (await fetch('inicial.json')).json(); guardar(docs); toast('Biblioteca cargada'); renderCoach(); } catch (e) { bi.disabled = false; toast('No se pudo cargar'); } };
  $('#ne').onclick = () => editEjercicio({ id: uid(), nombre: '', deporte: f.dep, cat: f.cat || (CATS[f.dep] || [])[0] || '', estilo: est && est !== '-' ? est : '', video: '', texto: '', def: {} }, true);
  m.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editEjercicio(clone(byId('ejercicio', b.dataset.e))));
}
function editEjercicio(e, nuevo) {
  e.def = e.def || {};
  const pinta = () => `<div class="card list">
    <label class="l">Nombre<input class="f" id="en" value="${esc(e.nombre)}"></label>
    <div class="grid2"><label class="l">Deporte<select class="f" id="ed2">${Object.entries(DEP).map(([k, v]) => `<option value="${k}" ${k === e.deporte ? 'selected' : ''}>${v.n}</option>`).join('')}</select></label>
    <label class="l">Categoría<input class="f" id="ec" value="${esc(e.cat || '')}" list="cats"></label></div>
    <datalist id="cats">${(CATS[e.deporte] || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    ${e.deporte === 'natacion' ? `<div class="grid2"><label class="l">Estilo<select class="f" id="ees"><option value="">—</option>${ESTILOS.map(k => `<option ${k === e.estilo ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="l">Dificultad<select class="f" id="eni"><option value="">—</option>${NIVELES.map(k => `<option ${k === e.nivel ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>` : ''}
    <label class="l">Vídeo de YouTube (máximo 10 s, solo la ejecución)<input class="f" id="ev" value="${esc(e.video || '')}" placeholder="https://www.youtube.com/shorts/…"></label>
    <p class="small" id="evDur">${e.video && !vidId(e.video) ? '⚠ No es un enlace de YouTube.' : e.dur ? `Duración: ${e.dur} s ${e.dur <= 10 ? '✓' : '· ⚠ supera los 10 s'}` : ''}</p>
    ${vidId(e.video) ? `<button type="button" class="thumb" ${tramo(e.video)} data-n="${esc(e.nombre)}" aria-label="Ver vídeo"><img src="https://i.ytimg.com/vi/${vidId(e.video)}/hqdefault.jpg" alt=""><span>${PLAY}</span></button>` : ''}
    <label class="l">${e.deporte === 'fuerza' ? 'Indicaciones de ejecución' : 'Descripción de la tarea (texto tal cual)'}<textarea class="f ${e.deporte === 'fuerza' ? '' : 'mono'}" id="et" rows="5">${esc(e.texto || '')}</textarea></label>
    <label class="l">Fuente<input class="f" id="ef" value="${esc(e.fuente || '')}" placeholder="p. ej. @swimcoachjj, 19/10/26"></label>
    <div class="l">Valores por defecto al añadirlo a una sesión<div class="grid2">${(CAMPOS[e.deporte] || CAMPOS.otro).map(([k, n]) => `<label class="l">${n}<input class="f" data-df="${k}" value="${esc(e.def[k] || '')}"></label>`).join('')}</div></div></div>
    ${nuevo ? '' : '<button class="btn danger" id="dele">Borrar de la biblioteca</button>'}`;
  const leer = () => { e.nombre = $('#en').value.trim(); e.deporte = $('#ed2').value; e.cat = $('#ec').value.trim(); e.video = $('#ev').value.trim(); e.texto = $('#et').value; e.fuente = $('#ef').value.trim(); if ($('#ees')) { e.estilo = $('#ees').value; e.nivel = $('#eni').value; } document.querySelectorAll('[data-df]').forEach(i => { if (i.value) e.def[i.dataset.df] = i.value; else delete e.def[i.dataset.df]; }); };
  abrirEd(nuevo ? 'Nuevo ejercicio' : e.nombre, pinta(), () => { leer(); if (!e.nombre) return toast('Falta el nombre'), false; if (e.video && !vidId(e.video)) return toast('El vídeo tiene que ser un enlace de YouTube'), false; if (e.dur > 10) return toast(`El vídeo dura ${e.dur} s: elige uno de 10 s o menos`), false; if (!vidId(e.video)) return toast('Falta el vídeo de YouTube: la biblioteca es solo de vídeos. Los entrenamientos escritos van en Base de datos.', 4000), false; guardar([{ tipo: 'ejercicio', doc: e }]); renderCoach(); });
  const enl = () => {
    $('#ed2').onchange = () => { leer(); $('#edBody').innerHTML = pinta(); enl(); };
    $('#ev').onchange = async () => { leer(); delete e.dur; $('#edBody').innerHTML = pinta(); enl(); const v = vidId(e.video); if (!v) return; const c = clip(e.video); if (c.e > c.s) { e.dur = c.e - c.s; $('#evDur').textContent = `Tramo de ${e.dur} s ${e.dur <= 10 ? '✓' : '· ⚠ supera los 10 s'}`; return; } $('#evDur').textContent = 'Comprobando la duración…'; const d = await duracionYT(v); if (vidId(e.video) !== v) return; if (d) e.dur = d; $('#evDur').textContent = d ? `Duración: ${d} s ${d <= 10 ? '✓' : '· ⚠ supera los 10 s: elige otro vídeo'}` : 'No se pudo comprobar la duración.'; };
    const d = $('#dele'); if (d) d.onclick = () => { if (confirm('¿Borrar este ejercicio de la biblioteca? Las sesiones que ya lo usan no cambian.')) { borrar([{ tipo: 'ejercicio', id: e.id }]); cerrarEd(); renderCoach(); } };
  };
  enl();
}

/* ---------- Base de datos de entrenamientos (Train2Go, Instagram…) ---------- */
// Cada referencia: {id, origen, deporte, tipo, titulo, texto, autor, url, medida, coleccion}
const TIPOS_REF = {
  natacion: ['Potencia', 'R100', 'R200', 'R400', 'PAE', 'AEI', 'AEM', 'AEL', 'Kick sets', 'UW', 'Ejercicios de técnica', 'Warm up', 'Cool down', 'Sesión completa', 'Otros'],
  carrera: ['Rodaje y fondo', 'Fartlek', 'Cuestas', 'Umbral (R3)', 'VO2 máx y velocidad', 'Progresivos', 'Test', 'Calentamiento de competición'],
  ciclismo: ['Rodaje y fondo', 'Fuerza y cadencia', 'Umbral (R2–R3)', 'VO2 máx y sprint', 'Test', 'Calentamiento de competición'],
  fuerza: ['Core', 'Fuerza gimnasio', 'Fuerza en casa', 'Fuerza en seco para natación', 'Prevención y movilidad', 'Pliometría y potencia', 'Iniciación'],
  otro: ['General'],
};
function vBaseDatos(m) {
  const f = S.ui.bd = S.ui.bd || { dep: 'natacion', tipo: '', origen: '', q: '' };
  const todos = D.referencia.filter(escrito).filter(r => r.deporte !== 'natacion' || r.serie || !igCode(r.url));
  const lista = todos.filter(r => r.deporte === f.dep && (!f.tipo || r.tipo === f.tipo) && (!f.origen || r.origen === f.origen) && (!f.q || norm([r.titulo, r.serie, r.texto, r.autor].join(' ')).includes(norm(f.q))))
    .sort((a, b) => (TIPOS_REF[a.deporte] || []).indexOf(a.tipo) - (TIPOS_REF[b.deporte] || []).indexOf(b.tipo) || (!a.serie && !!igCode(a.url)) - (!b.serie && !!igCode(b.url)) || String(a.titulo).localeCompare(String(b.titulo), 'es'));
  const n = k => todos.filter(r => r.deporte === k).length;
  const origenes = [...new Set(todos.map(r => r.origen).filter(Boolean))].sort();
  const grupos = []; lista.forEach(r => { const g = grupos[grupos.length - 1]; if (g && g.tipo === r.tipo) g.l.push(r); else grupos.push({ tipo: r.tipo, l: [r] }); });
  m.innerHTML = `<div class="row"><h2 class="grow">Base de datos de entrenamientos</h2><label class="btn" style="cursor:pointer">Importar archivo<input type="file" id="rimp" accept=".json,application/json" hidden></label><button class="btn" id="nr">+ Añadir</button></div>
    <p class="muted small" style="margin-top:0">Solo entrenamientos escritos (de Train2Go, Instagram y los tuyos), ordenados por el contenido que trabajan. En natación se ve solo el main set, con cada intensidad en su color. El asistente de IA los usa como ejemplos.</p>
    ${f.dep === 'natacion' && todos.length ? leyendaNat() : ''}${todos.length ? '' : '<div class="empty">La base de datos está vacía.</div>'}
    <div class="chips">${Object.entries(DEP).filter(([k]) => n(k)).map(([k, v]) => `<button class="chip" data-rd="${k}" aria-pressed="${f.dep === k}"><i style="--c:${v.c}"></i>${v.n} · ${n(k)}</button>`).join('')}</div>
    <div class="row"><input class="f grow" id="rq" placeholder="Buscar (p. ej. 8x50, aletas, umbral)" value="${esc(f.q)}" style="max-width:320px">
      <select class="f" id="rt" style="max-width:240px"><option value="">Todos los contenidos</option>${(TIPOS_REF[f.dep] || []).map(t => `<option ${t === f.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select class="f" id="ro" style="max-width:180px"><option value="">Todos los orígenes</option>${origenes.map(o => `<option ${o === f.origen ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
    ${grupos.map(g => { const lim = (S.ui.bdMas || {})[g.tipo] || 12; return `<h3 style="margin-top:6px">${esc(g.tipo || 'Sin clasificar')} <span class="small muted">· ${g.l.length}</span></h3><div class="refgrid">${g.l.slice(0, lim).map(r => refCard(r)).join('')}</div>${g.l.length > lim ? `<button class="btn sm ghost" data-rmas="${esc(g.tipo)}">Ver ${Math.min(12, g.l.length - lim)} más</button>` : ''}`; }).join('')}
    ${todos.length && !lista.length ? '<div class="empty">Nada con ese filtro.</div>' : ''}`;
  m.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => { f.dep = b.dataset.rd; f.tipo = ''; vBaseDatos(m); });
  $('#rq').oninput = e => { f.q = e.target.value; clearTimeout(f._t); f._t = setTimeout(() => { vBaseDatos(m); const i = $('#rq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#rt').onchange = e => { f.tipo = e.target.value; vBaseDatos(m); };
  $('#ro').onchange = e => { f.origen = e.target.value; vBaseDatos(m); };
  $('#rimp').onchange = async e => {
    const fi = e.target.files[0]; if (!fi) return;
    try {
      const arr = JSON.parse(await fi.text());
      const docs = (Array.isArray(arr) ? arr : []).map(x => x.tipo === 'referencia' && x.doc ? x.doc : x).filter(d => d && d.id && d.titulo && d.deporte && !byId('referencia', d.id));
      if (!docs.length) return toast('No hay entrenamientos nuevos en ese archivo');
      for (let i = 0; i < docs.length; i += 40) guardar(docs.slice(i, i + 40).map(d => ({ tipo: 'referencia', doc: d })));
      toast(`${docs.length} entrenamientos importados`); renderCoach();
    } catch (x) { toast('Ese archivo no es una base de datos válida'); }
  };
  $('#nr').onclick = () => editRef({ id: uid(), origen: 'Propio', deporte: f.dep, tipo: f.tipo || (TIPOS_REF[f.dep] || [''])[0], titulo: '', texto: '' }, true);
  m.querySelectorAll('[data-re]').forEach(b => b.onclick = () => editRef(clone(byId('referencia', b.dataset.re))));
  m.querySelectorAll('[data-rcp]').forEach(b => b.onclick = async () => { const r = byId('referencia', b.dataset.rcp); try { await navigator.clipboard.writeText(r.deporte === 'natacion' ? mainSet(r.serie || r.texto) : (r.serie || r.texto || '')); toast('Copiado'); } catch (e) { toast('No se pudo copiar'); } });
  m.querySelectorAll('[data-rmas]').forEach(b => b.onclick = () => { const t = b.dataset.rmas; S.ui.bdMas = S.ui.bdMas || {}; S.ui.bdMas[t] = ((S.ui.bdMas[t]) || 12) + 12; const y = scrollY; vBaseDatos(m); scrollTo(0, y); });
}
// Tarjeta de la base de datos: el entrenamiento escrito en texto, listo para copiar
const igCode = u => (String(u || '').match(/instagram\.com\/(?:p|reel)\/([\w-]+)/) || [])[1];
function refCard(r) {
  const pie = `<div class="row small muted" style="justify-content:space-between;gap:6px"><span>${esc([r.origen === 'Instagram' && r.autor ? '@' + r.autor : r.origen, r.medida].filter(Boolean).join(' · '))}</span><span><button class="lnk" data-rcp="${r.id}">Copiar</button> · ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a> · ` : ''}<button class="lnk" data-re="${r.id}">Editar</button></span></div>`;
  const cap = r.texto && !/^\(Sin texto/.test(r.texto) ? r.texto : '';
  if (r.deporte === 'natacion' && (r.serie || (!igCode(r.url) && r.texto))) {
    const ms = mainSet(r.serie || r.texto) || r.serie || r.texto;
    return `<div class="card refc">${pie}${r.serie ? '' : `<b>${esc(r.titulo)}</b>`}${txtHTML(ms, 'natacion')}</div>`;
  }
  if (r.serie) return `<div class="card refc">${pie}<pre class="txt">${esc(r.serie)}</pre>${cap && cap.trim() !== r.serie.trim() ? `<details><summary class="small muted">Texto de la publicación</summary><pre class="txt">${esc(cap)}</pre></details>` : ''}</div>`;
  if (igCode(r.url)) return `<div class="card refc">${pie}<p class="small muted" style="margin:0">Sin serie escrita en la publicación. Texto del autor:</p><pre class="txt">${esc(cap || r.titulo)}</pre></div>`;
  return `<div class="card refc">${pie}<b>${esc(r.titulo)}</b><pre class="txt">${esc(r.texto)}</pre></div>`;
}
function editRef(r, nuevo) {
  abrirEd(nuevo ? 'Nuevo entrenamiento de referencia' : r.titulo, `<div class="card list">
    <label class="l">Título<input class="f" id="rft" value="${esc(r.titulo)}"></label>
    <div class="grid2"><label class="l">Deporte<select class="f" id="rfd">${Object.entries(DEP).map(([k, v]) => `<option value="${k}" ${k === r.deporte ? 'selected' : ''}>${v.n}</option>`).join('')}</select></label>
    <label class="l">Contenido que trabaja<input class="f" id="rfc" value="${esc(r.tipo || '')}" list="tiposRef"></label></div>
    <datalist id="tiposRef">${Object.values(TIPOS_REF).flat().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    <label class="l">Entrenamiento escrito<textarea class="f mono" id="rfs" rows="12">${esc(r.serie || '')}</textarea></label>
    <label class="l">${r.origen === 'Instagram' ? 'Texto de la publicación' : 'Notas'}<textarea class="f mono" id="rfx" rows="${r.origen === 'Instagram' ? 5 : 8}">${esc(r.texto)}</textarea></label>
    <div class="grid2"><label class="l">Origen<input class="f" id="rfo" value="${esc(r.origen || '')}"></label><label class="l">Enlace<input class="f" id="rfu" value="${esc(r.url || '')}"></label></div></div>
    ${nuevo ? '' : '<button class="btn danger" id="rfdel">Borrar de la base de datos</button>'}`,
    () => {
      Object.assign(r, { titulo: $('#rft').value.trim(), deporte: $('#rfd').value, tipo: $('#rfc').value.trim(), serie: $('#rfs').value.trim(), texto: $('#rfx').value, origen: $('#rfo').value.trim(), url: $('#rfu').value.trim() });
      if (!r.titulo) return toast('Falta el título'), false;
      if (!escrito(r)) return toast('Escribe el entrenamiento: la base de datos es solo de entrenamientos escritos'), false;
      guardar([{ tipo: 'referencia', doc: r }]); renderCoach();
    });
  if (!nuevo) $('#rfdel').onclick = () => { if (confirm('¿Borrar este entrenamiento de la base de datos?')) { borrar([{ tipo: 'referencia', id: r.id }]); cerrarEd(); renderCoach(); } };
}

/* ---------- Asistente IA (Gemini, gratis con la API de Google) ---------- */
const IA_MODELOS = [['gemini-2.5-flash', 'Gemini 2.5 Flash (rápido, recomendado)'], ['gemini-2.5-pro', 'Gemini 2.5 Pro (más potente, más lento)']];
let iaKey = null;
async function claveIA() {
  if (iaKey) return iaKey;
  const j = await api({ a: 'coach', op: 'iaClave', clave: S.auth.clave });
  if (!j.ok) throw new Error(j.error === 'op' ? 'script' : j.error);
  return (iaKey = j.key || '');
}
function vIA(m) {
  const f = S.ui.ia = S.ui.ia || { deporte: 'fuerza', objetivo: '', perfil: '', nivel: 'Intermedio', semanas: 4, dias: [1, 3, 6], duracion: 60, material: 'Barra, mancuernas, discos, rack, bancos, gomas, cajón y balón medicinal', fecha: '', notas: '', modelo: IA_MODELOS[0][0] };
  m.innerHTML = `<div class="row"><h2 class="grow">Asistente IA</h2><button class="btn sm ghost" id="iak">Clave de la API</button></div>
    <p class="muted small" style="margin-top:0">Describe a quién va dirigido y qué buscas. Gemini (gratis) prepara un plan basado en la evidencia, con los ejercicios de tu biblioteca y tu base de datos como referencia. El plan se guarda en Planes para que lo revises antes de asignarlo.</p>
    <div class="card list">
      <div class="l">Deporte<div class="chips">${Object.entries(DEP).map(([k, v]) => `<button type="button" class="chip" data-iad="${k}" aria-pressed="${f.deporte === k}"><i style="--c:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
      <label class="l">Objetivo<textarea class="f" id="iao" rows="2" placeholder="p. ej. Mejorar la fuerza máxima y la potencia en el agua antes del campeonato de invierno">${esc(f.objetivo)}</textarea></label>
      <label class="l">Para quién<textarea class="f" id="iap" rows="2" placeholder="p. ej. Nadadores de 14 a 22 años, 3 años entrenando fuerza, 8 sesiones de agua por semana">${esc(f.perfil)}</textarea></label>
      <div class="grid2">
        <label class="l">Nivel<select class="f" id="ian">${['Iniciación', 'Intermedio', 'Avanzado', 'Alto rendimiento'].map(x => `<option ${x === f.nivel ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="l">Semanas<input class="f" type="number" min="1" max="16" id="ias" value="${f.semanas}"></label>
        <label class="l">Duración por sesión (min)<input class="f" type="number" min="10" max="240" id="iadu" value="${f.duracion}"></label>
        <label class="l">Fecha clave (competición, examen…)<input class="f" type="date" id="iaf" value="${esc(f.fecha)}"></label>
      </div>
      <div class="l">Días de entrenamiento<div class="chips">${DIAS.map((d, i) => `<button type="button" class="chip" data-iadia="${i + 1}" aria-pressed="${f.dias.includes(i + 1)}">${d}</button>`).join('')}</div></div>
      <label class="l">Material disponible<input class="f" id="iam" value="${esc(f.material)}"></label>
      <label class="l">Más detalles (lesiones, pruebas de la oposición, marcas, lo que no quieres…)<textarea class="f" id="iax" rows="3">${esc(f.notas)}</textarea></label>
      <label class="l">Modelo<select class="f" id="iamo" style="max-width:340px">${IA_MODELOS.map(([k, n]) => `<option value="${k}" ${k === f.modelo ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="row"><button class="btn pri" id="iag">Generar plan</button><span class="small muted" id="iae"></span></div>
    </div>
    <div id="iar"></div>`;
  const leer = () => Object.assign(f, { objetivo: $('#iao').value.trim(), perfil: $('#iap').value.trim(), nivel: $('#ian').value, semanas: Math.max(1, Math.min(16, +$('#ias').value || 1)), duracion: +$('#iadu').value || 60, fecha: $('#iaf').value, material: $('#iam').value.trim(), notas: $('#iax').value.trim(), modelo: $('#iamo').value });
  m.querySelectorAll('[data-iad]').forEach(b => b.onclick = () => { leer(); f.deporte = b.dataset.iad; vIA(m); });
  m.querySelectorAll('[data-iadia]').forEach(b => b.onclick = () => { const d = +b.dataset.iadia; f.dias = f.dias.includes(d) ? f.dias.filter(x => x !== d) : [...f.dias, d].sort(); b.setAttribute('aria-pressed', f.dias.includes(d)); });
  $('#iak').onclick = () => configIA();
  $('#iag').onclick = async () => {
    leer();
    if (!f.objetivo) return toast('Escribe el objetivo');
    if (!f.dias.length) return toast('Elige al menos un día');
    const btn = $('#iag'), est = $('#iae');
    let key;
    try { key = await claveIA(); } catch (e) { return toast(e.message === 'script' ? 'Falta actualizar el Apps Script con el código nuevo' : 'No hay conexión con la hoja'); }
    if (!key) return configIA(() => $('#iag').click());
    btn.disabled = true; est.textContent = 'Preparando el plan… (puede tardar 1–2 minutos)';
    try {
      const plan = await generarPlanIA(f, key);
      S.ui.iaRes = plan; pintarResultadoIA($('#iar'), plan);
      est.textContent = '';
    } catch (e) { est.textContent = ''; toast('No se pudo generar: ' + e.message, 6000); }
    btn.disabled = false;
  };
  if (S.ui.iaRes) pintarResultadoIA($('#iar'), S.ui.iaRes);
}
function configIA(despues) {
  abrirEd('Clave de la API de Gemini (gratis)', `<div class="card list">
    <p class="small">El asistente usa Gemini, de Google. Tiene un nivel gratuito: no hay que pagar ni poner tarjeta.</p>
    <p class="small"><b>1.</b> Entra en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> con tu cuenta de Google y pulsa <i>Create API key</i> (vale la que se crea sin proyecto de pago).<br><b>2.</b> Pégala aquí. Se guarda en el Apps Script de tu hoja (no en la hoja ni en el móvil de los deportistas).</p>
    <label class="l">Clave<input class="f mono" id="iakk" placeholder="AIza…" autocomplete="off"></label></div>`,
    () => {
      const k = $('#iakk').value.trim();
      if (!/^AIza[\w-]{20,}$/.test(k)) return toast('La clave de Gemini empieza por AIza'), false;
      api({ a: 'coach', op: 'iaGuardarClave', clave: S.auth.clave, key: k }).then(j => { if (j.ok) { iaKey = k; toast('Clave guardada'); despues && despues(); } else toast(j.error === 'op' ? 'Falta actualizar el Apps Script con el código nuevo' : 'No se pudo guardar'); }).catch(() => toast('No hay conexión'));
    });
}
// Ejemplos de la base de datos parecidos al objetivo (por palabras en común)
function refsParecidas(f, n = 12) {
  const pal = new Set(norm([f.objetivo, f.notas].join(' ')).split(/[^a-z0-9]+/).filter(w => w.length > 3));
  return D.referencia.filter(r => r.deporte === f.deporte)
    .map(r => ({ r, p: norm([r.titulo, r.tipo, r.serie, r.texto].join(' ')).split(/[^a-z0-9]+/).filter(w => pal.has(w)).length + Math.random() }))
    .sort((a, b) => b.p - a.p).slice(0, n).map(x => x.r);
}
const IA_SISTEMA = `Eres un preparador físico y entrenador de resistencia con formación universitaria en Ciencias del Deporte. Diseñas planes basados en la evidencia científica actual (sobrecarga progresiva, especificidad, periodización por bloques u ondulante, autorregulación con RPE/RIR, gestión de la fatiga, puesta a punto antes de competiciones o exámenes, prevención de lesiones).
Trabajas con la metodología del entrenador: sesiones de fuerza organizadas en bloques Warm up / movilidad, Activación, Saltos-pliometría y fuerza explosiva, Fuerza 1 (dominante de cadera + empuje), Fuerza 2 (dominante de rodilla + tracción), Accesorios/estructura, y bloque de acondicionamiento opcional. En natación organiza el trabajo por contenidos: Warm up, Ejercicios de técnica, AEL (aeróbico ligero), AEM (aeróbico medio), AEI (aeróbico intensivo/umbral), PAE (potencia aeróbica/VO2 máx), R400, R200 y R100 (ritmos de competición), Potencia (velocidad máxima/aláctico), Kick sets, UW (subacuático) y Cool down, y nómbralos así en los bloques. En carrera y ciclismo usa la nomenclatura de intensidades de sus sesiones de referencia (R0 recuperación … R6 máxima) y el formato de series habitual (p. ej. "8x50 d/10\\" aletas: 25 técnica + 25 nado").
Reglas:
- Usa SIEMPRE que puedas ejercicios de la biblioteca, indicando su id en "ej" y copiando su nombre exacto. Solo si ninguno sirve, propone uno nuevo con "ej": null y "nuevo": true.
- Solo ejercicios que el deportista pueda hacer solo con el material indicado.
- Las cargas de fuerza se expresan con RPE/REP o RIR y repeticiones; nunca kilos absolutos.
- Responde SOLO con un objeto JSON válido, sin texto antes ni después, con este formato:
{"nombre":"…","desc":"resumen de 1–2 frases","justificacion":"por qué está planteado así, citando los principios y la evidencia que lo apoyan (máx. 150 palabras)","etiquetasSemana":["Base","Carga",…],
 "sesiones":[{"dia":1,"semanas":[1,2,3,4],"titulo":"…","deporte":"fuerza|natacion|carrera|ciclismo|otro","duracion":60,"rpeObj":"6–7","notas":"…",
   "bloques":[{"nombre":"…","series":[3,3,4,4],"tiempo":"10'","items":[{"ej":"id o null","nuevo":false,"nombre":"…","reps":["5","5","5-5-5-3","5-3-3-3"],"rpe":["REP 7","REP 8","REP 8","REP 9"],"desc":"75 s","notas":"indicación técnica breve","texto":"solo en natación, carrera y ciclismo: la tarea escrita tal cual","dist":"","tiempo":"","ritmo":""}]}]}]}
- "dia" va de 1 (lunes) a 7 (domingo). "semanas" son las semanas del plan en que se repite esa sesión. Los campos que cambian cada semana (series, reps, rpe, dist, tiempo, ritmo, texto) pueden ser una lista con un valor por semana o un único valor si no cambian.
- En fuerza cada ejercicio lleva reps; si cambian por serie, sepáralas con guiones (5-5-3).`;
async function generarPlanIA(f, key) {
  const lib = D.ejercicio.filter(e => e.deporte === f.deporte || (f.deporte !== 'fuerza' && e.deporte === 'fuerza')).sort(ordenEj)
    .map(e => `${e.id} | ${e.deporte} | ${e.cat || ''} | ${e.nombre}`).join('\n');
  const refs = refsParecidas(f).map(r => `### ${r.titulo} (${r.tipo}${r.medida ? ', ' + r.medida : ''})\n${String(r.serie || r.texto).slice(0, 1200)}`).join('\n\n');
  const hoy = key2(new Date());
  const prompt = `Prepara un plan de ${f.semanas} ${f.semanas === 1 ? 'semana' : 'semanas'} de ${DEP[f.deporte].n.toLowerCase()}.
Objetivo: ${f.objetivo}
Para quién: ${f.perfil || 'sin especificar'}
Nivel: ${f.nivel}
Días: ${f.dias.map(d => DIAS[d - 1]).join(', ')} (${f.dias.length} sesiones por semana de este deporte)
Duración por sesión: unos ${f.duracion} minutos
Material: ${f.material || 'sin especificar'}
${f.fecha ? `Fecha clave: ${f.fecha} (hoy es ${hoy}); planifica la puesta a punto para que llegue en forma.` : ''}
Más detalles: ${f.notas || 'ninguno'}

BIBLIOTECA DE EJERCICIOS (id | deporte | categoría | nombre):
${lib || '(vacía)'}

${refs ? `SESIONES DE REFERENCIA DE LA BASE DE DATOS DEL ENTRENADOR (imita su estilo y notación):\n${refs}` : ''}`;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(f.modelo) + ':generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: IA_SISTEMA }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 60000, responseMimeType: 'application/json' },
    }),
  });
  const j = await r.json();
  if (!r.ok) { const m = j.error?.message || ''; throw new Error(/API key not valid|API_KEY_INVALID/i.test(m) ? 'la clave no es válida' : /quota|RESOURCE_EXHAUSTED/i.test(m) ? 'has llegado al límite gratuito por ahora; espera un momento o prueba con Gemini 2.5 Flash' : m || ('error ' + r.status)); }
  const cand = (j.candidates || [])[0];
  const txt = (cand?.content?.parts || []).map(p => p.text || '').join('');
  if (!txt) throw new Error(cand?.finishReason === 'MAX_TOKENS' ? 'el plan era demasiado largo; prueba con menos semanas' : (j.promptFeedback?.blockReason ? 'la respuesta fue bloqueada' : 'la respuesta no trae un plan'));
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('la respuesta no trae un plan');
  let plan;
  try { plan = JSON.parse(txt.slice(a, b + 1)); } catch (e) { throw new Error(cand?.finishReason === 'MAX_TOKENS' ? 'el plan era demasiado largo; prueba con menos semanas' : 'la respuesta no se pudo leer'); }
  plan._semanas = f.semanas; plan._deporte = f.deporte; plan._uso = j.usageMetadata;
  return plan;
}
const key2 = d => key(d);
// Convierte la respuesta de la IA en un plan de la app (una sesión por semana y día)
function planDesdeIA(p) {
  const N = p._semanas || 1, val = (v, w) => Array.isArray(v) ? (v[w - 1] ?? v[v.length - 1] ?? '') : (v ?? '');
  const sesiones = [];
  (p.sesiones || []).forEach(t => {
    const sem = (Array.isArray(t.semanas) && t.semanas.length ? t.semanas : Array.from({ length: N }, (_, i) => i + 1)).filter(w => w >= 1 && w <= N);
    sem.forEach(w => sesiones.push({
      id: uid(), semana: w, dia: Math.min(7, Math.max(1, +t.dia || 1)), titulo: t.titulo || '', deporte: DEP[t.deporte] ? t.deporte : p._deporte,
      subtitulo: `Semana ${w}${p.etiquetasSemana?.[w - 1] ? ' · ' + p.etiquetasSemana[w - 1] : ''}`, duracion: String(t.duracion || ''), rpeObj: String(val(t.rpeObj, w) || ''), notas: t.notas || '',
      bloques: (t.bloques || []).map(b => ({ id: uid(), nombre: b.nombre || '', series: val(b.series, w) || '', tiempo: b.tiempo || '', items: (b.items || []).map(it => {
        const ej = it.ej && byId('ejercicio', it.ej);
        const o = { id: uid(), nombre: ej ? ej.nombre : (it.nombre || ''), video: ej?.video || '' };
        if (ej) o.ej = ej.id;
        ['reps', 'carga', 'rpe', 'desc', 'dist', 'tiempo', 'ritmo', 'texto', 'series'].forEach(k => { const v = val(it[k], w); if (v !== '' && v != null) o[k] = String(v); });
        o.notas = [it.notas, !ej && it.nombre ? 'Ejercicio nuevo propuesto por la IA (sin vídeo)' : ''].filter(Boolean).join(' · ');
        return o;
      }) })),
    }));
  });
  return { id: uid(), nombre: p.nombre || 'Plan IA', desc: [p.desc, p.justificacion ? 'Justificación: ' + p.justificacion : ''].filter(Boolean).join('\n\n'), semanas: N, sesiones, fuente: 'Asistente IA' };
}
function pintarResultadoIA(el, p) {
  const pl = planDesdeIA(p);
  const nuevos = new Set(); pl.sesiones.forEach(s => s.bloques.forEach(b => b.items.forEach(it => { if (!it.ej && s.deporte === 'fuerza') nuevos.add(it.nombre); })));
  const sem1 = pl.sesiones.filter(s => s.semana === 1).sort((a, b) => a.dia - b.dia);
  el.innerHTML = `<div class="card list"><div class="row"><h3 class="grow" style="margin:0">${esc(pl.nombre)}</h3><button class="btn pri" id="iasv">Guardar en Planes</button></div>
    <p class="small" style="margin:0">${esc(p.desc || '')}</p>
    ${p.justificacion ? `<p class="small muted" style="margin:0"><b>Por qué así:</b> ${esc(p.justificacion)}</p>` : ''}
    <p class="small muted" style="margin:0">${pl.semanas} ${pl.semanas === 1 ? 'semana' : 'semanas'} · ${pl.sesiones.length} sesiones${nuevos.size ? ` · ${nuevos.size} ejercicios nuevos fuera de la biblioteca: ${esc([...nuevos].join(', '))}` : ''}</p>
    <h3 style="margin:6px 0 0">Semana 1</h3>
    ${sem1.map(s => `<details><summary><b>${DIAS[s.dia - 1]} · ${esc(s.titulo)}</b> <span class="small muted">${esc(DEP[s.deporte]?.n || '')}${s.duracion ? ' · ' + s.duracion + ' min' : ''}</span></summary>
      ${s.notas ? `<p class="small">${esc(s.notas)}</p>` : ''}
      ${s.bloques.map(b => `<p class="small" style="margin:6px 0 2px"><b>${esc(b.nombre)}</b>${b.series ? ` · ${esc(b.series)} series` : ''}${b.tiempo ? ` · ${esc(b.tiempo)}` : ''}</p><ul class="small" style="margin:0;padding-left:18px">${b.items.map(it => `<li>${esc(it.nombre)}${[it.reps && 'reps ' + it.reps, it.rpe, it.desc && 'desc. ' + it.desc].filter(Boolean).length ? ' · ' + esc([it.reps && 'reps ' + it.reps, it.rpe, it.desc && 'desc. ' + it.desc].filter(Boolean).join(' · ')) : ''}${it.texto ? txtHTML(it.texto, s.deporte) : ''}</li>`).join('')}</ul>`).join('')}</details>`).join('')}
  </div>`;
  $('#iasv').onclick = () => { guardar([{ tipo: 'plan', doc: pl }]); S.ui.iaRes = null; S.ui.plan = pl.id; S.tab = 'planes'; LS.set('abs2-tab', 'planes'); marcoCoach(); vPlan($('#main')); toast('Plan guardado: revísalo y asígnalo desde el Calendario'); };
}

/* ---------- Carga (sRPE) ---------- */
const ua = r => r && r.rpe && r.minutos ? Math.round(+r.rpe * +r.minutos) : 0;
function cargaPorDia(depId) {
  const m = {};
  D.registro.filter(r => (r.dep || S.yo?.id) === depId && ua(r)).forEach(r => { const f = r.fecha || byId('sesion', r.ses || r.id)?.fecha; if (f) m[f] = (m[f] || 0) + ua(r); });
  return m;
}
function semanas(porDia, n, hasta) {
  const lun = monday(hasta || new Date()); const out = [];
  for (let i = n - 1; i >= 0; i--) { const l = addDays(lun, -7 * i); let t = 0; for (let d = 0; d < 7; d++) t += porDia[key(addDays(l, d))] || 0; out.push({ l, t }); }
  return out;
}
// Grupo: sesiones previstas y hechas por semana (suma de todos), % por persona esta semana y la anterior
function grupoStatsHTML(deps) {
  if (!deps.length) return '';
  const W = deps.map(d => ({ d, w: statsSem(d, 8) }));
  return `<div class="card"><h3>Grupo: sesiones previstas y hechas</h3><div class="chart" id="chG"></div><p class="small muted" style="margin:4px 0 0"><i class="lg" style="--c:var(--line)"></i> previstas <i class="lg" style="--c:var(--s-natacion)"></i> hechas (suma de todo el grupo)</p></div>
    <div class="card scroll"><h3>% hecho por persona</h3><table class="data"><thead><tr><th>Deportista</th>${W[0].w.slice(-4).map(x => `<th class="n">${fmtD(x.l)}</th>`).join('')}<th>Check-in</th></tr></thead><tbody>
    ${W.map(({ d, w }) => `<tr><td>${esc(d.nombre)}</td>${w.slice(-4).map(x => `<td class="n">${x.pct === null ? '—' : x.pct + ' %'}</td>`).join('')}<td class="small">${w.at(-1).c ? (checkinMal(w.at(-1).c) ? '⚠️ ' : '✓ ') + CHECK_P.map(([k]) => w.at(-1).c[k]).join('·') : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function vCarga(m) {
  if (S.ui.cargaG && !byId('grupo', S.ui.cargaG)) S.ui.cargaG = '';
  const deps = S.ui.cargaG ? miembros(byId('grupo', S.ui.cargaG)) : depsOrd();
  if (!depsOrd().length) { m.innerHTML = '<div class="empty">No hay deportistas.</div>'; return; }
  if (S.ui.cargaDep && byId('deportista', S.ui.cargaDep)) return vCargaDep(m, byId('deportista', S.ui.cargaDep));
  const filas = deps.map(d => { const w = semanas(cargaPorDia(d.id), 2); return { d, ant: w[0].t, act: w[1].t }; });
  m.innerHTML = `<h2>Carga de entrenamiento</h2><p class="muted small">sRPE = RPE de la sesión × minutos. Lo registra cada deportista al terminar.</p>
    ${D.grupo.length ? `<div class="chips"><button class="chip" data-cgg="" aria-pressed="${!S.ui.cargaG}">Todos</button>${gruposOrd().map(g => `<button class="chip" data-cgg="${g.id}" aria-pressed="${S.ui.cargaG === g.id}"><i style="--c:var(--accent)"></i>${esc(g.nombre)}</button>`).join('')}</div>` : ''}
    ${S.ui.cargaG ? grupoStatsHTML(deps) : ''}
    <div class="card scroll"><table class="data"><thead><tr><th>Deportista</th><th class="n">Semana pasada (UA)</th><th class="n">Esta semana (UA)</th><th class="n">Cambio</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td><button class="btn ghost sm" data-cg="${f.d.id}">${esc(f.d.nombre)}</button></td><td class="n">${f.ant}</td><td class="n">${f.act}</td><td class="n">${f.ant ? (f.act >= f.ant ? '+' : '') + Math.round((f.act - f.ant) / f.ant * 100) + ' %' : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  m.querySelectorAll('[data-cg]').forEach(b => b.onclick = () => { S.ui.cargaDep = b.dataset.cg; renderCoach(); });
  const ch = $('#chG'); if (ch) { const W = deps.map(d => statsSem(d, 8)); barras2(ch, W[0].map((x, i) => { const a = W.reduce((t, w) => t + w[i].n, 0), b = W.reduce((t, w) => t + w[i].hechas, 0); return { etq: fmtD(x.l), a, b, tip: `Semana del ${fmtD(x.l)}: ${b} de ${a} sesiones hechas (${a ? Math.round(b / a * 100) : 0} %)` }; })); }
  m.querySelectorAll('[data-cgg]').forEach(b => b.onclick = () => { S.ui.cargaG = b.dataset.cgg; renderCoach(); });
}
function vCargaDep(m, dep, propio) {
  const porDia = cargaPorDia(dep.id);
  const sem = semanas(porDia, 8);
  const lun = monday(new Date());
  const dias = Array.from({ length: 28 }, (_, i) => { const d = addDays(lun, -21 + i); return { d, t: porDia[key(d)] || 0 }; });
  const regs = D.registro.filter(r => (r.dep || S.yo?.id) === dep.id && ua(r)).map(r => ({ r, s: byId('sesion', r.ses || r.id) })).sort((a, b) => (b.r.fecha || '').localeCompare(a.r.fecha || '')).slice(0, 40);
  const act = sem[7].t, ant = sem[6].t, media4 = Math.round((sem[3].t + sem[4].t + sem[5].t + sem[6].t) / 4);
  m.innerHTML = `${propio ? `<h2>Mi carga</h2>${S.strava?.conectado ? `<div class="row small muted"><span class="slogo">${STRAVA_LOGO}</span><span class="grow">Strava conectado${S.strava.nombre ? ' · ' + esc(S.strava.nombre) : ''}</span><button class="btn sm ghost" id="stA">Actualizar</button><button class="btn sm ghost danger" id="stD">Desconectar</button></div>` : stravaBoxDep()}` : `<div class="row"><button class="btn sm ghost" id="vc">← Todos</button><h2 class="grow">${esc(dep.nombre)}</h2></div>`}
    <div class="kpis"><div class="kpi"><small>Esta semana</small><b>${act}</b> <span class="small muted">UA</span></div><div class="kpi"><small>Semana pasada</small><b>${ant}</b> <span class="small muted">UA</span></div><div class="kpi"><small>Media 4 semanas anteriores</small><b>${media4}</b> <span class="small muted">UA</span></div></div>
    ${statsHTML(statsSem(dep), !propio)}
    <div class="card"><h3>Carga semanal (últimas 8 semanas)</h3><div class="chart" id="chW"></div></div>
    <div class="card"><h3>Carga diaria (últimas 4 semanas)</h3><div class="chart" id="chD"></div></div>
    <div class="card scroll"><h3>Sesiones registradas</h3><table class="data"><thead><tr><th>Fecha</th><th>Sesión</th><th class="n">Min</th><th class="n">RPE</th><th class="n">UA</th></tr></thead><tbody>
    ${regs.length ? regs.map(({ r, s }) => `<tr><td>${r.fecha ? fmtD(parseKey(r.fecha)) : ''}</td><td>${esc(s?.titulo || DEP[s?.deporte]?.n || '')}</td><td class="n">${r.minutos}</td><td class="n">${r.rpe}</td><td class="n">${ua(r)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Sin registros todavía.</td></tr>'}</tbody></table></div>`;
  const vc = $('#vc'); if (vc) vc.onclick = () => { S.ui.cargaDep = null; renderCoach(); };
  if (propio) enlazarStravaDep();
  barras2($('#chPH'), statsSem(dep).map(x => ({ etq: fmtD(x.l), a: x.ePlan, b: x.eHecho, tip: `Semana del ${fmtD(x.l)}: ${x.ePlan} ECOs previstos · ≈${x.eHecho} hechos · ${x.hechas}/${x.n} sesiones` })));
  barras($('#chW'), sem.map(x => ({ etq: fmtD(x.l), v: x.t, tip: `Semana del ${fmtD(x.l)}: ${x.t} UA` })));
  barras($('#chD'), dias.map(x => ({ etq: x.d.getDay() === 1 ? fmtD(x.d) : '', v: x.t, tip: `${fmtLong(x.d)}: ${x.t} UA`, hoy: key(x.d) === key(today()) })));
}
// Gráfico de barras de una sola serie (SVG), con tooltip al pasar o tocar
// Previsto frente a hecho por semana (últimas n semanas) para una persona
function statsSem(d, n = 12) {
  const lun0 = monday(today()), ss = sesionesDe(d);
  return Array.from({ length: n }, (_, i) => {
    const l = addDays(lun0, -7 * (n - 1 - i)), k0 = key(l), k1 = key(addDays(l, 6)), sem = ss.filter(s => s.fecha >= k0 && s.fecha <= k1);
    let ePlan = 0, eHecho = 0, mPlan = 0, mHecho = 0, uaT = 0, rpes = [];
    sem.forEach(s => { const x = realizado(s, d); if (x.plan) { ePlan += x.plan.ecos || 0; mPlan += x.plan.metros || 0; eHecho += x.ecos || 0; mHecho += x.dist || 0; } const r = s.grupo ? D.registro.find(y => y.ses === s.id && y.dep === d.id) : (S.auth?.modo === 'dep' ? regDe(s) : byId('registro', s.id)); if (r) { uaT += ua(r); if (r.rpe !== undefined && r.rpe !== '') rpes.push(+r.rpe); } });
    const hechas = sem.filter(s => hechaPor(s, d)).length, c = checkinDe(d.id, k0);
    return { l, n: sem.length, hechas, pct: sem.length ? Math.round(hechas / sem.length * 100) : null, ePlan, eHecho, mPlan, mHecho, ua: uaT, rpe: rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length) : null, c };
  });
}
function statsHTML(w, conCk) {
  return `<div class="card"><h3>Previsto y hecho por semana</h3><div class="chart" id="chPH"></div><p class="small muted" style="margin:4px 0 0"><i class="lg" style="--c:var(--line)"></i> ECOs previstos <i class="lg" style="--c:var(--s-natacion)"></i> ECOs hechos (≈, con la distancia o el tiempo de Strava)</p></div>
    <div class="card scroll"><h3>Semana a semana</h3><table class="data"><thead><tr><th>Semana</th><th class="n">Sesiones</th><th class="n">% hecho</th><th class="n">ECOs prev.</th><th class="n">ECOs hechos</th><th class="n">Distancia prev.</th><th class="n">Hecha</th><th class="n">Carga (UA)</th><th class="n">RPE medio</th>${conCk ? '<th>Check-in</th>' : ''}</tr></thead><tbody>
    ${w.slice().reverse().map(x => `<tr><td>${fmtD(x.l)}</td><td class="n">${x.hechas}/${x.n}</td><td class="n">${x.pct === null ? '—' : x.pct + ' %'}</td><td class="n">${x.ePlan || '—'}</td><td class="n">${x.ePlan ? x.eHecho : '—'}</td><td class="n">${x.mPlan ? fmtDist(x.mPlan) : '—'}</td><td class="n">${x.mPlan || x.mHecho ? fmtDist(x.mHecho) : '—'}</td><td class="n">${x.ua || '—'}</td><td class="n">${x.rpe === null ? '—' : x.rpe.toFixed(1).replace('.', ',')}</td>${conCk ? `<td class="small">${x.c ? (checkinMal(x.c) ? '⚠️ ' : '') + CHECK_P.map(([k]) => x.c[k]).join('·') : '—'}</td>` : ''}</tr>`).join('')}</tbody></table>
    ${conCk ? '<small class="muted">Check-in: sueño · fatiga · molestias · estrés · motivación (1–5).</small>' : ''}</div>`;
}
function barras2(el, datos) {
  const W = Math.max(300, Math.round(el.clientWidth || 640)), H = 200, pl = 40, pb = 22, pt = 8, max = Math.max(10, ...datos.flatMap(d => [d.a, d.b]));
  const paso = niceStep(max), top = Math.ceil(max / paso) * paso, n = datos.length, bw = (W - pl) / n, gap = Math.min(8, bw * .25), w2 = (bw - gap) / 2;
  const y = v => pt + (H - pt - pb) * (1 - v / top);
  let g = '';
  for (let v = 0; v <= top; v += paso) g += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--chart-grid)" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const bars = datos.map((d, i) => { const x = pl + i * bw + gap / 2; return `<rect x="${x}" y="${y(d.a)}" width="${w2 - 1}" height="${Math.max(0, y(0) - y(d.a))}" rx="3" fill="var(--line)"/><rect x="${x + w2}" y="${y(d.b)}" width="${w2 - 1}" height="${Math.max(0, y(0) - y(d.b))}" rx="3" fill="var(--s-natacion)"/><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent" data-i="${i}"/>${i % Math.max(1, Math.ceil(n * 52 / (W - pl))) === 0 ? `<text x="${x + w2}" y="${H - 6}" text-anchor="middle">${esc(d.etq)}</text>` : ''}`; }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ECOs previstos y hechos por semana">${g}${bars}</svg><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip'), svg = el.querySelector('svg');
  const show = ev => { const t = ev.target.closest('[data-i]'); if (!t) return tip.hidden = true; const d = datos[+t.dataset.i]; const b = svg.getBoundingClientRect(), s = b.width / W; tip.textContent = d.tip; tip.style.left = ((+t.getAttribute('x') + bw / 2) * s) + 'px'; tip.style.top = (y(Math.max(d.a, d.b)) * s) + 'px'; tip.hidden = false; };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', () => tip.hidden = true);
}
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
  S.yo = j.dep; D.deportista = [j.dep]; D.grupo = j.grupos || []; D.sesion = j.sesiones; D.registro = j.registros; D.ejercicio = j.ejercicios;
  D.actividad = j.actividades || []; S.strava = j.strava || {};
  D.mensaje = j.mensajes || []; D.checkin = j.checkins || []; S.pushApp = j.pushApp || S.pushApp || '';
  if (S.pushApp) cargarPush(j.dep.id);
  reubicarGym();
}
/* Días de gimnasio: las sesiones de fuerza del grupo se colocan, semana a semana y en orden, en los días que la persona
   ha marcado (disponibilidad, 1 = lunes). Si hay más sesiones que días, las que sobran se quedan en su fecha.
   Una sesión que ya tiene algo registrado se queda en el día en que se hizo. */
function reubicarGym() {
  const dias = [...new Set(S.yo?.disponibilidad || [])].map(Number).filter(n => n >= 1 && n <= 7).sort((a, b) => a - b), sem = {};
  (D.sesion || []).forEach(s => {
    s.fechaPlan = s.fechaPlan || s.fecha; s.fecha = s.fechaPlan;
    if (dias.length && s.deporte === 'fuerza' && s.grupo && s.fechaPlan) (sem[lunesDe(s.fechaPlan)] = sem[lunesDe(s.fechaPlan)] || []).push(s);
  });
  Object.entries(sem).forEach(([lun, l]) => {
    l.sort((a, b) => a.fechaPlan.localeCompare(b.fechaPlan) || String(a.id).localeCompare(String(b.id)));
    const r = l.map(s => regDe(s)), hecho = r.map(x => x?.fecha && (Object.keys(x.sets || {}).length || Object.keys(x.hecho || {}).length || x.minutos));
    const libres = dias.map(n => key(addDays(parseKey(lun), n - 1))).filter(f => !l.some((s, i) => hecho[i] && r[i].fecha === f));
    l.forEach((s, i) => { s.fecha = hecho[i] ? r[i].fecha : (libres.shift() || s.fechaPlan); });
  });
}
function diasGymHTML() {
  const d = S.yo?.disponibilidad || [];
  return `<div class="gymdias"><b>Mis días de gimnasio</b><div class="chips">${DIAS.map((n, i) => `<button type="button" class="chip" data-gdia="${i + 1}" aria-pressed="${d.includes(i + 1)}">${n}</button>`).join('')}</div><small class="muted">${d.length ? 'Tus sesiones de fuerza del grupo aparecen en estos días.' : 'Marca los días que puedes ir al gimnasio y tus sesiones de fuerza se colocarán en ellos.'}</small></div>`;
}
function enlazarDiasGym(m) {
  m.querySelectorAll('[data-gdia]').forEach(b => b.onclick = async () => {
    const n = +b.dataset.gdia, l = new Set(S.yo.disponibilidad || []), antes = [...l];
    l.has(n) ? l.delete(n) : l.add(n);
    S.yo.disponibilidad = [...l].sort((a, c) => a - c);
    reubicarGym(); cacheDep(); renderDep();
    try { const j = await api({ a: 'depDias', id: S.auth.id, pin: S.auth.pin, dias: S.yo.disponibilidad }); if (!j.ok) throw 0; }
    catch (e) { S.yo.disponibilidad = antes; reubicarGym(); cacheDep(); renderDep(); toast('Sin conexión: no se han guardado tus días.'); }
  });
}
/* ---------- Seguimiento: mensajes, check-in semanal, previsto frente a hecho ---------- */
const mid = () => 'm' + uid();
const lunesDe = f => key(monday(f ? parseKey(f) : today()));
const CHECK_P = [['sueno', 'Sueño', 'muy mal', 'muy bien'], ['fatiga', 'Fatiga', 'nada', 'mucha'], ['molestias', 'Molestias o dolor', 'nada', 'mucho'], ['estres', 'Estrés', 'nada', 'mucho'], ['motivacion', 'Motivación', 'nada', 'mucha']];
const checkinMal = c => !!c && (+c.fatiga >= 4 || +c.molestias >= 4 || +c.estres >= 4 || (+c.sueno && +c.sueno <= 2) || (+c.motivacion && +c.motivacion <= 2));
const checkinDe = (dep, lun) => D.checkin.find(c => c.dep === dep && c.semana === lun);
const hashT = t => { let h = 5381; for (const ch of String(t)) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return h.toString(36); };
const vistos = () => LS.get('abs2-visto', {});
const marcarVisto = ks => { const v = vistos(); ks.forEach(k => v[k] = 1); LS.set('abs2-visto', v); };
// Conversación de una sesión con una persona: sus comentarios del registro + los mensajes de los dos
function hilo(s, d, r) {
  const l = [];
  (s.bloques || []).forEach((b, bi) => (b.items || []).forEach((it, ii) => { const c = r?.coment?.[`${bi}|${ii}`]; if (c) l.push({ de: 'dep', txt: c, sobre: it.nombre, k: 'c:' + (r.id || s.id) + ':' + hashT(c) }); }));
  if (r?.nota) l.push({ de: 'dep', txt: r.nota, sobre: 'la sesión', k: 'c:' + (r.id || s.id) + ':' + hashT(r.nota) });
  D.mensaje.filter(m => m.ses === s.id && m.dep === d.id).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).forEach(m => l.push({ ...m, k: m.id }));
  return l;
}
function hiloHTML(s, d, r, yo) {
  const l = hilo(s, d, r), nom = esc(String(d.nombre).split(' ')[0]);
  return `<div class="hilo">${l.length ? l.map(m => `<div class="msg ${m.de === yo ? 'mio' : ''}"><small>${m.de === 'coach' ? 'Entrenador' : nom}${m.sobre ? ' · sobre ' + esc(m.sobre) : ''}${m.origen ? ' · en ' + esc(m.origen) : ''}${m.fecha ? ' · ' + new Date(m.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</small><p>${esc(m.txt)}</p></div>`).join('')
      : `<p class="small muted" style="margin:0">${yo === 'coach' ? 'Todavía no ha escrito nada en esta sesión.' : '¿Alguna duda? Escribe aquí a tu entrenador.'}</p>`}
    <form class="msgf" data-msgf="${s.id}|${d.id}"><textarea class="com" rows="1" required placeholder="${yo === 'coach' ? 'Contestar a ' + nom + '…' : 'Escribe a tu entrenador…'}"></textarea><button class="btn sm pri">Enviar</button></form></div>`;
}
async function enviarMensaje(sid, depId, txt, yo) {
  const doc = { id: mid(), ses: sid, dep: depId, de: yo, txt, fecha: new Date().toISOString() };
  if (yo === 'coach') { guardar([{ tipo: 'mensaje', doc }]); marcarVisto([doc.id]); return; }
  D.mensaje.push(doc); marcarVisto([doc.id]); cacheDep();
  try { const j = await api({ a: 'depGuardar', id: S.auth.id, pin: S.auth.pin, docs: [{ tipo: 'mensaje', doc }] }); if (!j.ok) throw 0; toast('Enviado'); } catch (e) { toast('Sin conexión: no se ha enviado. Inténtalo luego.'); D.mensaje = D.mensaje.filter(m => m.id !== doc.id); }
}
function cacheDep() { const c = LS.get('abs2-cache', null); if (c?.modo === 'dep' && c.r) { c.r.mensajes = D.mensaje; c.r.checkins = D.checkin; if (S.yo && c.r.dep) c.r.dep.disponibilidad = S.yo.disponibilidad || []; LS.set('abs2-cache', c); } }
// Lo hecho frente a lo previsto: en natación y carrera con Strava (distancia o tiempo); en fuerza, las series marcadas
function realizado(s, d) {
  const r = s.grupo ? D.registro.find(x => x.ses === s.id && x.dep === d.id) : (S.auth?.modo === 'dep' ? regDe(s) : byId('registro', s.id));
  if (s.deporte === 'fuerza') {
    let tot = 0, ok = 0; (s.bloques || []).forEach((b, bi) => (b.items || []).forEach((it, ii) => { const n = nSeries(b, it); for (let k = 0; k < n; k++) { tot++; if (r?.sets?.[`${bi}|${ii}|${k}`]?.ok) ok++; } }));
    return { tipo: 'series', tot, ok, pct: tot && (ok || r) ? ok / tot : null };
  }
  const tipos = Object.entries(DEP_STRAVA).filter(([, v]) => v === s.deporte).map(([k]) => k);
  const acts = actividadesDe(d.id, s.fecha).filter(a => tipos.includes(a.tipo));
  const plan = conEcos(s.deporte) ? ecoDe(s) : null, dist = acts.reduce((a, x) => a + (x.dist || 0), 0), mov = acts.reduce((a, x) => a + (x.mov || 0), 0);
  let pct = null;
  if (plan && acts.length) pct = plan.metros && dist ? dist / plan.metros : plan.min ? mov / 60 / plan.min : null;
  return { tipo: 'strava', plan, acts, dist, mov, pct, ecos: plan && pct !== null ? Math.round(plan.ecos * Math.min(pct, 1.5)) : null };
}
function realizadoHTML(s, d) {
  const rt = d && D.registro.find(r => r.ses === s.id && r.dep === d.id && r.t2g);
  if (rt) return `<div class="pvh"><span>Hecho en Train2Go</span><b>${rt.t2g} %</b><i class="bar"><i style="width:${Math.min(100, rt.t2g)}%"></i></i></div>`;
  const x = realizado(s, d);
  if (x.tipo === 'series') return x.tot ? `<div class="pvh"><span>Series hechas</span><b>${x.ok} de ${x.tot}</b>${x.pct !== null ? `<i class="bar"><i style="width:${Math.round(x.pct * 100)}%"></i></i><b>${Math.round(x.pct * 100)} %</b>` : ''}</div>` : '';
  if (!x.plan) return '';
  return `<div class="pvh"><span>Previsto</span><b>${ecoTxt(x.plan)} · ${fmtMin(x.plan.min)}</b>${x.acts.length ? `<span>Hecho (Strava)</span><b>${x.dist ? fmtDist(x.dist) + ' · ' : ''}${fmtMin(x.mov / 60)}${x.ecos !== null ? ` · ≈${x.ecos} ECOs` : ''}</b><i class="bar"><i style="width:${Math.min(100, Math.round(x.pct * 100))}%"></i></i><b>${Math.round(x.pct * 100)} %</b>` : '<span class="muted">Aún no hay actividad de Strava de este día</span>'}</div>`;
}
// Check-in semanal del deportista (lunes): 5 preguntas de 1 a 5
function checkinBox() {
  const lun = lunesDe(S.ui.dia), c = checkinDe(S.yo.id, lun);
  if (c || lun !== lunesDe()) return '';
  const v = S.ui.ck || (S.ui.ck = {});
  return `<section class="card list checkin"><h3>Check-in de la semana</h3><p class="small muted" style="margin:0">1 minuto: ayuda a tu entrenador a ajustar la semana.</p>
    ${CHECK_P.map(([k, n, a, b]) => `<div class="l">${n}<div class="ck5">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-ck="${k}|${i}" aria-pressed="${v[k] === i}">${i}</button>`).join('')}</div><small class="muted">1 = ${a} · 5 = ${b}</small></div>`).join('')}
    <textarea class="com" id="ckN" placeholder="¿Algo más que deba saber? (opcional)">${esc(v.nota || '')}</textarea>
    <button class="btn pri" id="ckG">Enviar check-in</button></section>`;
}
function enlazarCheckin(m) {
  m.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.ck.split('|'); S.ui.ck[k] = +i; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const n = $('#ckN'); if (n) n.oninput = () => S.ui.ck.nota = n.value;
  const g = $('#ckG'); if (g) g.onclick = async () => {
    const v = S.ui.ck; if (CHECK_P.some(([k]) => !v[k])) return toast('Contesta las 5 preguntas');
    const doc = { id: S.yo.id + '~' + lunesDe(), dep: S.yo.id, semana: lunesDe(), ...v, fecha: new Date().toISOString() };
    g.disabled = true;
    try { const j = await api({ a: 'depGuardar', id: S.auth.id, pin: S.auth.pin, docs: [{ tipo: 'checkin', doc }] }); if (!j.ok) throw 0; D.checkin.push(doc); cacheDep(); S.ui.ck = null; toast('Check-in enviado. ¡Gracias!'); renderDep(); }
    catch (e) { g.disabled = false; toast('Sin conexión: inténtalo luego'); }
  };
}
/* ---------- Avisos al móvil (OneSignal) ---------- */
const enPantalla = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function cargarPush(ext) {
  if (!S.pushApp || S.pushCargado === ext) return; S.pushCargado = ext;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  if (!document.getElementById('os-sdk')) { const sc = document.createElement('script'); sc.id = 'os-sdk'; sc.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; sc.defer = true; document.head.appendChild(sc); }
  const base = location.pathname.replace(/[^/]*$/, '');
  OneSignalDeferred.push(async OS => {
    try {
      if (!S.OS) await OS.init({ appId: S.pushApp, serviceWorkerPath: base.slice(1) + 'sw.js', serviceWorkerParam: { scope: base }, notifyButton: { enable: false }, allowLocalhostAsSecureOrigin: true });
      S.OS = OS; await OS.login(ext);
      OS.Notifications.addEventListener('permissionChange', () => (S.auth?.modo === 'dep' ? renderDep : renderCoach)());
    } catch (e) { console.warn('OneSignal', e); }
  });
}
function avisosBox() {
  if (!S.pushApp || !('Notification' in window || esIOS())) return '';
  if ('Notification' in window && Notification.permission !== 'default') return '';
  if (LS.get('abs2-pushNo', false)) return '';
  if (esIOS() && !enPantalla()) return `<div class="card row small"><span class="grow">🔔 Para recibir avisos en el iPhone, instala la app: botón Compartir → «Añadir a pantalla de inicio», y ábrela desde el icono.</span><button class="icon" id="pushX" aria-label="Cerrar">✕</button></div>`;
  return `<div class="card row"><span class="grow"><b>🔔 Activa los avisos</b><br><small class="muted">${S.auth?.modo === 'dep' ? 'Te avisamos cuando te toque entrenar y cuando tu entrenador te conteste.' : 'Te avisamos cuando alguien comente, mande un mensaje o tenga un check-in preocupante.'}</small></span><button class="btn sm pri" id="pushOn">Activar</button><button class="icon" id="pushX" aria-label="Ahora no">✕</button></div>`;
}
function enlazarAvisos() {
  const b = $('#pushOn'); if (b) b.onclick = async () => { if (!S.OS) return toast('Un momento, cargando…'); try { await S.OS.Notifications.requestPermission(); } catch (e) {} setTimeout(() => (S.auth?.modo === 'dep' ? renderDep : renderCoach)(), 500); };
  const x = $('#pushX'); if (x) x.onclick = () => { LS.set('abs2-pushNo', true); x.closest('.card').remove(); };
}
// Importa un archivo con deportistas y sus sesiones (p. ej. lo exportado de Train2Go): [{tipo, doc}, …]
async function importarArchivo(fi) {
  let arr;
  try { arr = JSON.parse(await fi.text()); } catch (e) { return toast('Ese archivo no se puede leer'); }
  const TIPOS = ['deportista', 'grupo', 'sesion', 'plan', 'ejercicio', 'referencia'];
  const docs = (Array.isArray(arr) ? arr : []).filter(x => x && TIPOS.includes(x.tipo) && x.doc?.id);
  if (!docs.length) return toast('El archivo no tiene deportistas ni sesiones');
  const nuevos = docs.filter(x => !byId(x.tipo, x.doc.id)), ya = docs.length - nuevos.length;
  const cuenta = t => nuevos.filter(x => x.tipo === t).length;
  const deps = nuevos.filter(x => x.tipo === 'deportista').map(x => x.doc);
  const mismoNombre = deps.filter(d => D.deportista.some(o => norm(o.nombre) === norm(d.nombre)));
  if (!nuevos.length) return toast('Ya estaba todo importado');
  const txt = `Se van a añadir ${cuenta('deportista')} deportistas y ${cuenta('sesion')} sesiones${cuenta('plan') ? `, ${cuenta('plan')} planes` : ''}${cuenta('ejercicio') ? `, ${cuenta('ejercicio')} ejercicios` : ''}${cuenta('referencia') ? `, ${cuenta('referencia')} entrenamientos escritos` : ''}.${ya ? ` ${ya} ya estaban y no se tocan.` : ''}${mismoNombre.length ? `\n\nOjo: ya hay alguien llamado ${mismoNombre.map(d => d.nombre).join(', ')}. Se creará otra ficha.` : ''}\n\n¿Importar?`;
  if (!confirm(txt)) return;
  for (let i = 0; i < nuevos.length; i += 25) guardar(nuevos.slice(i, i + 25));
  renderCoach(); toast(`Importado: ${cuenta('deportista')} deportistas y ${cuenta('sesion')} sesiones`, 3500);
}
/* ---------- Strava ---------- */
const STRAVA_LOGO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M15.4 17.9l-2.1-4.1h-3.1l5.2 10.2 5.1-10.2h-3.1zM10.2 0L3.3 13.8h4.1l2.8-5.5 2.8 5.5h4.1z"/></svg>';
async function stravaConectar() {
  try { const j = await api({ a: 'strava', op: 'url', id: S.auth.id, pin: S.auth.pin }); if (!j.ok) return toast('El entrenador aún no ha activado Strava'); location.href = j.url; }
  catch (e) { toast('Sin conexión'); }
}
async function stravaActualizar(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
  try { const j = await api({ a: 'strava', op: 'sync', id: S.auth.id, pin: S.auth.pin }); if (j.ok) { D.actividad = j.actividades; S.strava = j.strava; const c = LS.get('abs2-cache', null); if (c?.r) { c.r.actividades = j.actividades; c.r.strava = j.strava; LS.set('abs2-cache', c); } toast('Strava al día'); } }
  catch (e) { toast('Sin conexión'); }
  renderDep();
}
function stravaBoxDep() {
  const st = S.strava || {};
  if (!st.configurado) return '';
  if (!st.conectado) return `<div class="card strava"><div class="row"><span class="slogo">${STRAVA_LOGO}</span><div class="grow"><b>Conecta tu Strava</b><div class="small muted">Tus entrenos (también los de Garmin si lo tienes enlazado con Strava) aparecerán solos en tu plan y los verá tu entrenador.</div></div><button class="btn sm strava-b" id="stC">Conectar</button></div></div>`;
  return `<div class="row small muted"><span class="slogo">${STRAVA_LOGO}</span><span class="grow">Strava conectado${st.nombre ? ' · ' + esc(st.nombre) : ''}</span><button class="btn sm ghost" id="stA">Actualizar</button></div>`;
}
function enlazarStravaDep() {
  const c = $('#stC'); if (c) c.onclick = stravaConectar;
  const a = $('#stA'); if (a) a.onclick = () => stravaActualizar(a);
  const d = $('#stD'); if (d) d.onclick = async () => { if (!confirm('¿Desconectar Strava? Dejarán de llegar tus entrenos.')) return; await api({ a: 'strava', op: 'desconectar', id: S.auth.id, pin: S.auth.pin }); S.strava.conectado = false; renderDep(); };
}
// Entrenador: trae lo nuevo de Strava de todos los conectados (sin bloquear la pantalla)
async function stravaSyncCoach(forzar) {
  try {
    const j = await api({ a: 'coach', op: 'stravaSync', clave: S.auth.clave, forzar: forzar ? 1 : 0 });
    if (!j.ok) return; D.actividad = j.actividad || []; S.stravaE = j.estado;
    LS.set('abs2-cache', { modo: 'coach', datos: D });
    if (['inicio', 'cal', 'dep'].includes(S.tab) && !$('#ed')?.open) renderCoach();
    if (forzar) toast(j.nuevas ? `${j.nuevas} actividades nuevas de Strava` : 'Strava al día');
  } catch (e) {}
}
// Enlace personal: quien lo abre crea su propio perfil con su PIN (sin grupo). Se puede cambiar para anular el anterior.
async function enlaceAlta(nuevo) {
  let j; try { j = await api({ a: 'coach', op: 'altaCodigo', clave: S.auth.clave, nuevo: nuevo ? 1 : 0 }); } catch (e) { return toast('Sin conexión'); }
  if (!j.ok) return toast('Actualiza el Apps Script para usar el enlace de alta');
  const url = `${location.origin}${location.pathname.replace(/index\.html$/, '')}?alta=${encodeURIComponent(j.codigo)}`;
  abrirEd('Enlace para nuevos deportistas', `<div class="card list">
    <p style="margin:0">Mándale este enlace a quien quieras (por WhatsApp, por ejemplo). Al abrirlo escribe su nombre, elige su PIN de 4 cifras y crea su propio perfil. No tienes que darle de alta tú.</p>
    <div class="row"><input class="f mono grow" readonly value="${esc(url)}" id="aUrl" style="min-width:0"><button class="btn pri" id="aCp">Copiar</button>${navigator.share ? '<button class="btn" id="aSh">Compartir</button>' : ''}</div>
    <p class="small muted" style="margin:0">Cuando alguien se registre te llegará un aviso y aparecerá en Deportistas y en Inicio («sin plan»). Desde su ficha le pones grupo o le asignas sesiones. Para unir a alguien directamente a un grupo, usa el enlace del grupo (pestaña Grupos).</p>
    <button class="btn sm danger" id="aNew">Cambiar el enlace (el anterior deja de funcionar)</button></div>`, null, 'Cerrar');
  $('#aUrl').onfocus = e => e.target.select();
  $('#aCp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch (e) { $('#aUrl').select(); } };
  const sh = $('#aSh'); if (sh) sh.onclick = () => navigator.share({ title: 'ABS Entrenamiento', text: 'Crea tu perfil en ABS Entrenamiento con este enlace:', url }).catch(() => {});
  $('#aNew').onclick = () => { if (confirm('¿Crear un enlace nuevo? El que ya enviaste dejará de servir para darse de alta (quien ya tiene perfil sigue entrando igual).')) { cerrarEd(); enlaceAlta(true); } };
}
function configAvisos() {
  const e = S.pushE || {}, base = location.pathname.replace(/[^/]*$/, '');
  const estado = !('Notification' in window) ? (esIOS() && !enPantalla() ? 'En el iPhone, instala primero la app en la pantalla de inicio y ábrela desde el icono.' : 'Este navegador no admite avisos.') : Notification.permission === 'granted' ? '✓ Este dispositivo recibe avisos.' : Notification.permission === 'denied' ? 'Los avisos están bloqueados en este navegador: actívalos en sus ajustes.' : 'Este dispositivo aún no recibe avisos.';
  abrirEd('Avisos al móvil', `<div class="card list">
    <p class="small" style="margin:0">Avisos que se mandan solos: a cada deportista, cada mañana a las 8 lo que le toca (y los lunes, que rellene el check-in) y cuando le contestas; a ti, cuando alguien comenta, te escribe, se une a un grupo o tiene un check-in preocupante.</p>
    <ol class="small" style="margin:0;padding-left:18px;line-height:1.6">
      <li>Crea una cuenta gratuita en <a href="https://onesignal.com" target="_blank" rel="noopener">onesignal.com</a> → <b>New App/Website</b> → plataforma <b>Web</b>.</li>
      <li>Integración <b>Typical Site</b>. Site URL: <b class="mono">${esc(location.origin)}</b>. Activa «Auto Resubscribe».</li>
      <li>En <b>Advanced → Service worker</b>, activa la personalización: ruta <b class="mono">${esc(base)}</b>, archivo <b class="mono">sw.js</b> (en los dos campos) y alcance <b class="mono">${esc(base)}</b>.</li>
      <li>En <b>Settings → Keys &amp; IDs</b>, copia el <b>App ID</b> y crea una <b>API Key</b> (REST). Pégalos aquí.</li>
      <li>En el editor del Apps Script, ejecuta una vez <b class="mono">instalarAvisos</b> para el aviso diario de las 8:00.</li>
    </ol>
    <div class="grid2"><label class="l">App ID<input class="f mono" id="pAp" value="${esc(e.appId || '')}"></label><label class="l">API Key (REST)<input class="f mono" id="pKe" type="password" placeholder="${e.conClave ? 'Guardada · escribe para cambiarla' : ''}"></label></div>
    <small class="muted">La API Key se guarda en el Apps Script, no en la hoja.</small></div>
    <div class="card list"><b>Este dispositivo</b><p class="small" style="margin:0">${estado}</p><div class="row">${'Notification' in window && Notification.permission === 'default' && e.appId ? '<button class="btn sm pri" id="pOn">Activar avisos aquí</button>' : ''}${e.appId && e.conClave ? '<button class="btn sm" id="pTe">Mandarme un aviso de prueba</button>' : ''}</div></div>`,
    () => {
      const appId = $('#pAp').value.trim(), k = $('#pKe').value.trim();
      if (!appId) return toast('Falta el App ID'), false;
      api({ a: 'coach', op: 'pushConfig', clave: S.auth.clave, appId, key: k }).then(j => { if (j.ok) { S.pushE = j.estado; S.pushApp = appId; cargarPush('coach'); toast('Avisos activados'); } else toast('No se ha podido guardar'); }).catch(() => toast('Sin conexión'));
    });
  const on = $('#pOn'); if (on) on.onclick = async () => { cargarPush('coach'); for (let i = 0; i < 20 && !S.OS; i++) await new Promise(r => setTimeout(r, 300)); if (!S.OS) return toast('No se ha podido cargar el servicio de avisos'); await S.OS.Notifications.requestPermission(); cerrarEd(); configAvisos(); };
  const te = $('#pTe'); if (te) te.onclick = async () => { const j = await api({ a: 'coach', op: 'pushPrueba', clave: S.auth.clave }).catch(() => ({})); toast(j.ok ? (j.r === 200 ? 'Aviso enviado' : 'Respuesta de OneSignal: ' + j.r) : 'No se ha podido enviar'); };
}
function configStrava() {
  const e = S.stravaE || {};
  const con = Object.entries(e.conectados || {});
  abrirEd('Strava', `<div class="card list">
    <p class="small" style="margin:0">Así llegan los entrenos de Strava (y de Garmin, si cada deportista enlaza Garmin con Strava) al plan de cada uno.</p>
    <ol class="small" style="margin:0;padding-left:18px;line-height:1.6">
      <li>Entra en <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> con tu cuenta y crea una aplicación (pide tener Strava de pago).</li>
      <li>Nombre: <b>ABS Entrenamiento</b> · Categoría: <b>Training</b> · Sitio web: <span class="mono">${esc(location.origin + location.pathname)}</span></li>
      <li>Dominio de devolución de llamada de autorización: <b class="mono">script.google.com</b></li>
      <li>Copia aquí el <b>ID de cliente</b> y el <b>secreto de cliente</b>.</li>
      <li>Al principio solo te deja conectar tu cuenta: en la misma página puedes subir a 10 deportistas. Para más, hay que pedir revisión a Strava.</li>
    </ol>
    <div class="grid2"><label class="l">ID de cliente<input class="f mono" id="sId" value="${esc(e.id || '')}" inputmode="numeric"></label>
    <label class="l">Secreto de cliente<input class="f mono" id="sSe" type="password" placeholder="${e.conSecreto ? 'Guardado · escribe para cambiarlo' : ''}"></label></div>
    <small class="muted">Se guardan en el Apps Script, no en la hoja.</small></div>
    <div class="card list"><h3>Conectados (${con.length})</h3>${con.length ? con.map(([id, x]) => `<div class="row"><b class="grow">${esc(byId('deportista', id)?.nombre || id)}</b><small class="muted">${esc(x.nombre || '')}${x.ult ? ' · ' + new Date(x.ult * 1000).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</small></div>`).join('') : '<small class="muted">Nadie todavía. Cada deportista pulsa «Conectar Strava» en su app, o le mandas su enlace desde su ficha.</small>'}
    ${con.length ? '<button class="btn sm" id="sSy">Traer actividades ahora</button>' : ''}</div>`,
    () => {
      const id = $('#sId').value.trim(), secret = $('#sSe').value.trim();
      if (!id) return toast('Falta el ID de cliente'), false;
      if (!secret && !e.conSecreto) return toast('Falta el secreto de cliente'), false;
      api({ a: 'coach', op: 'stravaConfig', clave: S.auth.clave, id, secret }).then(j => { if (j.ok) { S.stravaE = j.estado; toast('Strava activado'); } else toast('No se ha podido guardar'); }).catch(() => toast('Sin conexión'));
    });
  const sy = $('#sSy'); if (sy) sy.onclick = () => { cerrarEd(); stravaSyncCoach(true); };
}
const TABS_D = [['hoy', 'Hoy'], ['semana', 'Programa'], ['micarga', 'Mi carga']];
function marcoDep() {
  S.tab = TABS_D.some(t => t[0] === S.tab) ? S.tab : 'hoy';
  S.ui.dia = S.ui.dia || key(today());
  const g = (S.yo.grupos || []).map(x => byId('grupo', x)?.nombre).filter(Boolean)[0];
  document.body.innerHTML = `<header class="hero dep"><div class="top"><div class="logo">ABS</div><div class="who"><b>${esc(S.yo.nombre)}</b><span>${esc(g || 'ABS Entrenamiento')}</span></div><button class="out" id="out">Salir</button></div>
    <p class="tag">Cada repetición cuenta.</p>
    <nav class="seg">${TABS_D.map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${S.tab === k}">${n}</button>`).join('')}</nav></header><main id="main" class="narrow"></main>
    <nav class="bbar" aria-label="Secciones">${TABS_D.map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${S.tab === k}">${ico(k)}<span>${n}</span></button>`).join('')}</nav>${dialogs()}`;
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
  m.innerHTML = `<div class="stepper"><button id="pw" aria-label="Semana anterior">‹</button><div class="d"><b>${fmtD(lun)} – ${fmtD(addDays(lun, 6))}</b><span>Toca un ejercicio para ver detalles</span></div><button id="nw" aria-label="Semana siguiente">›</button></div>
    ${diasGymHTML()}
    <div class="wplan">${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = addDays(lun, i), k = key(d), ss = D.sesion.filter(s => s.fecha === k);
      const esHoy = k === key(today());
      return `<div class="wpday ${esHoy ? 'today' : ''}" data-wpk="${k}"><div class="wpdh"><span>${DIAS[i]}</span><b>${d.getDate()}</b></div>
        ${ss.length ? ss.map(s => sesionCompacta(s)).join('') : actividadesDe(S.yo.id, k).length ? '' : '<div class="wprest">Descanso</div>'}
        ${actividadesDe(S.yo.id, k).map(a => `<div class="wpact">${actMini(a)}</div>`).join('')}</div>`;
    }).join('')}</div>`;
  $('#pw').onclick = () => { S.ui.dia = key(addDays(lun, -7)); renderDep(); };
  $('#nw').onclick = () => { S.ui.dia = key(addDays(lun, 7)); renderDep(); };
  enlazarDiasGym(m);
  // Tap en día header → abrir ese día completo
  m.querySelectorAll('[data-wpk]').forEach(d => d.querySelector('.wpdh').onclick = () => { S.ui.dia = d.dataset.wpk; S.tab = 'hoy'; marcoDep(); });
  // Tap en ejercicio → abrir el día
  m.querySelectorAll('[data-wpex]').forEach(b => { b.onclick = () => { S.ui.dia = b.closest('[data-wpk]').dataset.wpk; S.tab = 'hoy'; marcoDep(); }; });
}
function sesionCompacta(s) {
  const c = DEP[s.deporte]?.c, r = regDe(s) || {};
  let tot = 0, hech = 0;
  (s.bloques || []).forEach((b, bi) => (b.items || []).forEach((it, ii) => {
    if (s.deporte === 'fuerza') { const n = nSeries(b, it); for (let k = 0; k < n; k++) { tot++; if (r.sets?.[`${bi}|${ii}|${k}`]?.ok) hech++; } }
    else { tot++; if (r.hecho?.[`${bi}|${ii}`]) hech++; }
  }));
  const pct = tot ? Math.round(hech / tot * 100) : 0;
  // Cada bloque con su nombre y debajo sus ejercicios
  const items = (s.bloques || []).filter(b => (b.items || []).length).map((b, bi0) => { const bi = s.bloques.indexOf(b); return `<div class="wpblk"><div class="wpbh">${esc(b.nombre || 'Bloque ' + (bi + 1))}${b.circuito ? ' · ↻ circuito' : ''}</div>${(b.items || []).map((it, ii) => itemCompacto(s, b, bi, ii, it, r)).join('')}</div>`; });
  return `<div class="wpses" style="--c:${c}"><div class="wpsh"><i></i><b>${esc(s.titulo || DEP[s.deporte]?.n)}</b>${s.duracion ? `<small>${s.duracion}'</small>` : ''}${conEcos(s.deporte) && ecoDe(s) ? `<small class="mono">${ecoTxt(ecoDe(s))}</small>` : ''}${pct ? `<small class="wpok">${pct}%</small>` : ''}</div>
    ${s.deporte === 'natacion' && s.bloques?.some(b => b.items?.some(it => it.texto)) ? mainSetCompacto(s) : ''}
    <div class="wpitems">${items.join('')}</div></div>`;
}
function itemCompacto(s, b, bi, ii, it, r) {
  const chips = [];
  // Solo series, repeticiones y RPE
  if (s.deporte === 'fuerza') {
    const n = nSeries(b, it); chips.push(n + (b.circuito ? (n === 1 ? ' vuelta' : ' vueltas') : (n === 1 ? ' serie' : ' series')));
    if (it.reps) chips.push(it.reps + ' reps');
  } else {
    if (it.series) chips.push(it.series + (+it.series === 1 ? ' serie' : ' series'));
    if (it.reps) chips.push(it.reps + ' reps');
  }
  if (it.rpe) chips.push(/^\d/.test(it.rpe) ? 'RPE ' + it.rpe : it.rpe);
  const done = s.deporte === 'fuerza' ? Array.from({ length: nSeries(b, it) }, (_, k) => r.sets?.[`${bi}|${ii}|${k}`]?.ok).every(Boolean) && nSeries(b, it) > 0 : !!r.hecho?.[`${bi}|${ii}`];
  return `<button class="wpex ${done ? 'done' : ''}" data-wpex="1"><span class="wpn">${esc(it.nombre || '')}</span>${chips.length ? `<span class="wpc">${chips.map(c => esc(c)).join(' · ')}</span>` : ''}</button>`;
}
function mainSetCompacto(s) {
  const lines = [];
  (s.bloques || []).forEach(b => (b.items || []).forEach(it => {
    if (!it.texto) return;
    const ms = mainSet(it.texto);
    if (ms.length) ms.forEach(l => lines.push(l));
  }));
  if (!lines.length) return '';
  return `<div class="wpms">${lines.slice(0, 4).map(l => `<span>${esc(l.replace(/\s+/g, ' ').trim()).slice(0, 60)}</span>`).join('')}${lines.length > 4 ? `<span class="muted">+${lines.length - 4} más</span>` : ''}</div>`;
}
function vDia(m) {
  const dia = parseKey(S.ui.dia), lun = monday(dia);
  const ss = D.sesion.filter(s => s.fecha === S.ui.dia);
  m.innerHTML = bannerInstalar() + `<div class="days">${[0, 1, 2, 3, 4, 5, 6].map(i => { const d = addDays(lun, i), k = key(d), l = D.sesion.filter(s => s.fecha === k); return `<button data-dia="${k}" aria-pressed="${k === S.ui.dia}" aria-label="${fmtLong(d)}">${DIAS[i]}<b>${d.getDate()}</b><span class="dots">${l.map(s => `<i style="--c:${DEP[s.deporte]?.c}"></i>`).join('')}</span></button>`; }).join('')}</div>
    <div class="datenav"><button id="pw" aria-label="Semana anterior">‹</button><b>${fmtLong(dia)}</b>${S.ui.dia !== key(today()) ? '<button class="hoyb" id="hoy">Hoy</button>' : '<span class="hoyb on" id="hoy">Hoy</span>'}<button id="nw" aria-label="Semana siguiente">›</button></div>
    ${avisosBox()}${respuestasNuevas()}${checkinBox()}
    ${stravaBoxDep()}
    ${actividadesDe(S.yo.id, S.ui.dia).length ? `<section class="list"><div class="bh"><i style="--c:#fc4c02"></i>Hecho · Strava</div>${actividadesDe(S.yo.id, S.ui.dia).map(actCard).join('')}</section>` : ''}
    ${ss.length ? ss.map(s => sesionDep(s)).join('') : `<div class="empty">${fmtLong(dia)}<br>No tienes sesión programada.</div>`}
    <p class="sync" id="sync">${esc(S.ui.sync || '')}</p>`;
  m.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => { S.ui.dia = b.dataset.dia; renderDep(); });
  enlazarInstalar(); enlazarStravaDep(); enlazarCheckin(m); enlazarAvisos();
  m.querySelectorAll('[data-irs]').forEach(b => b.onclick = () => { S.ui.dia = b.dataset.irs; renderDep(); setTimeout(() => document.querySelector('.hilo')?.scrollIntoView({ block: 'center' }), 50); });
  m.querySelectorAll('[data-msgf]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const t = f.querySelector('textarea'), txt = t.value.trim(); if (!txt) return; const [sid, did] = f.dataset.msgf.split('|'); t.value = ''; await enviarMensaje(sid, did, txt, 'dep'); const y = scrollY; renderDep(); scrollTo(0, y); });
  $('#pw').onclick = () => { S.ui.dia = key(addDays(lun, -7)); renderDep(); };
  $('#nw').onclick = () => { S.ui.dia = key(addDays(lun, 7)); renderDep(); };
  $('#hoy').onclick = () => { S.ui.dia = key(today()); renderDep(); };
  enlazarSesionDep(m);
}
const reg = sid => { const s = byId('sesion', sid); let r = regDe(s); if (!r) { r = { id: rid(s), ses: sid, dep: S.yo?.id, fecha: s.fecha, sets: {}, hecho: {}, coment: {} }; D.registro.push(r); } r.sets = r.sets || {}; r.hecho = r.hecho || {}; r.coment = r.coment || {}; return r; };
const repsDe = (it, k) => { const p = String(it.reps || '').split(/\s*[-·]\s*/).filter(Boolean); return p.length > 1 ? (p[k] ?? p[p.length - 1]) : (it.reps || ''); };
const nSeries = (b, it) => { const p = String(it.reps || '').split(/\s*[-·]\s*/).filter(Boolean); return +it.series || +b.series || (p.length > 1 ? p.length : 1); };
// Respuestas del entrenador que el deportista aún no ha visto
function respuestasNuevas() {
  const v = vistos(), l = D.mensaje.filter(m => m.de === 'coach' && !v[m.id]);
  if (!l.length) return '';
  const ss = [...new Set(l.map(m => m.ses))];
  return `<div class="card aviso"><b>💬 Tu entrenador te ha contestado</b>${ss.map(id => { const s = byId('sesion', id); return s ? `<button class="lnk" data-irs="${s.fecha}">${esc(s.titulo || DEP[s.deporte]?.n)} · ${fmtD(parseKey(s.fecha))}</button>` : ''; }).join('')}</div>`;
}
function sesionDep(s) {
  const r = regDe(s) || {}, c = DEP[s.deporte]?.c, g = s.grupo && byId('grupo', s.grupo);
  let tot = 0, hech = 0;
  (s.bloques || []).forEach((b, bi) => (b.items || []).forEach((it, ii) => { if (s.deporte === 'fuerza') { const n = nSeries(b, it); for (let k = 0; k < n; k++) { tot++; if (r.sets?.[`${bi}|${ii}|${k}`]?.ok) hech++; } } else { tot++; if (r.hecho?.[`${bi}|${ii}`]) hech++; } }));
  return `<section class="ses" style="--c:${c}" data-ses="${s.id}"><span class="meta">${g ? esc(g.nombre) + ' · ' : ''}${s.subtitulo ? esc(s.subtitulo) + ' · ' : ''}${DEP[s.deporte]?.n || ''}${s.duracion ? ` · ${s.duracion} min` : ''}${conEcos(s.deporte) && ecoDe(s) ? ' · ' + ecoTxt(ecoDe(s)) : ''}${s.rpeObj ? ` · RPE objetivo ${esc(s.rpeObj)}` : ''}</span><h2>${esc(s.titulo || DEP[s.deporte]?.n)}</h2>${s.notas ? `<p>${esc(s.notas)}</p>` : ''}
    ${tot ? `<small class="muted">${hech} de ${tot} hechos</small><div class="progress"><i style="width:${tot ? hech / tot * 100 : 0}%"></i></div>` : ''}</section>
    ${(s.bloques || []).map((b, bi) => `<section class="block" style="--c:${c}"><div class="bh"><i></i>${esc(b.nombre || 'Bloque ' + (bi + 1))}${b.series && s.deporte === 'fuerza' ? ` · ${b.series} ${b.circuito ? 'vueltas' : 'series'}` : ''} · ${(b.items || []).length} ${(b.items || []).length === 1 ? 'ejercicio' : 'ejercicios'}${b.tiempo ? `<em>${esc(b.tiempo)}</em>` : ''}</div>
      ${b.circuito ? `<p class="circ">↻ Circuito: haz los ejercicios seguidos${b.descV ? ` y descansa ${esc(b.descV)} al acabar cada vuelta` : ''}.</p>` : ''}
      ${(b.items || []).map((it, ii) => itemDep(s, b, bi, ii, it, r)).join('')}</section>`).join('')}
    <section class="card list" data-fin="${s.id}"><h3>${r.rpe ? 'Sesión registrada' : 'Al terminar la sesión'}</h3>
      <label class="l">Minutos totales<input class="f mono" inputmode="numeric" data-min="${s.id}" value="${esc(r.minutos || s.duracion || '')}"></label>
      <div class="l">¿Cómo de dura ha sido? (RPE 0–10)<div class="rpe">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-rpe="${s.id}|${i}" aria-pressed="${+r.rpe === i && r.rpe !== undefined && r.rpe !== ''}" aria-label="${i}: ${RPE_TXT[i]}">${i}</button>`).join('')}</div><small class="muted" id="rpeT-${s.id}">${r.rpe !== undefined && r.rpe !== '' ? RPE_TXT[+r.rpe] : 'Toca un número'}</small></div>
      <div class="row"><div class="grow"><small class="muted">Carga de la sesión</small><div class="ua" id="ua-${s.id}">${ua(r)} UA</div></div><button class="btn pri" data-guardar="${s.id}">Guardar</button></div>
      <textarea class="com" data-nota="${s.id}" placeholder="Comentario general de la sesión (opcional)">${esc(r.nota || '')}</textarea>
      ${realizadoHTML(s, S.yo)}</section>
    <section class="card list"><h3>Mensajes con tu entrenador</h3>${hiloHTML(s, S.yo, r, 'dep')}</section>${(() => { marcarVisto(D.mensaje.filter(m => m.ses === s.id).map(m => m.id)); return ''; })()}`;
}
function itemDep(s, b, bi, ii, it, r) {
  const v = vidId(it.video), c = DEP[s.deporte]?.c;
  const extra = [it.dist && (s.deporte === 'natacion' ? it.dist + ' m' : it.dist), it.tiempo && (s.deporte === 'natacion' ? it.tiempo + ' min' : it.tiempo), it.ritmo, it.carga, it.rpe && (/^\d/.test(it.rpe) ? 'RPE ' + it.rpe : it.rpe), it.desc && (s.deporte === 'fuerza' ? 'Desc. ' + it.desc : 'Rec. ' + it.desc)].filter(Boolean).join(' · ');
  const cab = `<div class="exh"><div class="t"><h3>${esc(it.nombre || '')}</h3>${s.deporte === 'fuerza' && it.reps ? `<span class="rx">Reps ${esc(it.reps)}${extra ? ' · ' + esc(extra) : ''}</span>` : extra ? `<span class="rx">${esc(extra)}</span>` : ''}${it.notas ? `<span class="cue">${esc(it.notas)}</span>` : ''}${s.deporte === 'fuerza' ? ultimaVez(it, s) : ''}</div>
    ${v ? `<button type="button" class="thumb" ${tramo(it.video)} data-n="${esc(it.nombre)}" aria-label="Ver vídeo: ${esc(it.nombre)}"><img src="https://i.ytimg.com/vi/${v}/hqdefault.jpg" alt="" loading="lazy"><span>${PLAY}</span></button>` : ''}
    ${s.deporte !== 'fuerza' ? `<button type="button" class="chk" data-hecho="${s.id}|${bi}|${ii}" aria-pressed="${!!r.hecho?.[`${bi}|${ii}`]}" aria-label="Marcar hecho">${CHECK}</button>` : ''}</div>`;
  let body = '';
  if (it.texto) body += txtHTML(it.texto, s.deporte);
  else if (it.filas?.length) body += `<ul class="filas ${s.deporte === 'natacion' ? 'nat' : ''}">${it.filas.map(f => `<li><i data-z="${f.z1 || 'r1'}"></i>${esc(txtFila(f, s.deporte))}</li>`).join('')}</ul>`;
  if (s.deporte === 'fuerza') {
    const n = nSeries(b, it), ult = ultimaKg(it, s);
    body += `<table class="sets"><thead><tr><th>Serie</th><th>Reps</th><th>Kg</th><th class="c"></th></tr></thead><tbody>${Array.from({ length: n }, (_, k) => { const id = `${s.id}|${bi}|${ii}|${k}`, x = r.sets?.[`${bi}|${ii}|${k}`] || {}; return `<tr class="${x.ok ? 'done' : ''}"><td class="n">${k + 1}</td><td class="r">${esc(repsDe(it, k))}</td><td><input data-kg="${id}" inputmode="decimal" placeholder="${esc(ult?.kg[k] ?? ult?.kg.at(-1) ?? '—')}" value="${esc(x.kg || '')}" aria-label="Kilos serie ${k + 1}${ult ? ' (la última vez ' + esc(ult.kg[k] ?? ult.kg.at(-1)) + ' kg)' : ''}"></td><td class="c"><button type="button" class="chk" data-set="${id}" aria-pressed="${!!x.ok}" aria-label="Serie ${k + 1} hecha">${CHECK}</button></td></tr>`; }).join('')}</tbody></table>`;
  }
  body += `<textarea class="com" data-com="${s.id}|${bi}|${ii}" rows="1" placeholder="Comentario para el entrenador (opcional)">${esc(r.coment?.[`${bi}|${ii}`] || '')}</textarea>`;
  return `<article class="ex" style="--c:${c}">${cab}${body}</article>`;
}
// Mejor peso (el más alto registrado) en ese ejercicio
function mejorKg(it) {
  let m = 0;
  D.sesion.filter(x => x.deporte === 'fuerza').forEach(x => (x.bloques || []).forEach((b, bi) => (b.items || []).forEach((y, ii) => {
    if (!((it.ej && y.ej === it.ej) || (!it.ej && y.nombre === it.nombre))) return;
    const r = regDe(x); Object.entries(r?.sets || {}).forEach(([k, v]) => { if (k.startsWith(`${bi}|${ii}|`)) { const n = parseFloat(String(v.kg || '').replace(',', '.')); if (n > m) m = n; } });
  })));
  return m;
}
function ultimaKg(it, s) {
  let best = null;
  D.sesion.filter(x => x.fecha < s.fecha && x.deporte === 'fuerza').forEach(x => (x.bloques || []).forEach((b, bi) => (b.items || []).forEach((y, ii) => {
    if ((it.ej && y.ej === it.ej) || (!it.ej && y.nombre === it.nombre)) {
      const r = regDe(x); if (!r?.sets) return;
      const kg = Object.entries(r.sets).filter(([k, v]) => k.startsWith(`${bi}|${ii}|`) && v.kg).sort((a, b) => +a[0].split('|')[2] - +b[0].split('|')[2]).map(([, v]) => v.kg);
      if (kg.length && (!best || x.fecha > best.f)) best = { f: x.fecha, kg };
    }
  })));
  return best;
}
function ultimaVez(it, s) {
  const mj = mejorKg(it);
  let best = null;
  D.sesion.filter(x => x.fecha < s.fecha && x.deporte === 'fuerza').forEach(x => (x.bloques || []).forEach((b, bi) => (b.items || []).forEach((y, ii) => {
    if ((it.ej && y.ej === it.ej) || (!it.ej && y.nombre === it.nombre)) {
      const r = regDe(x); if (!r?.sets) return;
      const kg = Object.entries(r.sets).filter(([k, v]) => k.startsWith(`${bi}|${ii}|`) && v.kg).sort((a, b) => +a[0].split('|')[2] - +b[0].split('|')[2]).map(([, v]) => v.kg);
      if (kg.length && (!best || x.fecha > best.f)) best = { f: x.fecha, kg };
    }
  })));
  return best || mj ? `<span class="last">${best ? `Última vez (${fmtD(parseKey(best.f))}): ${esc(best.kg.join(' · '))} kg` : ''}${best && mj ? ' · ' : ''}${mj ? `Mejor: ${String(mj).replace('.', ',')} kg` : ''}</span>` : '';
}
function enlazarSesionDep(m) {
  m.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v) { abrirVideo.h = !!b.dataset.h; return abrirVideo(b.dataset.v, b.dataset.n, b.dataset.s, b.dataset.e); }
    if (b.dataset.set) { const [sid, bi, ii, k] = b.dataset.set.split('|'); const r = reg(sid), kk = `${bi}|${ii}|${k}`; r.sets[kk] = { ...(r.sets[kk] || {}), ok: !r.sets[kk]?.ok }; guardarReg(r); const on = r.sets[kk].ok; const y = scrollY; renderDep(); scrollTo(0, y); if (on) { const s = byId('sesion', sid), bl = s.bloques[+bi], it = bl.items[+ii]; if (bl.circuito) { if (+ii === bl.items.length - 1) iniciarDescanso(bl.descV || it.desc, 'Fin de la vuelta ' + (+k + 1)); } else iniciarDescanso(it.desc, it.nombre); } return; }
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
// Duración de un vídeo de YouTube con su reproductor oficial (sin clave de API)
let ytListo = null;
function cargarYT() {
  if (ytListo) return ytListo;
  ytListo = new Promise(ok => { if (window.YT?.Player) return ok(); window.onYouTubeIframeAPIReady = ok; const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.append(sc); });
  return ytListo;
}
async function duracionYT(v) {
  try {
    await Promise.race([cargarYT(), new Promise((_, n) => setTimeout(n, 8000))]);
    return await new Promise(ok => {
      const div = document.createElement('div'); div.style.cssText = 'position:fixed;left:-9999px;width:200px;height:200px'; const h = document.createElement('div'); div.append(h); document.body.append(div);
      const fin = d => { try { pl.destroy(); } catch (e) {} div.remove(); ok(d); };
      const t = setTimeout(() => fin(null), 10000);
      const pl = new YT.Player(h, { videoId: v, events: { onReady: () => { const d = Math.round(pl.getDuration()); if (d) { clearTimeout(t); fin(d); } else { pl.mute(); pl.playVideo(); } }, onStateChange: () => { const d = Math.round(pl.getDuration()); if (d) { clearTimeout(t); fin(d); } }, onError: () => { clearTimeout(t); fin(null); } } });
    });
  } catch (e) { return null; }
}
const vidId = u => (String(u || '').match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1];
// Tramo del vídeo: ?start=S&end=E en el enlace (para quedarse con 10 s de un vídeo más largo); la app lo repite en bucle
const clip = u => { const a = String(u || '').match(/[?&]start=(\d+)/), b = String(u || '').match(/[?&]end=(\d+)/); return { s: a ? +a[1] : 0, e: b ? +b[1] : 0 }; };
const tramo = u => { const c = clip(u); return `data-v="${vidId(u)}" data-s="${c.s}" data-e="${c.e}"${/shorts\//.test(u) ? '' : ' data-h="1"'}`; };
let vidT = null;
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
  vd.addEventListener('close', () => { clearInterval(vidT); vd.querySelector('iframe').src = 'about:blank'; });
  $('#edX').onclick = cerrarEd;
  $('#edOk').onclick = () => { if (edOk && edOk() === false) return; cerrarEd(); };
  $('#pkX').onclick = () => $('#pk').close();
  $('#pk').addEventListener('click', e => { if (e.target.id === 'pk') $('#pk').close(); });
  $('#rPlus').onclick = () => { if (R.fin || R.none) return; R.end += 15000; R.tot += 15; tick(); };
  $('#rSkip').onclick = ocultarDescanso;
  document.addEventListener('click', e => { const t = e.target.closest('#edBody .thumb'); if (t) { abrirVideo.h = !!t.dataset.h; abrirVideo(t.dataset.v, t.dataset.n, t.dataset.s, t.dataset.e); } });
}
function abrirEd(titulo, html, ok, okTxt = 'Guardar') { $('#edT').textContent = titulo; $('#edBody').innerHTML = html; $('#edOk').textContent = okTxt; edOk = ok; const d = $('#ed'); if (!d.open) d.showModal(); $('#edBody').scrollTop = 0; }
function cerrarEd() { const d = $('#ed'); if (d.open) d.close(); edOk = null; }
function abrirVideo(v, n, s, e) {
  const d = $('#vd'), f = d.querySelector('iframe'); d.querySelector('p').textContent = n || ''; d.classList.toggle('h', !!abrirVideo.h); s = +s || 0; e = +e || 0;
  const base = `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1`;
  const url = e > s ? `${base}&start=${s}&end=${e}` : `${base}&loop=1&playlist=${v}`;
  f.src = url; clearInterval(vidT); if (e > s) vidT = setInterval(() => { f.src = url; }, (e - s) * 1000 + 1500);
  d.showModal();
}
function cerrarVideo() { clearInterval(vidT); const d = $('#vd'); d.querySelector('iframe').src = 'about:blank'; if (d.open) d.close(); }

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
