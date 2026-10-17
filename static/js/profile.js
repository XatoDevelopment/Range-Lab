/* ═══════════════════════════════════════════════════════════
   RangeLab — Panel de perfil de usuario (rediseño)
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function t(k, fb) {
    return (global.RangeLabI18n && global.RangeLabI18n.t) ? global.RangeLabI18n.t(k, fb) : (fb || k);
  }

  function ensureStyles() {
    var existing = document.getElementById('rl-profile-styles');
    if (existing) existing.remove();
    var css = document.createElement('style');
    css.id = 'rl-profile-styles';
    css.textContent = [
      /* Overlay — mismo estilo que drawers de herramientas */
      '.rl-profile-overlay{position:fixed;inset:0;z-index:600;background:rgba(7,9,15,.75);display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;visibility:hidden;transition:opacity .25s ease,visibility .25s;}',
      '.rl-profile-overlay.show{opacity:1;visibility:visible}',
      '@media(min-width:560px){.rl-profile-overlay{align-items:center;padding:20px}}',

      /* Panel — mismos tokens que eq-drawer / side-menu */
      '.rl-profile-modal{background:var(--bg-1,#0d1117);border:1px solid var(--border,#1e2636);border-radius:16px 16px 0 0;max-width:420px;width:100%;max-height:min(94vh,780px);display:flex;flex-direction:column;box-shadow:0 -8px 40px rgba(0,0,0,.5);transform:translateY(100%);transition:transform .3s cubic-bezier(.22,1,.36,1);overflow:hidden}',
      '.rl-profile-overlay.show .rl-profile-modal{transform:translateY(0)}',
      '@media(min-width:560px){.rl-profile-modal{border-radius:14px;transform:translateY(12px) scale(.98);max-height:min(90vh,760px);box-shadow:0 24px 64px rgba(0,0,0,.45)}.rl-profile-overlay.show .rl-profile-modal{transform:none}}',

      /* Header = eq-drawer-header */
      '.rl-profile-head{display:flex;align-items:center;gap:12px;padding:18px 18px 16px;border-bottom:1px solid var(--border-soft,var(--border,#1e2636));flex-shrink:0}',
      '.rl-profile-avatar{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--accent,#f2a83c),var(--accent-2,#9b8bf4));display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#1a1400;flex-shrink:0;box-shadow:0 0 18px color-mix(in srgb,var(--accent,#f2a83c) 35%,transparent)}',
      '.rl-profile-head-text{min-width:0;flex:1}',
      '.rl-profile-head h2{margin:0;font-size:17px;font-weight:900;letter-spacing:-.01em;line-height:1.2;color:var(--text,#eef1f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rl-profile-head .sub{font-size:11px;color:var(--text-3,#6b7590);font-weight:500;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rl-profile-close{width:38px;height:38px;min-width:38px;border-radius:10px;border:1px solid var(--border,#1e2636);background:var(--bg-2,#171c2a);color:var(--text-2,#a4acc0);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}',
      '.rl-profile-close:hover{color:var(--red,#f2685f);border-color:var(--red,#f2685f)}',
      '.rl-profile-close:active{transform:scale(.94)}',

      /* Body */
      '.rl-profile-body{padding:12px 14px calc(20px + var(--safe-bottom,0px));overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0}',

      /* Sections */
      '.rl-profile-sec{background:var(--bg-2,#171c2a);border:1px solid var(--border,#1e2636);border-radius:12px;padding:14px;margin-bottom:10px}',
      '.rl-profile-sec:last-child{margin-bottom:4px}',
      '.rl-profile-sec-title{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3,#6b7590);margin:0 0 12px}',

      /* Rows */
      '.rl-profile-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-soft,var(--border,#1e2636));font-size:13px}',
      '.rl-profile-row:last-child{border-bottom:none;padding-bottom:0}',
      '.rl-profile-row:first-of-type{padding-top:0}',
      '.rl-profile-row .label{color:var(--text-2,#a4acc0);flex:0 1 auto;min-width:0;font-weight:500}',
      '.rl-profile-row .value{font-weight:700;text-align:right;word-break:break-word;min-width:0;color:var(--text,#eef1f7)}',

      /* Badges */
      '.rl-profile-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(51,210,227,.16);color:var(--cyan,#33d2e3)}',
      '.rl-profile-badge.admin{background:rgba(240,193,75,.18);color:var(--amber,#f0c14b)}',
      '.rl-profile-badge.plan{background:rgba(53,212,136,.16);color:var(--green,#35d488)}',

      /* Tools */
      '.rl-profile-tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}',
      '.rl-profile-tool{font-size:11px;padding:5px 9px;border-radius:8px;border:1px solid var(--border,#1e2636);background:var(--bg-1,#0d1117);color:var(--text-3,#6b7590);font-weight:600}',
      '.rl-profile-tool.on{color:var(--green,#35d488);border-color:rgba(53,212,136,.45);background:rgba(53,212,136,.12)}',

      /* Data grid */
      '.rl-profile-data-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.rl-profile-data-item{background:var(--bg-1,#0d1117);border:1px solid var(--border,#1e2636);border-radius:10px;padding:10px 8px;text-align:center}',
      '.rl-profile-data-item .num{font-size:1.15rem;font-weight:800;font-family:var(--font-mono,JetBrains Mono,ui-monospace,monospace);color:var(--cyan,#33d2e3);line-height:1.2}',
      '.rl-profile-data-item .lbl{font-size:10px;color:var(--text-3,#6b7590);margin-top:4px;font-weight:600;line-height:1.25}',

      /* Forms */
      '.rl-profile-field{margin-bottom:12px}',
      '.rl-profile-field:last-of-type{margin-bottom:0}',
      '.rl-profile-field label{display:block;font-size:11px;font-weight:700;margin-bottom:6px;color:var(--text-3,#6b7590);text-transform:uppercase;letter-spacing:.04em}',
      '.rl-profile-field input{width:100%;padding:11px 13px;border-radius:11px;border:1px solid var(--border,#1e2636);background:var(--bg-1,#0d1117);color:var(--text,#eef1f7);font:inherit;font-size:14px;box-sizing:border-box;transition:border-color .15s}',
      '.rl-profile-field input:focus{outline:none;border-color:var(--cyan,#33d2e3);box-shadow:0 0 0 3px rgba(51,210,227,.18)}',
      '.rl-profile-field input::placeholder{color:var(--text-3,#6b7590);opacity:.7}',

      /* Actions — botones como tools */
      '.rl-profile-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
      '.rl-profile-btn{padding:11px 16px;border-radius:11px;border:1px solid var(--border,#1e2636);background:var(--bg-1,#0d1117);color:var(--text-2,#a4acc0);font-weight:700;font-size:13px;cursor:pointer;transition:all .15s;font-family:inherit}',
      '.rl-profile-btn:active{transform:scale(.97)}',
      '.rl-profile-btn.primary{background:var(--cyan,#33d2e3);color:#0a0c13;border-color:transparent}',
      '.rl-profile-btn.primary:hover{filter:brightness(1.08)}',
      '.rl-profile-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}',

      /* Messages */
      '.rl-profile-msg{font-size:12px;margin-top:10px;display:none;padding:8px 11px;border-radius:9px;font-weight:600}',
      '.rl-profile-msg.show{display:block}',
      '.rl-profile-msg.ok{color:var(--green,#35d488);background:rgba(53,212,136,.12);border:1px solid rgba(53,212,136,.3)}',
      '.rl-profile-msg.err{color:var(--red,#f2685f);background:rgba(242,104,95,.12);border:1px solid rgba(242,104,95,.3)}',

      /* Language */
      '.rl-profile-lang{display:flex;gap:8px}',
      '.rl-profile-lang button{flex:1;padding:12px 10px;border-radius:11px;border:1px solid var(--border,#1e2636);background:var(--bg-1,#0d1117);color:var(--text-2,#a4acc0);font-weight:700;cursor:pointer;font-size:13px;transition:all .15s;font-family:inherit}',
      '.rl-profile-lang button.active{border-color:var(--cyan,#33d2e3);background:rgba(51,210,227,.14);color:var(--cyan,#33d2e3)}',
      '.rl-profile-lang button:hover:not(.active){border-color:var(--border,#1e2636);color:var(--text,#eef1f7)}',
      '.rl-profile-hint{font-size:11px;color:var(--text-3,#6b7590);margin:10px 0 0;line-height:1.4}',

      /* Lang toggle global (headers) */
      '.rl-lang-toggle{display:inline-flex;align-items:center;border:1px solid var(--border,#1e2636);border-radius:10px;overflow:hidden;height:36px}',
      '.rl-lang-toggle button{border:none;background:transparent;color:var(--text-2,#a4acc0);padding:0 10px;height:100%;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;opacity:.65;font-family:inherit}',
      '.rl-lang-toggle button.active{opacity:1;background:rgba(51,210,227,.18);color:var(--cyan,#33d2e3)}',
      '.rl-lang-toggle button:hover{opacity:1}',
      '@media(max-width:420px){.rl-lang-toggle button{padding:0 8px;font-size:10px}.rl-lang-toggle{height:34px}}'
    ].join('');
    document.head.appendChild(css);
  }

  var overlay = null;
  var userCache = null;

  function fmtDate(s) {
    if (!s) return '—';
    try {
      var d = new Date(s.replace(' ', 'T') + (s.indexOf('Z') >= 0 ? '' : 'Z'));
      if (isNaN(d.getTime())) d = new Date(s);
      return d.toLocaleString(global.RangeLabI18n ? global.RangeLabI18n.getLang() : 'en', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return s; }
  }

  function initialFromUser(user) {
    var name = (user.display_name || user.username || '?').trim();
    return name.charAt(0).toUpperCase();
  }

  function buildModal() {
    ensureStyles();
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'rl-profile-overlay';
    overlay.id = 'rlProfileOverlay';
    overlay.innerHTML = [
      '<div class="rl-profile-modal" role="dialog" aria-modal="true" aria-labelledby="rlProfileTitle">',
      '  <div class="rl-profile-head">',
      '    <div class="rl-profile-avatar" id="rlProfileAvatar">?</div>',
      '    <div class="rl-profile-head-text">',
      '      <h2 id="rlProfileTitle" data-i18n="profile.title">Mi perfil</h2>',
      '      <div class="sub" id="rlProfileSub" data-i18n="profile.subtitle">Account, membership and data</div>',
      '    </div>',
      '    <button type="button" class="rl-profile-close" id="rlProfileClose" aria-label="Close">✕</button>',
      '  </div>',
      '  <div class="rl-profile-body" id="rlProfileBody"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.getElementById('rlProfileClose').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('show')) close();
    });
    return overlay;
  }

  function renderBody(user, summary) {
    var body = document.getElementById('rlProfileBody');
    if (!body) return;

    var avatar = document.getElementById('rlProfileAvatar');
    if (avatar) avatar.textContent = initialFromUser(user);
    var titleEl = document.getElementById('rlProfileTitle');
    if (titleEl) titleEl.textContent = t('profile.title');
    var sub = document.getElementById('rlProfileSub');
    if (sub) sub.textContent = '@' + (user.username || '');

    var tools = user.allowed_tools || [];
    var allTools = ['equity', 'preflop', 'tracker', 'feltlab', 'range-analyzer', 'mtt-exploiter'];
    var toolLabels = {
      equity: t('tool.equity'),
      preflop: t('tool.preflop'),
      tracker: t('tool.tracker'),
      feltlab: t('tool.feltlab'),
      'range-analyzer': t('tool.range-analyzer'),
      'mtt-exploiter': t('tool.mtt-exploiter')
    };
    var toolsHtml = allTools.map(function (id) {
      var on = user.is_admin || tools.indexOf(id) >= 0;
      return '<span class="rl-profile-tool' + (on ? ' on' : '') + '">' + (toolLabels[id] || id) + '</span>';
    }).join('');

    var s = summary || {};
    var dataItems = [
      { key: 'profile.dataEquity', num: s.equity_sessions || 0 },
      { key: 'profile.dataPreflop', num: s.preflop_tables || 0 },
      { key: 'profile.dataTournaments', num: s.tournaments || 0 },
      { key: 'profile.dataTransactions', num: s.transactions || 0 },
      { key: 'profile.dataHands', num: s.hands || 0 },
      { key: 'profile.dataNotes', num: s.hand_notes || 0 },
      { key: 'profile.dataFavorites', num: s.hand_favorites || 0 }
    ];
    var dataGrid = dataItems.map(function (it) {
      return '<div class="rl-profile-data-item"><div class="num">' + it.num + '</div><div class="lbl">' + t(it.key) + '</div></div>';
    }).join('');

    var lang = (global.RangeLabI18n && global.RangeLabI18n.getLang()) || 'en';

    body.innerHTML = [
      /* Account */
      '<div class="rl-profile-sec">',
      '  <div class="rl-profile-sec-title" data-i18n="profile.sectionAccount">' + t('profile.sectionAccount') + '</div>',
      '  <div class="rl-profile-row"><span class="label" data-i18n="profile.username">' + t('profile.username') + '</span><span class="value" id="pfUsername">' + escapeHtml(user.username) + '</span></div>',
      '  <div class="rl-profile-row"><span class="label" data-i18n="profile.displayName">' + t('profile.displayName') + '</span><span class="value" id="pfDisplay">' + escapeHtml(user.display_name) + '</span></div>',
      '  <div class="rl-profile-row"><span class="label" data-i18n="profile.role">' + t('profile.role') + '</span><span class="value"><span class="rl-profile-badge' + (user.is_admin ? ' admin' : '') + '">' + (user.is_admin ? t('profile.roleAdmin') : t('profile.roleUser')) + '</span></span></div>',
      '  <div class="rl-profile-row"><span class="label" data-i18n="profile.created">' + t('profile.created') + '</span><span class="value">' + fmtDate(user.created_at) + '</span></div>',
      '  <div class="rl-profile-row"><span class="label" data-i18n="profile.lastLogin">' + t('profile.lastLogin') + '</span><span class="value">' + fmtDate(user.last_login) + '</span></div>',
      '</div>',

      /* Membership */
      '<div class="rl-profile-sec">',
      '  <div class="rl-profile-sec-title amber" data-i18n="profile.sectionMembership">' + t('profile.sectionMembership') + '</div>',
      '  <div style="margin-top:12px"><div class="label" style="font-size:11px;opacity:.6;margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:.04em" data-i18n="profile.toolsAccess">' + t('profile.toolsAccess') + '</div>',
      '  <div class="rl-profile-tools">' + toolsHtml + '</div></div>',
      '</div>',

      /* Data summary grid */
      '<div class="rl-profile-sec">',
      '  <div class="rl-profile-sec-title green" data-i18n="profile.sectionData">' + t('profile.sectionData') + '</div>',
      '  <div class="rl-profile-data-grid">' + dataGrid + '</div>',
      '</div>',

      /* Language */
      '<div class="rl-profile-sec">',
      '  <div class="rl-profile-sec-title purple" data-i18n="profile.sectionLang">' + t('profile.sectionLang') + '</div>',
      '  <div class="rl-profile-lang">',
      '    <button type="button" data-lang-set="es" class="' + (lang === 'es' ? 'active' : '') + '">ES · Español</button>',
      '    <button type="button" data-lang-set="en" class="' + (lang === 'en' ? 'active' : '') + '">EN · English</button>',
      '  </div>',
      '  <p class="rl-profile-hint" data-i18n="profile.langHint">' + t('profile.langHint') + '</p>',
      '</div>',

      /* Edit profile */
      '<div class="rl-profile-sec">',
      '  <div class="rl-profile-sec-title" data-i18n="profile.sectionEdit">' + t('profile.sectionEdit', t('profile.changeDisplay')) + '</div>',
      '  <div class="rl-profile-field"><label for="pfEditDisplay" data-i18n="profile.displayName">' + t('profile.displayName') + '</label>',
      '  <input id="pfEditDisplay" type="text" maxlength="80" value="' + escapeAttr(user.display_name || '') + '" placeholder="' + escapeAttr(t('login.displayNamePh')) + '"></div>',
      '  <div class="rl-profile-field"><label for="pfEditUsername" data-i18n="profile.username">' + t('profile.username') + '</label>',
      '  <input id="pfEditUsername" type="text" minlength="3" maxlength="40" value="' + escapeAttr(user.username || '') + '" placeholder="' + escapeAttr(t('login.usernamePh')) + '"></div>',
      '  <div class="rl-profile-actions"><button type="button" class="rl-profile-btn primary" id="pfSaveProfile" data-i18n="profile.saveProfile">' + t('profile.saveProfile') + '</button></div>',
      '  <div class="rl-profile-msg" id="pfProfileMsg"></div>',
      '</div>',

      /* Security */
      '<div class="rl-profile-sec">',
      '  <div class="rl-profile-sec-title red" data-i18n="profile.sectionSecurity">' + t('profile.sectionSecurity') + '</div>',
      '  <div class="rl-profile-field"><label for="pfOldPwd" data-i18n="profile.oldPassword">' + t('profile.oldPassword') + '</label>',
      '  <input id="pfOldPwd" type="password" autocomplete="current-password"></div>',
      '  <div class="rl-profile-field"><label for="pfNewPwd" data-i18n="profile.newPassword">' + t('profile.newPassword') + '</label>',
      '  <input id="pfNewPwd" type="password" autocomplete="new-password"></div>',
      '  <div class="rl-profile-field"><label for="pfNewPwd2" data-i18n="profile.confirmPassword">' + t('profile.confirmPassword') + '</label>',
      '  <input id="pfNewPwd2" type="password" autocomplete="new-password"></div>',
      '  <div class="rl-profile-actions"><button type="button" class="rl-profile-btn primary" id="pfSavePwd" data-i18n="profile.changePassword">' + t('profile.changePassword') + '</button></div>',
      '  <div class="rl-profile-msg" id="pfPwdMsg"></div>',
      '</div>'
    ].join('');

    if (global.RangeLabI18n) {
      global.RangeLabI18n.wireLangButtons(body);
      global.RangeLabI18n.applyDom(body);
    }

    document.getElementById('pfSaveProfile').addEventListener('click', saveProfile);
    document.getElementById('pfSavePwd').addEventListener('click', savePassword);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

  function showMsg(id, text, ok) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'rl-profile-msg show ' + (ok ? 'ok' : 'err');
  }

  async function saveProfile() {
    var display_name = (document.getElementById('pfEditDisplay').value || '').trim();
    var username = (document.getElementById('pfEditUsername').value || '').trim().toLowerCase();
    var btn = document.getElementById('pfSaveProfile');
    btn.disabled = true;
    try {
      var res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ display_name: display_name, username: username })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Error');
      userCache = data.user;
      document.getElementById('pfUsername').textContent = data.user.username;
      document.getElementById('pfDisplay').textContent = data.user.display_name;
      var avatar = document.getElementById('rlProfileAvatar');
      if (avatar) avatar.textContent = initialFromUser(data.user);
      var sub = document.getElementById('rlProfileSub');
      if (sub) sub.textContent = '@' + data.user.username;
      var chip = document.querySelector('.user-chip .user-name, .user-chip .uname, .user-name');
      if (chip) chip.textContent = data.user.display_name;
      showMsg('pfProfileMsg', t('profile.profileSaved'), true);
      try {
        global.dispatchEvent(new CustomEvent('rangelab:user', { detail: { user: data.user } }));
      } catch (e) {}
    } catch (err) {
      showMsg('pfProfileMsg', err.message || t('common.error'), false);
    } finally {
      btn.disabled = false;
    }
  }

  async function savePassword() {
    var oldP = document.getElementById('pfOldPwd').value;
    var newP = document.getElementById('pfNewPwd').value;
    var newP2 = document.getElementById('pfNewPwd2').value;
    if (!oldP || !newP || !newP2) {
      showMsg('pfPwdMsg', t('profile.fillAll'), false);
      return;
    }
    if (newP.length < 4) {
      showMsg('pfPwdMsg', t('profile.pwdMin'), false);
      return;
    }
    if (newP !== newP2) {
      showMsg('pfPwdMsg', t('profile.pwdMismatch'), false);
      return;
    }
    var btn = document.getElementById('pfSavePwd');
    btn.disabled = true;
    try {
      var res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ old_password: oldP, new_password: newP })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Error');
      document.getElementById('pfOldPwd').value = '';
      document.getElementById('pfNewPwd').value = '';
      document.getElementById('pfNewPwd2').value = '';
      showMsg('pfPwdMsg', t('profile.pwdSaved'), true);
    } catch (err) {
      showMsg('pfPwdMsg', err.message || t('common.error'), false);
    } finally {
      btn.disabled = false;
    }
  }

  async function open(user) {
    buildModal();
    userCache = user || userCache;
    if (!userCache) {
      try {
        var me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
        if (me && me.authenticated) userCache = me.user;
      } catch (e) {}
    }
    if (!userCache) return;
    var summary = {};
    try {
      var ds = await fetch('/api/auth/data-summary', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
      if (ds && ds.summary) summary = ds.summary;
    } catch (e) {}
    renderBody(userCache, summary);
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  function injectLangToggle(container) {
    if (!container) return;
    ensureStyles();
    if (container.querySelector('.rl-lang-toggle')) return;
    var wrap = document.createElement('div');
    wrap.className = 'rl-lang-toggle';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', t('common.language'));
    wrap.innerHTML = '<button type="button" data-lang-set="es" title="Español">ES</button><button type="button" data-lang-set="en" title="English">EN</button>';
    container.insertBefore(wrap, container.firstChild);
    if (global.RangeLabI18n) global.RangeLabI18n.wireLangButtons(wrap);
    if (global.RangeLabI18n) global.RangeLabI18n.applyDom(wrap);
  }

  function wireUserChip(chip, user) {
    if (!chip || chip.dataset.rlProfileWired) return;
    chip.dataset.rlProfileWired = '1';
    chip.style.cursor = 'pointer';
    chip.setAttribute('title', t('profile.openProfile'));
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.addEventListener('click', function () { open(user); });
    chip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(user); }
    });
  }

  global.RangeLabProfile = {
    open: open,
    close: close,
    injectLangToggle: injectLangToggle,
    wireUserChip: wireUserChip,
    ensureStyles: ensureStyles
  };
})(typeof window !== 'undefined' ? window : this);
