/* RangeLab — tarjeta "Uso sin conexión" en Perfil (v1.1)
   · Descarga herramientas y todos los datos de la cuenta (también la automática).
   · Muestra qué herramientas están disponibles sin conexión y cuándo fue la última descarga.
   · Permite eliminar la copia local (los datos del servidor no se tocan). */
(function (global) {
  'use strict';
  if (global.__rlOfflinePack) return;
  global.__rlOfflinePack = true;

  var STR = {
    es: {
      title: 'Uso sin conexión',
      desc: 'Descarga RangeLab (herramientas y todos tus datos) para usarlo sin conexión con el servidor. Lo que cambies sin conexión se guarda en este dispositivo y se sincroniza al volver la conexión.',
      unsupported: 'Este navegador o esta dirección no permite uso sin conexión. Abre RangeLab por HTTPS (o en localhost).',
      never: 'Aún no has descargado RangeLab para uso sin conexión.',
      last: 'Última descarga: {date} · {hands} manos · {items} elementos',
      partial: 'La última descarga quedó incompleta ({date}). Vuelve a descargar.',
      pending: '{n} cambio(s) pendientes de enviar.',
      storage: 'Espacio usado en este dispositivo: {used} de {quota}',
      toolsLabel: 'Disponibles sin conexión:',
      toolsNone: 'Ninguna herramienta guardada todavía.',
      download: 'Descargar todo',
      update: 'Actualizar descarga',
      remove: 'Eliminar copia local',
      confirmRemove: '¿Eliminar la copia de datos de este dispositivo? Tus datos en el servidor no se tocan.',
      working: 'Descargando: {label} ({done}/{total})',
      done: 'Descarga completa. Ya puedes usar RangeLab sin conexión.',
      doneErrors: 'Descarga terminada. {n} elemento(s) no se pudieron descargar.',
      offlineNeed: 'Necesitas conexión para descargar.',
      error: 'No se pudo completar la descarga. Revisa la conexión e inténtalo de nuevo.',
      auto: 'Se actualiza sola cada 3 días cuando hay conexión.'
    },
    en: {
      title: 'Offline use',
      desc: 'Download RangeLab (tools and all your data) to use it without connection to the server. Changes you make offline are saved on this device and synced when you are back online.',
      unsupported: 'This browser or this address does not allow offline use. Open RangeLab over HTTPS (or on localhost).',
      never: 'You have not downloaded RangeLab for offline use yet.',
      last: 'Last download: {date} · {hands} hands · {items} items',
      partial: 'The last download was incomplete ({date}). Download again.',
      pending: '{n} change(s) waiting to be sent.',
      storage: 'Space used on this device: {used} of {quota}',
      toolsLabel: 'Available offline:',
      toolsNone: 'No tools saved yet.',
      download: 'Download everything',
      update: 'Update download',
      remove: 'Remove local copy',
      confirmRemove: 'Remove the data copy from this device? Your server data is not affected.',
      working: 'Downloading: {label} ({done}/{total})',
      done: 'Download complete. You can now use RangeLab offline.',
      doneErrors: 'Download finished. {n} item(s) could not be downloaded.',
      offlineNeed: 'You need a connection to download.',
      error: 'The download could not be completed. Check your connection and try again.',
      auto: 'Updates automatically every 3 days when online.'
    }
  };

  var TOOL_NAMES = {
    '/tool/equity': 'Equity Lab',
    '/tool/preflop': 'Preflop Lab',
    '/tool/tracker': 'Bankroll Lab',
    '/tool/feltlab': 'Hand Lab',
    '/tool/range-analyzer': 'Range Analyzer',
    '/tool/mtt-exploiter': 'MTT Exploiter',
    '/tool/ailab': 'AI Table',
    '/tool/tournament-lab': 'Tournament Lab'
  };

  var CSS = [
    '#rlPackCard .rlp-desc{color:var(--text-2,#a4acc0);font-size:13px;line-height:1.5;margin:0 0 12px}',
    '#rlPackCard .rlp-line{font-size:13px;color:var(--text,#eef1f7);margin:0 0 6px;line-height:1.45}',
    '#rlPackCard .rlp-line.muted{color:var(--text-3,#6b7590);font-size:12px}',
    '#rlPackCard .rlp-line.warn{color:#f0b35b}',
    '#rlPackCard .rlp-line.err{color:#f87171}',
    '#rlPackCard .rlp-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 2px}',
    '#rlPackCard .rlp-chip{font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;',
    'border:1px solid var(--border,#1e2636);color:var(--text-3,#6b7590)}',
    '#rlPackCard .rlp-chip.on{color:var(--cyan,#33d2e3);border-color:color-mix(in srgb,var(--cyan,#33d2e3) 50%,transparent)}',
    '#rlPackCard .rlp-bar{height:6px;border-radius:99px;background:var(--bg,#07090f);',
    'border:1px solid var(--border,#1e2636);overflow:hidden;margin:12px 0 4px}',
    '#rlPackCard .rlp-bar[hidden]{display:none}',
    '#rlPackCard .rlp-bar i{display:block;height:100%;width:0;background:var(--cyan,#33d2e3);transition:width .25s ease}',
    '@media (prefers-reduced-motion:reduce){#rlPackCard .rlp-bar i{transition:none}}'
  ].join('');

  var card = null, els = {}, refreshTimer = null;
  var localBusy = false;       // acción iniciada aquí (antes de que la descarga arranque de verdad)
  var progressText = '';       // texto de progreso mientras se descarga
  var note = '', noteCls = ''; // aviso de la última acción (hecha / error)

  function lang() {
    // Mismo origen de idioma que el resto de la app (i18n.js)
    if (global.RangeLabI18n && typeof RangeLabI18n.getLang === 'function') {
      return String(RangeLabI18n.getLang() || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
    }
    var l = '';
    try { l = localStorage.getItem('rangelab-lang') || ''; } catch (e) {}
    l = l || (document.documentElement.lang || 'en');
    return l.slice(0, 2) === 'es' ? 'es' : 'en';
  }
  function L() { return STR[lang()]; }
  function fmt(s, o) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? String(o[k]) : m; });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function gb(bytes) {
    return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GB' : (bytes / 1048576).toFixed(1) + ' MB';
  }
  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleString(lang() === 'en' ? 'en-US' : 'es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return new Date(ts).toLocaleString(); }
  }

  function supported() { return 'serviceWorker' in navigator && !!global.indexedDB && !!global.RangeLabOffline; }
  function isBusy() {
    if (localBusy) return true;
    return !!(global.RangeLabOffline && RangeLabOffline.status().downloading);
  }

  function mount() {
    var main = document.querySelector('.pf-main');
    if (!main) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    card = document.createElement('section');
    card.className = 'pf-card';
    card.id = 'rlPackCard';
    card.innerHTML =
      '<h2 class="pf-card-title" id="rlpTitle"></h2>' +
      '<p class="rlp-desc" id="rlpDesc"></p>' +
      '<p class="rlp-line" id="rlpLast"></p>' +
      '<p class="rlp-line muted" id="rlpPending" hidden></p>' +
      '<p class="rlp-line muted" id="rlpStorage" hidden></p>' +
      '<p class="rlp-line muted" id="rlpAuto"></p>' +
      '<div class="rlp-tools" id="rlpTools"></div>' +
      '<div class="rlp-bar" id="rlpBar" hidden><i></i></div>' +
      '<p class="rlp-line" id="rlpMsg" hidden></p>' +
      '<div class="pf-actions">' +
        '<button type="button" class="pf-btn primary" id="rlpGo"></button>' +
        '<button type="button" class="pf-btn" id="rlpDrop"></button>' +
      '</div>';

    var hero = main.querySelector('.pf-hero');
    if (hero && hero.parentNode) hero.parentNode.insertBefore(card, hero.nextSibling);
    else main.appendChild(card);

    ['rlpTitle', 'rlpDesc', 'rlpLast', 'rlpPending', 'rlpStorage', 'rlpAuto', 'rlpTools',
     'rlpBar', 'rlpMsg', 'rlpGo', 'rlpDrop'].forEach(function (id) {
      els[id] = document.getElementById(id);
    });
    els.bar = els.rlpBar.querySelector('i');

    els.rlpGo.addEventListener('click', onDownload);
    els.rlpDrop.addEventListener('click', onRemove);
  }

  function cachedTools() {
    if (!global.caches) return Promise.resolve([]);
    return caches.keys().then(function (keys) {
      var pk = keys.filter(function (k) { return k.indexOf('rangelab-pages-') === 0; })[0];
      if (!pk) return [];
      return caches.open(pk).then(function (c) {
        return Promise.all(Object.keys(TOOL_NAMES).map(function (p) {
          return c.match(p, { ignoreSearch: true }).then(function (hit) { return hit ? TOOL_NAMES[p] : null; });
        }));
      }).then(function (r) { return r.filter(Boolean); });
    }).catch(function () { return []; });
  }

  function renderTools(list) {
    var S = L();
    if (!list.length) {
      els.rlpTools.innerHTML = '<span class="rlp-line muted">' + esc(S.toolsNone) + '</span>';
      return;
    }
    els.rlpTools.innerHTML = '<span class="rlp-line muted">' + esc(S.toolsLabel) + '</span>' +
      list.map(function (n) { return '<span class="rlp-chip on">' + esc(n) + '</span>'; }).join('');
  }

  function renderStorage() {
    if (!global.RangeLabOffline || !RangeLabOffline.storageEstimate) return;
    RangeLabOffline.storageEstimate().then(function (e) {
      if (!e || !e.quota) { els.rlpStorage.hidden = true; return; }
      els.rlpStorage.hidden = false;
      els.rlpStorage.textContent = fmt(L().storage, { used: gb(e.usage), quota: gb(e.quota) });
    });
  }

  function refresh() {
    if (!card) return;
    var S = L();
    els.rlpTitle.textContent = S.title;
    els.rlpDesc.textContent = S.desc;
    els.rlpAuto.textContent = S.auto;
    els.rlpDrop.textContent = S.remove;

    if (!supported()) {
      els.rlpLast.textContent = S.unsupported;
      els.rlpLast.className = 'rlp-line warn';
      els.rlpGo.disabled = true;
      els.rlpDrop.hidden = true;
      els.rlpTools.innerHTML = '';
      els.rlpBar.hidden = true;
      return;
    }

    var st = RangeLabOffline.status();
    var info = RangeLabOffline.downloadStatus();
    var online = navigator.onLine !== false && !st.offline;
    var busy = isBusy();

    if (!info) {
      els.rlpLast.textContent = S.never;
      els.rlpLast.className = 'rlp-line muted';
    } else if (!info.complete) {
      els.rlpLast.textContent = fmt(S.partial, { date: fmtDate(info.ts) });
      els.rlpLast.className = 'rlp-line warn';
    } else {
      els.rlpLast.textContent = fmt(S.last, { date: fmtDate(info.ts), hands: info.hands || 0, items: info.items || 0 });
      els.rlpLast.className = 'rlp-line';
    }

    els.rlpGo.textContent = info && info.complete ? S.update : S.download;
    els.rlpGo.disabled = busy || !online || !st.uid;
    els.rlpDrop.disabled = busy || !info;

    if (st.pending) {
      els.rlpPending.hidden = false;
      els.rlpPending.textContent = fmt(S.pending, { n: st.pending });
    } else {
      els.rlpPending.hidden = true;
    }

    els.rlpBar.hidden = !busy;
    if (!busy) els.bar.style.width = '0%';

    // Mensaje: progreso > aviso de la última acción > aviso de falta de conexión
    var text = '', cls = '';
    if (busy && progressText) { text = progressText; }
    else if (note) { text = note; cls = noteCls; }
    else if (!online) { text = S.offlineNeed; cls = 'muted'; }
    els.rlpMsg.hidden = !text;
    els.rlpMsg.className = 'rlp-line' + (cls ? ' ' + cls : '');
    els.rlpMsg.textContent = text;

    cachedTools().then(renderTools);
    renderStorage();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 250);
  }

  // Progreso que llega del cliente de API (también de la descarga automática)
  function onProgressEvent(ev) {
    var d = ev.detail || {};
    if (d.total === undefined) return;
    els.bar.style.width = d.total ? Math.round((d.done / d.total) * 100) + '%' : '0%';
    progressText = fmt(L().working, { label: d.label, done: d.done, total: d.total });
    note = ''; noteCls = '';
    refresh();
  }

  function onDownload() {
    if (isBusy() || !supported()) return;
    localBusy = true;
    note = ''; noteCls = '';
    progressText = fmt(L().working, { label: '…', done: 0, total: '…' });
    refresh();
    RangeLabOffline.downloadAll().then(function (info) {
      localBusy = false;
      progressText = '';
      if (info.errors) { note = fmt(L().doneErrors, { n: info.errors }); noteCls = 'warn'; }
      else { note = L().done; noteCls = ''; }
      refresh();
    }).catch(function (e) {
      localBusy = false;
      progressText = '';
      note = e && e.network ? L().offlineNeed : L().error;
      noteCls = 'err';
      refresh();
    });
  }

  function onRemove() {
    if (isBusy() || !supported()) return;
    if (!global.confirm(L().confirmRemove)) return;
    localBusy = true;
    note = '';
    refresh();
    RangeLabOffline.removeDownload().then(function () {
      localBusy = false;
      refresh();
    }).catch(function () {
      localBusy = false;
      refresh();
    });
  }

  function init() {
    mount();
    if (!card) return;
    refresh();
    global.addEventListener('rangelab:download', onProgressEvent);
    global.addEventListener('rangelab:sync', function () {
      // Al terminar una descarga (automática o no) se limpia el progreso y se refresca
      if (!isBusy()) progressText = '';
      scheduleRefresh();
    });
    global.addEventListener('online', scheduleRefresh);
    global.addEventListener('offline', scheduleRefresh);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
