/* RangeLab — alternador de tema claro/oscuro, compartido por toda la suite.
   El tema ya se aplica antes del primer paint mediante el script inline
   en el <head> de cada plantilla; este archivo solo conecta el botón. */
(function () {
  'use strict';
  var KEY = 'rangelab-theme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function apply(theme, persist) {
    document.documentElement.classList.add('rl-theme-transition');
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f4ee' : '#0a0c13');
    if (persist) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
    window.clearTimeout(apply._t);
    apply._t = window.setTimeout(function () {
      document.documentElement.classList.remove('rl-theme-transition');
    }, 300);
  }

  function toggle() {
    apply(current() === 'light' ? 'dark' : 'light', true);
  }

  function wireButton(btn) {
    if (!btn || btn.dataset.rlWired) return;
    btn.dataset.rlWired = '1';
    btn.setAttribute('aria-label', 'Cambiar tema claro/oscuro');
    btn.addEventListener('click', toggle);
  }

  function initAll() {
    document.querySelectorAll('#themeToggle, .theme-toggle').forEach(wireButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  window.RangeLabTheme = { toggle: toggle, apply: apply, current: current, wireButton: wireButton };
})();
