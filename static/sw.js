/* RangeLab Service Worker v7 — uso completo sin conexión
   · Shell: all tool templates, static files (CSS/JS/icons),
     chart.js and html2canvas (CDN) are stored so the app opens without the server.
   · Pages: network first; if there is no network, the last saved copy.
   · Static files: network first (always up to date); if offline, cache.
   · Data (/api/): NOT cached here. api-client.js stores the reads
     in IndexedDB and queues the writes.
   · Updates are NOT applied automatically: the user presses "Update". */
var VERSION = 'v7';
var STATIC_CACHE = 'rangelab-static-' + VERSION;
var PAGE_CACHE = 'rangelab-pages-' + VERSION;
var CDN_CACHE = 'rangelab-cdn-' + VERSION;
var LOGS_CACHE = 'rangelab-logs-' + VERSION;
var OFFLINE_URL = '/static/offline.html';

// Estáticos del shell (deben existir en static/ y en las plantillas)
var PRECACHE_STATIC = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/static/css/rangelab.css',
  '/static/css/rangelab-menus.css',
  '/static/css/feltlab-v2.css',
  '/static/chart.js',
  '/static/js/theme.js',
  '/static/js/i18n.js',
  '/static/js/profile.js',
  '/static/js/skeleton.js',
  '/static/js/api-client.js',
  '/static/js/offline.js',
  '/static/js/offline-pack.js',
  '/static/js/feltlab-core.js',
  '/static/icons/favicon.svg',
  '/static/icons/icon-64.png',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-512-maskable.png',
  '/static/icons/apple-touch-icon.png'
];

// Recursos externos necesarios (se guardan tal cual; la respuesta es "opaca" y sirve para <script>)
var CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

function sum(list) {
  return list.reduce(function (n, v) { return n + (v ? 1 : 0); }, 0);
}

function precacheStatic() {
  return caches.open(STATIC_CACHE).then(function (cache) {
    return Promise.all(PRECACHE_STATIC.map(function (u) {
      return fetch(new Request(u, { cache: 'reload', credentials: 'same-origin' }))
        .then(function (res) {
          if (res.ok) return cache.put(u, res.clone()).then(function () { return true; });
          return false;
        })
        .catch(function () { return false; });
    })).then(sum);
  });
}

function precacheCdn() {
  return caches.open(CDN_CACHE).then(function (cache) {
    return Promise.all(CDN_ASSETS.map(function (u) {
      return fetch(u, { mode: 'no-cors' })
        .then(function (res) { return cache.put(u, res).then(function () { return true; }); })
        .catch(function () { return false; });
    })).then(sum);
  });
}

// Páginas: solo se guardan las que el usuario puede abrir (sin redirección a login)
function precachePages(urls) {
  return caches.open(PAGE_CACHE).then(function (cache) {
    return Promise.all(urls.map(function (u) {
      return fetch(u, { credentials: 'same-origin' }).then(function (res) {
        if (res.ok && !res.redirected && isHtml(res)) {
          return cache.put(u, res.clone()).then(function () { return true; });
        }
        return false;
      }).catch(function () { return false; });
    })).then(sum);
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(Promise.all([precacheStatic(), precacheCdn()]));
  // Sin skipWaiting: la nueva versión espera a que el usuario la active.
});

self.addEventListener('activate', function (event) {
  var keep = [STATIC_CACHE, PAGE_CACHE, CDN_CACHE, LOGS_CACHE];
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return keep.indexOf(k) === -1;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isHtml(res) {
  var ct = res.headers.get('content-type') || '';
  return ct.indexOf('text/html') !== -1;
}

function offlineResponse() {
  return caches.match(OFFLINE_URL).then(function (off) {
    return off || new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  });
}

// Navegación: red primero; si falla, la última copia de esa página; si no hay, la pantalla offline.
function navigate(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok && !res.redirected && isHtml(res)) {
      var copy = res.clone();
      caches.open(PAGE_CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || offlineResponse();
    });
  });
}

// Estáticos: red primero (siempre al día con el servidor); si no hay red, caché.
function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(STATIC_CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || new Response('', { status: 503 });
    });
  });
}

// Logs del servidor (carpeta logs/ para la carga automática de Hand Lab).
// Red primero y se guarda sin parámetros (?t=...), así sin conexión se sirven igual.
function logsHandler(req, url) {
  var key = url.origin + url.pathname;
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(LOGS_CACHE).then(function (c) { c.put(key, copy); });
    }
    return res;
  }).catch(function () {
    return caches.open(LOGS_CACHE).then(function (c) { return c.match(key); }).then(function (hit) {
      return hit || new Response('', { status: 503 });
    });
  });
}

// Externos conocidos: caché primero (ya están guardados desde la instalación).
function cacheFirst(req, cacheName) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(cacheName).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return new Response('', { status: 503 });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (CDN_ASSETS.indexOf(req.url) !== -1) {
      event.respondWith(cacheFirst(req, CDN_CACHE));
    }
    return;
  }

  if (url.pathname.indexOf('/logs/') === 0) {
    event.respondWith(logsHandler(req, url));
    return;
  }

  // Datos: sin caché del SW (api-client.js gestiona lecturas y cola)
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(
      fetch(req).catch(function () {
        return new Response(JSON.stringify({ error: 'offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req));
    return;
  }

  if (url.pathname.indexOf('/static/') === 0 || url.pathname === '/manifest.webmanifest') {
    event.respondWith(networkFirst(req));
  }
});

// Mensajes desde la página. Si llega un MessagePort, se responde { ok: n } al terminar.
self.addEventListener('message', function (event) {
  var data = event.data || {};
  var port = event.ports && event.ports[0];
  function reply(payload) { if (port) port.postMessage(payload); }

  if (data.type === 'SKIP_WAITING') self.skipWaiting();

  if ((data.type === 'PRECACHE_PAGES' || data.type === 'CACHE_URLS') && Array.isArray(data.urls)) {
    event.waitUntil(precachePages(data.urls).then(function (n) { reply({ ok: n }); }));
  }

  if (data.type === 'PRECACHE_SHELL') {
    event.waitUntil(
      Promise.all([precacheStatic(), precacheCdn()]).then(function (r) {
        reply({ ok: r[0] + r[1] });
      })
    );
  }

  if (data.type === 'CLEAR_PAGES') {
    event.waitUntil(
      Promise.all([caches.delete(PAGE_CACHE), caches.delete(LOGS_CACHE)])
        .then(function () { reply({ ok: 1 }); })
    );
  }
});
