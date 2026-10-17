/* RangeLab — estado de conexión y sincronización (v1.5)
   · Registra el service worker y avisa cuando hay una versión nueva.
   · Muestra un aviso discreto solo cuando hace falta: sin conexión,
     cambios pendientes, errores o cambios de otra cuenta.
   · Precarga las herramientas para usarlas sin conexión. */
(function (global) {
  'use strict';
  if (global.__rlOfflineUI) return;
  global.__rlOfflineUI = true;

  var PRECACHE_KEY = 'rl:v1:precache-at';
  var PRECACHE_EVERY = 12 * 60 * 60 * 1000;
  var FALLBACK_PAGES = [
    '/', '/profile', '/tool/equity', '/tool/preflop', '/tool/tracker', '/tool/feltlab',
    '/tool/range-analyzer', '/tool/mtt-exploiter', '/tool/ailab', '/tool/tournament-lab'
  ];
  // Misma lista que api-client.js (fuente única cuando está cargado)
  function toolPages() {
    return (global.RangeLabOffline && RangeLabOffline.pages) || FALLBACK_PAGES;
  }

  var STR = {
    es: {
      offline: 'Sin conexión. Tus cambios se guardan en este dispositivo.',
      offlinePending: 'Sin conexión · {n} cambio(s) guardados aquí',
      syncing: 'Sincronizando {n} cambio(s)…',
      synced: 'Todo sincronizado',
      auth: '{n} cambio(s) esperan. Inicia sesión para enviarlos.',
      login: 'Iniciar sesión',
      failed: '{n} cambio(s) no se pudieron guardar en el servidor.',
      view: 'Ver', hide: 'Ocultar', retry: 'Reintentar',
      discard: 'Descartar', discardAll: 'Descartar todo',
      confirmDiscard: '¿Descartar los cambios que no se pudieron guardar?',
      foreign: '{n} cambio(s) de otra cuenta esperan en este dispositivo.',
      update: 'Hay una versión nueva de RangeLab.',
      updateBtn: 'Actualizar'
    },
    en: {
      offline: 'Offline. Your changes are saved on this device.',
      offlinePending: 'Offline · {n} change(s) saved here',
      syncing: 'Syncing {n} change(s)…',
      synced: 'All synced',
      auth: '{n} change(s) waiting. Sign in to send them.',
      login: 'Sign in',
      failed: '{n} change(s) could not be saved to the server.',
      view: 'View', hide: 'Hide', retry: 'Retry',
      discard: 'Discard', discardAll: 'Discard all',
      confirmDiscard: 'Discard the changes that could not be saved?',
      foreign: '{n} change(s) from another account are waiting on this device.',
      update: 'A new version of RangeLab is available.',
      updateBtn: 'Update'
    }
  };

  function lang() {
    var l = '';
    try { l = localStorage.getItem('rangelab-lang') || ''; } catch (e) {}
    l = l || (document.documentElement.lang || 'en');
    return l.slice(0, 2) === 'es' ? 'es' : 'en';
  }
  function fmt(s, n) { return s.replace('{n}', String(n)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var CSS = [
    '#rl-sync{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);',
    'z-index:9000;width:max-content;max-width:min(560px,calc(100vw - 24px));box-sizing:border-box;',
    'background:#111a2e;color:#e8ecf4;border:1px solid #2a3a5c;border-radius:14px;',
    'box-shadow:0 10px 28px rgba(0,0,0,.45);padding:10px 12px;',
    'font:500 13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;gap:8px}',
    '@media (max-width:768px){#rl-sync{bottom:calc(env(safe-area-inset-bottom,0px) + 84px)}}',
    '#rl-sync[hidden]{display:none}',
    '#rl-sync .rl-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '#rl-sync .rl-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;flex:none}',
    '#rl-sync[data-mode=offline] .rl-dot{background:#f0c14b}',
    '#rl-sync[data-mode=syncing] .rl-dot{background:#2dd4bf;animation:rl-pulse 1.2s ease-in-out infinite}',
    '#rl-sync[data-mode=synced] .rl-dot{background:#34d399}',
    '#rl-sync[data-mode=failed] .rl-dot,#rl-sync[data-mode=auth] .rl-dot{background:#f87171}',
    '#rl-sync[data-mode=update] .rl-dot{background:#60a5fa}',
    '#rl-sync[data-mode=foreign] .rl-dot{background:#c084fc}',
    '#rl-sync .rl-msg{flex:1;min-width:0}',
    '#rl-sync button,#rl-sync a.rl-btn{font:inherit;font-weight:600;font-size:12px;color:#0c1222;background:#f0c14b;',
    'border:0;border-radius:9px;padding:7px 11px;min-height:32px;cursor:pointer;text-decoration:none;',
    'display:inline-flex;align-items:center}',
    '#rl-sync button.rl-ghost{background:transparent;color:#cbd5e1;border:1px solid #2a3a5c}',
    '#rl-sync button:focus-visible,#rl-sync a.rl-btn:focus-visible{outline:2px solid #f0c14b;outline-offset:2px}',
    '#rl-sync .rl-list{list-style:none;margin:0;padding:0;max-height:180px;overflow:auto;font-size:12px;color:#94a3b8}',
    '#rl-sync .rl-list li{display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #1e2a44}',
    '#rl-sync .rl-list code{color:#e8ecf4;font:11px ui-monospace,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '#rl-sync .rl-list .rl-err{color:#f87171}',
    '#rl-sync .rl-list button{margin-left:auto;flex:none;min-height:26px;padding:4px 8px}',
    '@keyframes rl-pulse{50%{opacity:.35}}',
    '@media (prefers-reduced-motion:reduce){#rl-sync .rl-dot{animation:none !important}}'
  ].join('');

  var el = null, lastDetail = null, waiting = null, expanded = false;
  var flashUntil = 0, flashTimer = null, swReg = null, precacheTried = false;
  var userRequestedUpdate = false, reloading = false;

  function build() {
    if (el) return el;
    var st = document.createElement('style');
    st.id = 'rl-sync-style';
    st.textContent = CSS;
    document.head.appendChild(st);
    el = document.createElement('div');
    el.id = 'rl-sync';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.addEventListener('click', onClick);
    document.body.appendChild(el);
    return el;
  }

  function onClick(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!b) return;
    var act = b.getAttribute('data-act');
    var L = STR[lang()];
    if (act === 'update') {
      userRequestedUpdate = true;
      if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    } else if (act === 'toggle') {
      expanded = !expanded;
      render();
    } else if (act === 'retry' && global.RangeLabOffline) {
      RangeLabOffline.retryFailed();
    } else if (act === 'discard' && global.RangeLabOffline) {
      RangeLabOffline.discardFailed(b.getAttribute('data-id'));
    } else if (act === 'discard-all' && global.RangeLabOffline) {
      if (confirm(L.confirmDiscard)) RangeLabOffline.discardAllFailed();
    }
  }

  function render() {
    build();
    var L = STR[lang()];
    var d = lastDetail || {
      online: navigator.onLine !== false, offline: false,
      pending: 0, failed: 0, foreign: 0, authNeeded: false
    };
    var online = navigator.onLine !== false && !d.offline;
    var mode = null, row = '', extra = '';

    if (waiting) {
      mode = 'update';
      row = '<span class="rl-msg">' + esc(L.update) + '</span>' +
            '<button type="button" data-act="update">' + esc(L.updateBtn) + '</button>';
    } else if (!online) {
      mode = 'offline';
      row = '<span class="rl-msg">' + esc(d.pending ? fmt(L.offlinePending, d.pending) : L.offline) + '</span>';
    } else if (d.authNeeded && d.pending) {
      mode = 'auth';
      row = '<span class="rl-msg">' + esc(fmt(L.auth, d.pending)) + '</span>' +
            '<a class="rl-btn" href="/login">' + esc(L.login) + '</a>';
    } else if (d.failed) {
      mode = 'failed';
      row = '<span class="rl-msg">' + esc(fmt(L.failed, d.failed)) + '</span>' +
            '<button type="button" class="rl-ghost" data-act="toggle">' + esc(expanded ? L.hide : L.view) + '</button>' +
            '<button type="button" data-act="retry">' + esc(L.retry) + '</button>';
      if (expanded && global.RangeLabOffline) {
        var items = RangeLabOffline.failed().map(function (f) {
          return '<li><code title="' + esc(f.method + ' ' + f.path) + '">' + esc(f.method + ' ' + f.path) + '</code>' +
                 '<span class="rl-err">' + esc(f.message) + '</span>' +
                 '<button type="button" class="rl-ghost" data-act="discard" data-id="' + esc(f.id) + '">' + esc(L.discard) + '</button></li>';
        }).join('');
        extra = '<ul class="rl-list">' + items + '</ul>' +
                '<div class="rl-row"><button type="button" class="rl-ghost" data-act="discard-all">' + esc(L.discardAll) + '</button></div>';
      }
    } else if (d.pending) {
      mode = 'syncing';
      row = '<span class="rl-msg">' + esc(fmt(L.syncing, d.pending)) + '</span>';
    } else if (d.foreign) {
      mode = 'foreign';
      row = '<span class="rl-msg">' + esc(fmt(L.foreign, d.foreign)) + '</span>';
    } else if (Date.now() < flashUntil) {
      mode = 'synced';
      row = '<span class="rl-msg">' + esc(L.synced) + '</span>';
    }

    if (!mode) {
      el.hidden = true;
      el.removeAttribute('data-mode');
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.setAttribute('data-mode', mode);
    el.innerHTML = '<div class="rl-row"><span class="rl-dot" aria-hidden="true"></span>' + row + '</div>' + extra;
  }

  function onSync(ev) {
    var prev = lastDetail;
    lastDetail = ev.detail || null;
    if (prev && prev.pending > 0 && lastDetail && lastDetail.pending === 0 && !lastDetail.failed && lastDetail.online !== false) {
      flashUntil = Date.now() + 2500;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(render, 2600);
    }
    if (lastDetail && !lastDetail.failed) expanded = false;
    if (lastDetail && lastDetail.uid && !precacheTried) {
      precacheTried = true;
      maybePrecache();
    }
    render();
  }

  function maybePrecache() {
    if (!swReg || navigator.onLine === false) return;
    var last = 0;
    try { last = Number(localStorage.getItem(PRECACHE_KEY)) || 0; } catch (e) {}
    if (Date.now() - last < PRECACHE_EVERY) return;
    setTimeout(function () {
      var target = swReg.active || navigator.serviceWorker.controller;
      if (!target) return;
      target.postMessage({ type: 'PRECACHE_PAGES', urls: toolPages() });
      try { localStorage.setItem(PRECACHE_KEY, String(Date.now())); } catch (e) {}
    }, 4000);
  }

  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; render(); }
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = reg.waiting || nw;
            render();
          }
        });
      });
      if (lastDetail && lastDetail.uid) maybePrecache();
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (userRequestedUpdate && !reloading) { reloading = true; location.reload(); }
    });
  }

  function start() {
    build();
    initSW();
    if (global.RangeLabOffline) onSync({ detail: RangeLabOffline.status() });
    else render();
  }

  global.addEventListener('rangelab:sync', onSync);
  global.addEventListener('online', render);
  global.addEventListener('offline', render);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
