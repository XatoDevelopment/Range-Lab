/**
 * RangeLab Skeleton — global para TODAS las herramientas
 * - Pure CSS skeletons
 * - body.rl-loading mientras carga
 * - Service Worker registration (sin banner de offline)
 * - Caché localStorage opcional por clave
 */
(function (global) {
  'use strict';

  var CACHE_PREFIX = 'rangelab_cache_';
  var ready = false;

  function setLoading(on) {
    document.body.classList.toggle('rl-loading', !!on);
  }

  function setOffline(on) {
    /* Silencioso: no banner ni clase visible de "sin conexión / caché" */
    document.body.classList.toggle('rl-offline', !!on);
  }

  function saveCache(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function loadCache(key, maxAgeMs) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (maxAgeMs && parsed.ts && (Date.now() - parsed.ts > maxAgeMs)) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function clearCache(key) {
    try { localStorage.removeItem(CACHE_PREFIX + key); } catch (e) {}
  }

  function bindNetwork() {
    function sync() { setOffline(!navigator.onLine); }
    window.addEventListener('online', function () { setOffline(false); });
    window.addEventListener('offline', function () { setOffline(true); });
    sync();
  }

  function registerSW(path) {
    if (!('serviceWorker' in navigator)) return;
    var url = path || '/sw.js';
    var doReg = function () {
      navigator.serviceWorker.register(url).catch(function () {});
    };
    if (document.readyState === 'complete') doReg();
    else window.addEventListener('load', doReg);
  }

  /**
   * Mark page as loaded: quita skeleton + oculta splash si existe.
   */
  function markReady() {
    if (ready) return;
    ready = true;
    setLoading(false);
    var splash = document.getElementById('splash');
    if (splash && !splash.classList.contains('hidden')) {
      splash.classList.add('hidden');
      setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 400);
    }
  }

  function autoBoot() {
    markReady();
  }

  function patchSetLoading() {
    /* noop hook for pages that call RangeLabSkeleton.setLoading */
  }

  global.RangeLabSkeleton = {
    setLoading: setLoading,
    setOffline: setOffline,
    saveCache: saveCache,
    loadCache: loadCache,
    clearCache: clearCache,
    bindNetwork: bindNetwork,
    registerSW: registerSW,
    markReady: markReady,
    autoBoot: autoBoot,
    patchSetLoading: patchSetLoading
  };

  function onReady() {
    bindNetwork();
    registerSW('/sw.js');
    if (document.getElementById('splash') || document.getElementById('app') || document.querySelector('.tool-grid, .stats-grid, .matrix, .range-grid')) {
      setLoading(true);
    }
    patchSetLoading();
    setTimeout(function () { setLoading(false); }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})(typeof window !== 'undefined' ? window : this);
