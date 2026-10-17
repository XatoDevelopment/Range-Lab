/* ═══════════════════════════════════════════════════════════
   RangeLab — API Client v2 (offline-first, full offline use)
   · Reads (GET): network first. Offline → copy stored in IndexedDB.
   · Data writes: offline (or with pending changes) → local queue.
     They are sent automatically, in order, when the connection returns.
   · Offline creations → temporary negative ID; replaced by the real one on sync.
   · Each account has its own queue and cache (never mixed on the same device).
   · downloadAll(): downloads the tools + all account data
     for offline use (runs automatically every few days when online).
   · IndexedDB avoids the ~5 MB localStorage limit (thousands of hands).
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (global.__rlApiClient) return;
  global.__rlApiClient = true;

  const BASE = '';
  const NS = 'rl:v1';
  const DB_NAME = 'rangelab-offline';
  const KV = 'kv';
  const FLUSH_DEBOUNCE_MS = 400;
  const FLUSH_INTERVAL_MS = 15000;
  const MAX_ATTEMPTS = 5;
  const MAP_LIMIT = 500;
  const FAILED_LIMIT = 200;
  const DOWNLOAD_PAGE = 4000;
  const AUTO_EVERY_MS = 3 * 24 * 60 * 60 * 1000;
  const LOCK_STALE_MS = 10 * 60 * 1000;

  // Herramientas que el service worker guarda para abrirlas sin conexión
  const TOOL_PAGES = [
    '/', '/profile', '/tool/equity', '/tool/preflop', '/tool/tracker', '/tool/feltlab',
    '/tool/range-analyzer', '/tool/mtt-exploiter', '/tool/ailab', '/tool/tournament-lab'
  ];

  // Lecturas que se guardan para uso sin conexión
  const CACHEABLE = /^\/api\/(equity|preflop|tracker|feltlab|ailab|mtt|library|site|auth\/me)(?=[\/?]|$)/;
  // Escrituras que pueden encolarse (datos del usuario). Auth, admin y pagos: solo en línea.
  const QUEUEABLE = /^\/api\/(equity|preflop|tracker|feltlab|ailab)\//;
  // POST que devuelven { id }: si se hacen offline necesitan un ID temporal
  const CREATE_PATHS = ['/api/equity/sessions', '/api/tracker/tournaments', '/api/tracker/transactions'];
  const TMP_RE = /^-\d{6,}$/;

  // ── Estado general (lo consume offline.js y offline-pack.js) ──
  const state = { offline: false, authNeeded: false, syncing: false, lastSync: null, lastError: null, downloading: false };

  // ── Pequeño almacén síncrono (localStorage) para datos diminutos: uid, metadatos ──
  const store = {
    get(k) {
      try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function lsKeys(prefix) {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) out.push(k);
      }
    } catch (e) {}
    return out;
  }

  // ── Almacén grande (IndexedDB). Si no existe, cae a localStorage. ──
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!global.indexedDB) return resolve(null);
      let req;
      try { req = global.indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(KV)) req.result.createObjectStore(KV);
      };
      req.onsuccess = function () {
        const db = req.result;
        db.onversionchange = function () { try { db.close(); } catch (e) {} };
        resolve(db);
      };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbPromise;
  }

  function kvGet(key) {
    return openDb().then(function (db) {
      if (!db) {
        try { const v = localStorage.getItem(key); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
      }
      return new Promise(function (resolve, reject) {
        const req = db.transaction(KV, 'readonly').objectStore(KV).get(key);
        req.onsuccess = function () { resolve(req.result === undefined ? null : req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  // entries: [[clave, valor], ...] en una sola transacción
  function kvPut(entries) {
    return openDb().then(function (db) {
      if (!db) {
        entries.forEach(function (e) { localStorage.setItem(e[0], JSON.stringify(e[1])); });
        return;
      }
      return new Promise(function (resolve, reject) {
        const t = db.transaction(KV, 'readwrite');
        const st = t.objectStore(KV);
        entries.forEach(function (e) { st.put(e[1], e[0]); });
        t.oncomplete = function () { resolve(); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('IndexedDB')); };
      });
    });
  }

  function kvDel(keys) {
    if (!keys.length) return Promise.resolve();
    return openDb().then(function (db) {
      if (!db) { keys.forEach(function (k) { store.del(k); }); return; }
      return new Promise(function (resolve, reject) {
        const t = db.transaction(KV, 'readwrite');
        const st = t.objectStore(KV);
        keys.forEach(function (k) { st.delete(k); });
        t.oncomplete = function () { resolve(); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('IndexedDB')); };
      });
    }).catch(function () {});
  }

  function kvKeys(prefix) {
    return openDb().then(function (db) {
      if (!db) return lsKeys(prefix);
      return new Promise(function (resolve, reject) {
        const req = db.transaction(KV, 'readonly').objectStore(KV)
          .getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff'));
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return []; });
  }

  function kvDelPrefix(prefix) { return kvKeys(prefix).then(kvDel); }

  // ── Identidad: cada cuenta tiene su namespace ──
  let uid = store.get(NS + ':uid') || 'anon';
  const KIND = { q: NS + ':q:', m: NS + ':m:', f: NS + ':f:' };  // cola, ID temporal→real, rechazados
  const cPrefix = (u) => NS + ':c:' + u + ':';                   // caché de lecturas
  const fullKey = (u) => NS + ':full:' + u;                      // metadatos de la última descarga
  const LOCK_KEY = NS + ':dl-lock';

  // Espejo en memoria (lecturas síncronas). Se carga desde IndexedDB al arrancar.
  const mem = { q: {}, m: {}, f: {} };

  function persist(kind, u) {
    return kvPut([[KIND[kind] + u, mem[kind][u] || (kind === 'm' ? {} : [])]]).catch(function () {
      state.lastError = 'A change could not be saved on this device.';
      emit();
    });
  }

  function migrateLegacy() {
    // Versiones anteriores guardaban cola y caché en localStorage
    const legacy = [];
    const touched = [];
    ['q', 'm', 'f'].forEach(function (k) {
      lsKeys(KIND[k]).forEach(function (key) {
        const u = key.slice(KIND[k].length);
        let v = null;
        try { v = JSON.parse(localStorage.getItem(key)); } catch (e) {}
        legacy.push(key);
        if (v == null) return;
        if (k === 'm') mem.m[u] = Object.assign({}, v, mem.m[u] || {});
        else mem[k][u] = (v || []).concat(mem[k][u] || []);
        touched.push([k, u]);
      });
    });
    lsKeys(NS + ':c:').forEach(function (k) { legacy.push(k); });
    if (!legacy.length) return Promise.resolve();
    return Promise.all(touched.map(function (t) { return persist(t[0], t[1]); })).then(function () {
      legacy.forEach(function (k) { store.del(k); });
    });
  }

  function loadState() {
    const jobs = ['q', 'm', 'f'].map(function (k) {
      return kvKeys(KIND[k]).then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return kvGet(key).then(function (v) {
            if (v != null) mem[k][key.slice(KIND[k].length)] = v;
          });
        }));
      });
    });
    return Promise.all(jobs).then(migrateLegacy).catch(function () {});
  }

  const READY = loadState();

  function setUid(next) {
    if (next == null) return;
    next = String(next);
    if (next === uid) return;
    if (uid === 'anon' && mem.q.anon && mem.q.anon.length) {
      // Cambios hechos antes de conocer la cuenta pasan a esta cuenta
      mem.q[next] = (mem.q[next] || []).concat(mem.q.anon);
      delete mem.q.anon;
      persist('q', next);
      kvDel([KIND.q + 'anon']);
    }
    uid = next;
    store.set(NS + ':uid', uid);
  }

  // ── Utilidades ──
  const pathOf = (url) => url.split('?')[0];
  const segsOf = (url) => url.split(/[\/?]/);
  let tmpSeq = 0;
  const newTmpId = () => { tmpSeq = (tmpSeq + 1) % 1000; return -(Date.now() * 1000 + tmpSeq); };
  const newOpId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function netError() {
    const e = new Error('No connection to the server');
    e.network = true; e.status = 0;
    return e;
  }
  const isNetError = (e) => !!(e && e.network);

  // ── Petición HTTP directa (sin lógica offline) ──
  async function rawRequest(method, url, body, opts) {
    const silent = !!(opts && opts.silent);
    const init = { method, headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res, text;
    try {
      res = await fetch(BASE + url, init);
      text = await res.text();
    } catch (err) {
      throw netError();
    }
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    // El service worker responde 503 {offline:true} cuando no hay red
    if (res.status === 503 && data && typeof data === 'object' && data.offline) throw netError();
    if (!res.ok) {
      if (res.status === 401 && !url.includes('/auth/') && !silent) {
        if (global.parent && global.parent !== global) global.parent.location.href = '/login';
        else global.location.href = '/login';
      }
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ── Caché de lecturas (IndexedDB) ──
  function cacheGet(url) { return kvGet(cPrefix(uid) + url); }
  function cacheSet(url, data) {
    return kvPut([[cPrefix(uid) + url, { ts: Date.now(), data }]]).catch(function () {});
  }
  function clearLocalCache() { return kvDelPrefix(cPrefix(uid)); }

  // ── Cola de cambios (espejo en memoria + IndexedDB) ──
  const readQueue = () => mem.q[uid] || [];
  function writeQueue(list) { mem.q[uid] = list; persist('q', uid); }
  const readMap = () => mem.m[uid] || {};
  function writeMap(m) {
    const keys = Object.keys(m);
    if (keys.length > MAP_LIMIT) keys.slice(0, keys.length - MAP_LIMIT).forEach((k) => { delete m[k]; });
    mem.m[uid] = m;
    persist('m', uid);
  }
  const readFailed = () => mem.f[uid] || [];
  function writeFailed(list) {
    mem.f[uid] = list.slice(-FAILED_LIMIT);
    persist('f', uid);
  }

  // Sustituye IDs temporales de la URL. Devuelve null si depende de un alta aún no resuelta.
  function remapUrl(url, map) {
    let unresolved = false;
    const out = url.replace(/([\/?])(-\d{6,})(?=[\/?]|$)/g, function (m, sep, tmp) {
      if (map[tmp] === undefined) { unresolved = true; return m; }
      return sep + map[tmp];
    });
    return unresolved ? null : out;
  }
  function remapBody(body, map) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    let out = body;
    Object.keys(body).forEach((k) => {
      const v = body[k];
      if (typeof v === 'number' && v < -1e6 && map[String(v)] !== undefined) {
        if (out === body) out = Object.assign({}, body);
        out[k] = map[String(v)];
      }
    });
    return out;
  }

  // Vista local: aplica a los datos (del servidor o de la caché) los cambios que aún no se han enviado.
  function applyPending(url, data) {
    const q = readQueue();
    if (!q.length || data == null) return data;
    const map = readMap();
    const path = pathOf(url);
    const sameItem = (it, id) => !!it && (String(it.id) === id || String(it.hand_id) === id);
    if (Array.isArray(data)) {
      let out = data.slice();
      q.forEach((op) => {
        const opPath = remapUrl(op.path, map) || op.path;
        if (op.method === 'POST' && op.tmpId != null && opPath === path) {
          out.push(Object.assign({}, op.body, { id: op.tmpId, _pending: true }));
          return;
        }
        const m = opPath.match(/^(.*)\/([^\/]+)$/);
        if (!m || m[1] !== path) return;
        const id = decodeURIComponent(m[2]);
        if (op.method === 'DELETE') out = out.filter((it) => !sameItem(it, id));
        else if (op.method === 'PUT') out = out.map((it) => (sameItem(it, id) ? Object.assign({}, it, op.body || {}) : it));
      });
      return out;
    }
    if (typeof data === 'object') {
      let out = data;
      q.forEach((op) => {
        if (op.method === 'PUT' && (remapUrl(op.path, map) || op.path) === path) out = Object.assign({}, out, op.body || {});
      });
      return out;
    }
    return data;
  }

  function enqueue(method, url, body) {
    const path = pathOf(url);
    const last = segsOf(path).pop();
    const isTmp = TMP_RE.test(last);
    const q = readQueue();

    if (isTmp && method === 'DELETE') {
      // Nunca llegó al servidor: se anulan el alta y todo lo que dependía de ella
      const tmp = Number(last);
      writeQueue(q.filter((op) => op.tmpId !== tmp && segsOf(op.url).indexOf(last) === -1));
      return { ok: true, offline: true, queued: true };
    }
    if (isTmp && method === 'PUT') {
      const create = q.find((op) => op.tmpId === Number(last));
      if (create) create.body = Object.assign({}, create.body, body || {});
    }

    // Escrituras repetidas al mismo recurso seguidas (p. ej. el tema al abrir una herramienta
    // sin conexión): se fusionan en la última, sin cambiar el resultado final.
    const prevOp = q[q.length - 1];
    if (method === 'PUT' && !isTmp && prevOp && prevOp.method === 'PUT' && prevOp.path === path && prevOp.attempts === 0) {
      prevOp.body = Object.assign({}, prevOp.body || {}, body || {});
      prevOp.ts = Date.now();
      writeQueue(q);
      return { ok: true, offline: true, queued: true };
    }

    const isCreate = method === 'POST' && CREATE_PATHS.indexOf(path) !== -1;
    const op = { id: newOpId(), method, url, path, body, ts: Date.now(), attempts: 0 };
    if (isCreate) op.tmpId = newTmpId();
    q.push(op);
    writeQueue(q);

    const res = { ok: true, offline: true, queued: true };
    if (isCreate) res.id = op.tmpId;
    return res;
  }

  function queueAndSchedule(method, url, body) {
    const res = enqueue(method, url, body);
    if (navigator.onLine !== false) scheduleFlush();
    emit();
    return res;
  }

  // ── Lecturas ──
  async function readThrough(url, opts) {
    await READY;
    const mapped = remapUrl(url, readMap()) || url;
    const cacheable = CACHEABLE.test(mapped);
    try {
      const data = await rawRequest('GET', mapped, undefined, opts);
      if (mapped === '/api/auth/me' && data && data.authenticated && data.user) setUid(data.user.id);
      if (cacheable) cacheSet(mapped, data);   // no se espera: no retrasa la respuesta
      return applyPending(mapped, data);
    } catch (e) {
      if (!isNetError(e) || !cacheable) throw e;
      const hit = await cacheGet(mapped);
      if (hit) return applyPending(mapped, hit.data);
      throw e;
    }
  }

  // ── Escrituras ──
  async function request(method, url, body, opts) {
    await READY;
    if (method === 'GET') return readThrough(url, opts);
    if (!QUEUEABLE.test(url)) return rawRequest(method, url, body, opts);

    const mapped = remapUrl(url, readMap());
    if (mapped === null) return queueAndSchedule(method, url, body);  // depende de un alta pendiente
    if (navigator.onLine === false || readQueue().length > 0) return queueAndSchedule(method, mapped, body);

    try {
      return await rawRequest(method, mapped, body, opts);
    } catch (e) {
      if (!isNetError(e)) throw e;
      return queueAndSchedule(method, mapped, body);
    }
  }

  // ── Sincronización ──
  let flushing = null;
  let flushTimer = null;

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_DEBOUNCE_MS);
  }

  function flush() {
    if (!flushing) {
      flushing = doFlush()
        .catch(() => {})
        .then(() => { flushing = null; state.syncing = false; emit(); });
    }
    return flushing;
  }

  function moveToFailed(op, message, status) {
    writeQueue(readQueue().filter((o) => o.id !== op.id));
    const f = readFailed();
    f.push({ op, message: message || 'Error', status: status || null, ts: Date.now() });
    writeFailed(f);
    state.lastError = message || null;
  }

  function bumpAttempts(op, message) {
    const q = readQueue();
    const cur = q.find((o) => o.id === op.id);
    if (!cur) return;
    state.lastError = message || null;
    cur.attempts = (cur.attempts || 0) + 1;
    if (cur.attempts >= MAX_ATTEMPTS) { moveToFailed(cur, message || 'Server error', 500); return; }
    writeQueue(q);
  }

  async function doFlush() {
    await READY;
    if (!readQueue().length) { state.authNeeded = false; return; }
    if (navigator.onLine === false) { state.offline = true; return; }
    state.syncing = true;
    emit();

    let me;
    try { me = await rawRequest('GET', '/api/auth/me', undefined, { silent: true }); }
    catch (e) { if (isNetError(e)) { state.offline = true; return; } throw e; }
    if (!me || !me.authenticated || !me.user) { state.authNeeded = true; return; }

    // Solo se envían los cambios de la cuenta que tiene la sesión activa
    setUid(me.user.id);
    state.authNeeded = false;
    state.offline = false;

    for (;;) {
      const q = readQueue();
      if (!q.length) break;
      const op = q[0];
      const url = remapUrl(op.url, readMap());
      if (url === null) { moveToFailed(op, 'Depends on a record that could not be created', null); continue; }
      try {
        const res = await rawRequest(op.method, url, remapBody(op.body, readMap()), { silent: true });
        if (op.tmpId != null && res && res.id != null) {
          const m = readMap();
          m[String(op.tmpId)] = res.id;
          writeMap(m);
        }
        writeQueue(readQueue().filter((o) => o.id !== op.id));
        state.lastSync = Date.now();
        state.lastError = null;
        emit();
      } catch (e) {
        if (isNetError(e)) { state.offline = true; return; }
        if (e.status === 401) { state.authNeeded = true; return; }
        if (e.status && e.status < 500) { moveToFailed(op, e.message, e.status); continue; }
        bumpAttempts(op, e.message);
        return;
      }
    }
  }

  function listFailed() {
    return readFailed().map((x) => ({
      id: x.op.id, method: x.op.method, path: x.op.path,
      message: x.message, status: x.status, ts: x.ts
    }));
  }
  function retryFailed() {
    const f = readFailed();
    writeFailed([]);
    if (f.length) writeQueue(readQueue().concat(f.map((x) => Object.assign({}, x.op, { attempts: 0 }))));
    return flush();
  }
  function discardFailed(id) { writeFailed(readFailed().filter((x) => x.op.id !== id)); emit(); }
  function discardAllFailed() { writeFailed([]); emit(); }

  function counts() {
    const foreign = Object.keys(mem.q)
      .filter((u) => u !== uid)
      .reduce((n, u) => n + (mem.q[u] || []).length, 0);
    return { pending: readQueue().length, failed: readFailed().length, foreign };
  }
  function snapshot() {
    return Object.assign(
      { online: navigator.onLine !== false && !state.offline, uid: uid === 'anon' ? null : uid },
      state,
      counts()
    );
  }
  function emit() {
    try { global.dispatchEvent(new CustomEvent('rangelab:sync', { detail: snapshot() })); } catch (e) {}
  }

  // ── API pública (misma forma que antes) ──
  const API = {
    auth: {
      me: () => request('GET', '/api/auth/me'),
      login: (username, password) => request('POST', '/api/auth/login', { username, password }),
      register: (username, password, display_name) =>
        request('POST', '/api/auth/register', { username, password, display_name }),
      logout: () => request('POST', '/api/auth/logout').then((r) => {
        clearLocalCache();
        store.del(fullKey(uid));
        swCall({ type: 'CLEAR_PAGES' }, 15000);
        emit();
        return r;
      }),
      changePassword: (old_password, new_password) =>
        request('POST', '/api/auth/change-password', { old_password, new_password }),
      updateProfile: (data) => request('PUT', '/api/auth/profile', data),
      dataSummary: () => request('GET', '/api/auth/data-summary')
    },

    site: () => request('GET', '/api/site'),

    // ─── Equity ───
    equity: {
      list: () => request('GET', '/api/equity/sessions'),
      create: (data) => request('POST', '/api/equity/sessions', data),
      get: (id) => request('GET', `/api/equity/sessions/${id}`),
      update: (id, data) => request('PUT', `/api/equity/sessions/${id}`, data),
      remove: (id) => request('DELETE', `/api/equity/sessions/${id}`)
    },

    // ─── Preflop ───
    preflop: {
      list: (full) => request('GET', `/api/preflop/tables${full ? '?full=1' : ''}`),
      upsert: (data) => request('POST', '/api/preflop/tables', data),
      get: (id) => request('GET', `/api/preflop/tables/${id}`),
      remove: (id) => request('DELETE', `/api/preflop/tables/${id}`),
      bulk: (tables) => request('POST', '/api/preflop/bulk', { tables })
    },

    // ─── Tracker ───
    tracker: {
      getState: () => request('GET', '/api/tracker/state'),
      setState: (data) => request('PUT', '/api/tracker/state', data),
      listTournaments: () => request('GET', '/api/tracker/tournaments'),
      createTournament: (data) => request('POST', '/api/tracker/tournaments', data),
      updateTournament: (id, data) => request('PUT', `/api/tracker/tournaments/${id}`, data),
      deleteTournament: (id) => request('DELETE', `/api/tracker/tournaments/${id}`),
      listTransactions: () => request('GET', '/api/tracker/transactions'),
      createTransaction: (data) => request('POST', '/api/tracker/transactions', data),
      updateTransaction: (id, data) => request('PUT', `/api/tracker/transactions/${id}`, data),
      deleteTransaction: (id) => request('DELETE', `/api/tracker/transactions/${id}`),
      clear: () => request('POST', '/api/tracker/clear')
    },

    // ─── FeltLab ───
    feltlab: {
      countHands: () => request('GET', '/api/feltlab/hands/count'),
      listHands: (opts) => {
        if (typeof opts === 'number') opts = { limit: opts };
        opts = opts || {};
        const q = new URLSearchParams();
        if (opts.limit) q.set('limit', opts.limit);
        if (opts.offset) q.set('offset', opts.offset);
        if (opts.site) q.set('site', opts.site);
        if (opts.light) q.set('light', '1');
        const qs = q.toString();
        return request('GET', `/api/feltlab/hands${qs ? '?' + qs : ''}`);
      },
      getHand: (id) => request('GET', `/api/feltlab/hands/${encodeURIComponent(id)}`),
      bulkHands: (hands) => request('POST', '/api/feltlab/hands/bulk', { hands }),
      clearHands: () => request('POST', '/api/feltlab/hands/clear'),
      deleteHand: (id) => request('DELETE', `/api/feltlab/hands/${encodeURIComponent(id)}`),
      bulkDelete: (ids) => request('POST', '/api/feltlab/hands/bulk-delete', { ids }),
      listNotes: () => request('GET', '/api/feltlab/notes'),
      putNote: (id, text, tags) => request('PUT', `/api/feltlab/notes/${encodeURIComponent(id)}`, { text, tags }),
      deleteNote: (id) => request('DELETE', `/api/feltlab/notes/${encodeURIComponent(id)}`),
      listFavs: () => request('GET', '/api/feltlab/favorites'),
      addFav: (id) => request('PUT', `/api/feltlab/favorites/${encodeURIComponent(id)}`),
      removeFav: (id) => request('DELETE', `/api/feltlab/favorites/${encodeURIComponent(id)}`),
      getConfig: () => request('GET', '/api/feltlab/config'),
      setConfig: (cfg) => request('PUT', '/api/feltlab/config', cfg),
      listFiles: () => request('GET', '/api/feltlab/files'),
      putFile: (data) => request('POST', '/api/feltlab/files', data)
    },

    // ─── AI Table → Hand Lab ───
    ailab: {
      saveHand: (hand) => request('POST', '/api/ailab/save-hand', { hand }),
      profile: (limit) => request('GET', `/api/ailab/profile?limit=${limit || 3000}`)
    },

    // ─── MTT Exploiter (pool global) ───
    mtt: {
      poolMeta: () => request('GET', '/api/mtt/pool/meta'),
      poolAnalyze: (limit) => request('GET', `/api/mtt/pool/analyze${limit ? '?limit=' + limit : ''}`)
    },

    // ─── Biblioteca de packs (solo en línea para publicar/importar) ───
    library: {
      list: () => request('GET', '/api/library/packs'),
      publish: (data) => request('POST', '/api/library/packs', data),
      get: (id, withHands) => request('GET', `/api/library/packs/${id}${withHands ? '?hands=1' : ''}`),
      import: (id) => request('POST', `/api/library/packs/${id}/import`),
      remove: (id) => request('DELETE', `/api/library/packs/${id}`)
    }
  };

  // ═══════════════════════════════════════════════════════════
  // DESCARGA COMPLETA PARA USO SIN CONEXIÓN
  // ═══════════════════════════════════════════════════════════

  // Habla con el service worker. Resuelve { ok: n } o { ok: 0 } si no hay SW o se agota el tiempo.
  function swCall(msg, timeoutMs) {
    return new Promise(function (resolve) {
      if (!('serviceWorker' in navigator)) return resolve({ ok: 0 });
      const timer = setTimeout(function () { resolve({ ok: 0, timeout: true }); }, timeoutMs || 180000);
      navigator.serviceWorker.ready.then(function (reg) {
        const target = reg.active || navigator.serviceWorker.controller;
        if (!target) { clearTimeout(timer); return resolve({ ok: 0 }); }
        const ch = new MessageChannel();
        ch.port1.onmessage = function (ev) { clearTimeout(timer); resolve(ev.data || { ok: 0 }); };
        target.postMessage(msg, [ch.port2]);
      }).catch(function () { clearTimeout(timer); resolve({ ok: 0 }); });
    });
  }

  const asArr = (x) => (Array.isArray(x) ? x : (x && Array.isArray(x.packs) ? x.packs : []));

  // Ejecuta fn sobre cada elemento con poca concurrencia. Devuelve cuántos fallaron (no de red).
  async function each(items, fn, conc) {
    const list = asArr(items).filter((x) => x && x.id != null);
    let next = 0, errors = 0;
    async function worker() {
      while (next < list.length) {
        const item = list[next++];
        try { await fn(item); }
        catch (e) { if (isNetError(e)) throw e; errors++; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(conc || 4, list.length) }, worker));
    return errors;
  }

  async function fetchAllHands() {
    const first = await API.feltlab.listHands({ limit: DOWNLOAD_PAGE, offset: 0 });
    if (!Array.isArray(first)) return [];
    const all = first.slice();
    if (first.length < DOWNLOAD_PAGE) return all;
    let offset = DOWNLOAD_PAGE;
    for (;;) {
      const chunk = await API.feltlab.listHands({ limit: DOWNLOAD_PAGE, offset });
      if (!Array.isArray(chunk) || !chunk.length) break;
      all.push(...chunk);
      if (chunk.length < DOWNLOAD_PAGE) break;
      offset += DOWNLOAD_PAGE;
    }
    return all;
  }

  // Cada mano también se guarda por su ID para abrir el detalle sin conexión.
  // El listado ya trae la mano completa, así que no hace falta pedirla otra vez.
  async function cacheHands(hands) {
    const ts = Date.now();
    for (let i = 0; i < hands.length; i += 1000) {
      const entries = hands.slice(i, i + 1000).map(function (h) {
        return [cPrefix(uid) + '/api/feltlab/hands/' + encodeURIComponent(String(h.id)), { ts, data: h }];
      });
      await kvPut(entries).catch(function () {});
    }
  }

  function buildSteps() {
    return [
      { label: 'Profile and site', run: async () => { await API.site(); return 0; } },
      { label: 'Equity Lab', run: async (info) => {
        const list = asArr(await API.equity.list());
        info.items += list.length;
        info.errors += await each(list, (s) => API.equity.get(s.id));
      } },
      { label: 'Preflop Lab', run: async (info) => {
        const full = asArr(await API.preflop.list(true));
        await API.preflop.list();
        info.items += full.length;
        info.errors += await each(full, (t) => API.preflop.get(t.id));
      } },
      { label: 'Bankroll Lab', run: async (info) => {
        await API.tracker.getState();
        const t = asArr(await API.tracker.listTournaments());
        const x = asArr(await API.tracker.listTransactions());
        info.items += t.length + x.length;
      } },
      { label: 'Hand Lab', run: async (info) => {
        await API.feltlab.countHands();
        const hands = await fetchAllHands();
        info.hands = hands.length;
        info.items += hands.length;
        await cacheHands(hands);
        await API.feltlab.listNotes();
        await API.feltlab.listFavs();
        await API.feltlab.getConfig();
        await API.feltlab.listFiles();
      } },
      { label: 'AI Table', run: async () => { await API.ailab.profile(3000); return 0; } },
      { label: 'MTT Exploiter', run: async () => {
        await API.mtt.poolMeta();
        await API.mtt.poolAnalyze(50000);
        return 0;
      } },
      { label: 'Log files', run: async (info) => {
        // Los pide al servidor: el service worker los guarda para uso sin conexión.
        let names = [];
        try {
          const r = await fetch('/logs/index.json?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
          if (r.ok) {
            const arr = await r.json();
            if (Array.isArray(arr)) names = arr.map(String);
          }
        } catch (e) { /* sin índice no hay nada que descargar */ }
        info.items += names.length;
        for (const n of names) {
          try {
            const r = await fetch('/logs/' + encodeURIComponent(n), { cache: 'no-store', credentials: 'same-origin' });
            if (!r.ok) info.errors++;
            await r.text();
          } catch (e) { info.errors++; }
        }
      } },
      { label: 'Library', run: async (info) => {
        const packs = asArr(await API.library.list());
        info.items += packs.length;
        info.errors += await each(packs, (p) => API.library.get(p.id, true));
      } }
    ];
  }

  function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (e) {}
  }

  function lockHeld() {
    const l = store.get(LOCK_KEY);
    return !!(l && Date.now() - l < LOCK_STALE_MS);
  }

  async function runDownload(onProgress) {
    await READY;
    const say = (label, done, total) => {
      const detail = { label, done, total };
      try { if (onProgress) onProgress(detail); } catch (e) {}
      try { global.dispatchEvent(new CustomEvent('rangelab:download', { detail })); } catch (e) {}
    };

    if (navigator.onLine === false) throw netError();
    const me = await rawRequest('GET', '/api/auth/me', undefined, { silent: true });
    if (!me || !me.authenticated || !me.user) {
      const e = new Error('Not authenticated'); e.status = 401; throw e;
    }
    setUid(me.user.id);

    const uidAtStart = uid;
    const info = { ts: Date.now(), complete: false, items: 0, hands: 0, pages: 0, errors: 0 };
    const steps = buildSteps();
    const total = steps.length + 1;
    store.set(LOCK_KEY, Date.now());
    state.downloading = true;
    emit();

    try {
      say('Tools', 0, total);
      const shell = await swCall({ type: 'PRECACHE_SHELL' });
      const pages = await swCall({ type: 'PRECACHE_PAGES', urls: TOOL_PAGES });
      info.pages = (shell.ok || 0) + (pages.ok || 0);

      for (let i = 0; i < steps.length; i++) {
        say(steps[i].label, i + 1, total);
        try {
          await steps[i].run(info);
        } catch (e) {
          if (isNetError(e)) throw e;
          info.errors++;
        }
      }
      say('Done', total, total);
      info.complete = true;
      info.ts = Date.now();
      store.set(fullKey(uidAtStart), info);
      return info;
    } catch (e) {
      info.ts = Date.now();
      store.set(fullKey(uidAtStart), info);   // descarga parcial: se puede reintentar
      throw e;
    } finally {
      store.del(LOCK_KEY);
    }
  }

  let downloading = null;

  // Descarga todo (herramientas + datos). Si ya hay una descarga en curso, devuelve esa.
  function downloadAll(onProgress) {
    if (downloading) return downloading;
    requestPersistence();   // se pide dentro del gesto del usuario, antes de cualquier await
    downloading = runDownload(onProgress).finally(function () {
      downloading = null;
      state.downloading = false;
      emit();
    });
    return downloading;
  }

  function downloadStatus() { return store.get(fullKey(uid)); }

  async function removeDownload() {
    await READY;
    await clearLocalCache();
    store.del(fullKey(uid));
    await swCall({ type: 'CLEAR_PAGES' }, 15000);
    emit();
  }

  function autoDownloadDue() {
    if (uid === 'anon' || lockHeld()) return false;
    const last = downloadStatus();
    if (last && last.complete && Date.now() - last.ts < AUTO_EVERY_MS) return false;
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)[23]g$/.test(c.effectiveType || ''))) return false;
    return true;
  }

  async function storageEstimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { usage: e.usage || 0, quota: e.quota || 0 };
      }
    } catch (e) {}
    return null;
  }

  // ── Exposición global ──
  global.FeltLabAPI = API;
  global.RangeLabAPI = API;   // alias
  global.RangeLabOffline = {
    status: snapshot,
    flush,
    failed: listFailed,
    retryFailed,
    discardFailed,
    discardAllFailed,
    clearCache: clearLocalCache,
    pages: TOOL_PAGES,
    downloadAll,
    downloadStatus,
    removeDownload,
    storageEstimate
  };

  // ── Disparadores automáticos ──
  global.addEventListener('online', () => { state.offline = false; emit(); flush(); });
  global.addEventListener('offline', () => { state.offline = true; emit(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && readQueue().length) flush();
  });
  setInterval(() => {
    if (navigator.onLine !== false && readQueue().length) flush();
  }, FLUSH_INTERVAL_MS);

  // ── Arranque: identificar la cuenta, reanudar pendientes y descargar si toca ──
  (async function boot() {
    await READY;
    if (navigator.onLine !== false) {
      try { await readThrough('/api/auth/me', { silent: true }); } catch (e) {}
      if (autoDownloadDue()) {
        setTimeout(function () {
          if (navigator.onLine !== false && autoDownloadDue()) downloadAll().catch(function () {});
        }, 8000);
      }
    }
    emit();
    if (readQueue().length) flush();
  })();
})(window);
