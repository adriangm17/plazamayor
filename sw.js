/* Plaza Mayor - service worker
   - Archivos propios: primero red (así ves siempre la última versión) y, si no hay conexión, la copia guardada.
   - Recursos externos (Tailwind, iconos, fuentes, banderas): se guardan la primera vez y se reutilizan sin conexión.
   Si cambias de versión y algo se queda antiguo, sube el número de CACHE. */
const CACHE = 'plaza-mayor-v1';
const LOCAL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'css/style.css',
  'js/utils.js', 'js/db.js', 'js/data.js', 'js/flags.js', 'js/silver.js', 'js/views-index.js',
  'js/views-album.js', 'js/views-explore.js', 'js/modals.js', 'js/backup.js', 'js/app.js'];
const EXTERNAL = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(LOCAL);
    await Promise.all(EXTERNAL.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Cotizaciones de la plata: siempre en directo, sin guardar
  if (/frankfurter|goldprice/.test(url.hostname)) return;

  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
    return;
  }

  // Externos: copia guardada al instante y se refresca en segundo plano
  e.respondWith(caches.match(req).then(cached => {
    const net = fetch(req).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => cached);
    return cached || net;
  }));
});
