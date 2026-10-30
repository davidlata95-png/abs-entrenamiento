// Service worker: guarda la app para que abra rápido y sin conexión.
// Los datos (Apps Script) y los vídeos no se guardan aquí: siempre van a la red.
const CACHE = 'abs-v5';
const APP = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const propio = u.origin === location.origin, fuentes = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!propio && !fuentes) return;
  // Red primero (para recibir siempre la última versión); si no hay red, la copia guardada
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
