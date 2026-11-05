/* Lee de Train2Go (con la sesión ya abierta del entrenador en su navegador) lo de los últimos días de cada deportista:
   actividades con su % hecho y los comentarios. Se ejecuta en una pestaña de app.train2go.com y devuelve un JSON
   que luego se pasa a ABS con t2gSync(). No guarda ni envía nada por sí mismo y no lleva claves. */
(async (DIAS = 7) => {
  const H = { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } };
  if (!/train2go\.com$/.test(location.host)) return JSON.stringify({ error: 'Ejecutar en app.train2go.com' });
  const idx = await fetch('/trainer/index', { credentials: 'include' });
  if (/\/login/.test(idx.url)) return JSON.stringify({ error: 'login' });
  let filas = [...document.querySelectorAll('tr.pupil[data-id]')];
  if (!filas.length) filas = [...new DOMParser().parseFromString(await idx.text(), 'text/html').querySelectorAll('tr.pupil[data-id]')];
  const pupils = filas.map(tr => ({ id: tr.dataset.id, n: (tr.querySelector('.avatar-user, a')?.innerText || '').split('\n').map(x => x.trim()).filter(Boolean)[0] || '' }));
  if (!pupils.length) return JSON.stringify({ error: 'sin deportistas' });
  const p2 = n => String(n).padStart(2, '0'), key = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const dias = Array.from({ length: DIAS }, (_, i) => { const d = new Date(hoy); d.setDate(d.getDate() - i); return key(d); });
  const txt = e => (e?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const dep = t => /nata|swim/i.test(t) ? 'natacion' : /run|carrera|correr/i.test(t) ? 'carrera' : /gim|gym|fuerza/i.test(t) ? 'fuerza' : /cicl|bike|bici/i.test(t) ? 'ciclismo' : 'otro';
  const out = { v: 1, at: new Date().toISOString(), pupils: [] };
  for (const p of pupils) {
    const ph = await (await fetch('/trainer/pupils/' + p.id, { credentials: 'include' })).text();
    const m = ph.match(/workplan\/daily\/[\d-]+\?user=\d+(?:&amp;|&)source=([^"&]+)/);
    const src = m ? m[1] : '';
    const q = { id: p.id, n: p.n, days: [] };
    await Promise.all(dias.map(async f => {
      try {
        const j = await (await fetch(`/api/v2/workplan/daily/${f}?user=${p.id}&source=${src}`, { ...H, credentials: 'include' })).json();
        const d = document.createElement('div'); d.innerHTML = j?.data?.content || '';
        const acts = [...d.querySelectorAll('.activity[data-id]')].map(a => ({
          id: a.dataset.id,
          pct: parseInt(txt(a.querySelector('.activity-completion .percent'))) || 0,
          sp: dep(txt(a.querySelector('.activity-excerpt-sport')) + ' ' + a.className),
          med: txt(a.querySelector('.activity-excerpt-measurement')).slice(0, 40),
          tit: txt(a.querySelector('.activity-title')).slice(0, 120),
          desc: txt(a.querySelector('.activity-description')).slice(0, 500),
        }));
        const com = [...d.querySelectorAll('.comment[id]')].map(c => {
          const tm = c.querySelector('time'), cont = c.querySelector('.content');
          return { id: c.id, t: tm?.getAttribute('datetime') || '', a: c.querySelector('picture')?.getAttribute('title') || txt(c.querySelector('.avatar')), x: txt(cont).replace(txt(tm), '').trim().slice(0, 1500) };
        }).filter(c => c.x);
        if (acts.length || com.length) q.days.push({ f, acts, com });
      } catch (e) { q.err = (q.err || 0) + 1; }
    }));
    q.days.sort((a, b) => a.f < b.f ? -1 : 1);
    out.pupils.push(q);
  }
  const res = JSON.stringify(out);
  // Si esta pestaña la abrió ABS (botón «🔄 Train2Go»), se lo manda directamente
  if (window.opener) { try { window.opener.postMessage({ tipo: 'abs-t2g', data: res }, 'https://davidlata95-png.github.io'); } catch (e) {} }
  return window.opener ? JSON.stringify({ enviado: true, deportistas: out.pupils.length, dias: out.pupils.reduce((a, p) => a + p.days.length, 0) }) : res;
})();
