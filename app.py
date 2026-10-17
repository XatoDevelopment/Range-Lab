import os
import sys
import json
import sqlite3
import secrets
import hmac
import time as _time
from datetime import datetime
from functools import wraps
from flask import (
    Flask, render_template, request, jsonify, g,
    session, redirect, url_for, send_from_directory, abort, send_file, after_this_request
)
from werkzeug.security import generate_password_hash, check_password_hash


if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr:
    sys.stderr.reconfigure(encoding='utf-8')
    
# ═══════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
# DB path configurable (Docker volume / custom name)
_db_env = os.environ.get('RANGELAB_DB_PATH', '').strip()
DB_PATH = _db_env if _db_env else os.path.join(BASE_DIR, 'data', 'rangelab.db')
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
DATA_DIR = os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else os.path.join(BASE_DIR, 'data')
SECRET_KEY_FILE = os.path.join(BASE_DIR, '.secret_key')

def get_secret_key():
    """Genera o lee la clave secreta persistente (env > archivo > data dir)."""
    env_key = os.environ.get('RANGELAB_SECRET_KEY', '').strip()
    if env_key:
        return env_key
    candidates = [SECRET_KEY_FILE, os.path.join(DATA_DIR, '.secret_key')]
    for path in candidates:
        if os.path.exists(path):
            with open(path, 'r') as f:
                k = f.read().strip()
                if k:
                    return k
    key = secrets.token_hex(32)
    # Prefer data dir for Docker volumes
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        target = os.path.join(DATA_DIR, '.secret_key')
        with open(target, 'w') as f:
            f.write(key)
    except Exception:
        with open(SECRET_KEY_FILE, 'w') as f:
            f.write(key)
    return key

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, 'static'), static_url_path='/static')
app.secret_key = get_secret_key()
# Detrás de un proxy inverso (Nginx, Caddy…) activa RANGELAB_TRUST_PROXY=1
# para que el límite de intentos y los logs usen la IP real del cliente.
if os.environ.get('RANGELAB_TRUST_PROXY', '').strip() in ('1', 'true', 'yes'):
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024  # 64 MB
# Session / cookie hardening (HTTPS recommended in production)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 60 * 60 * 24 * 14  # 14 days
# Only enable Secure flag when behind HTTPS (set RANGELAB_HTTPS=1)
if os.environ.get('RANGELAB_HTTPS', '').strip() in ('1', 'true', 'yes'):
    app.config['SESSION_COOKIE_SECURE'] = True

APP_VERSION = '1.4.1'

# ═══════════════════════════════════════════════════════════════
# PERMISOS / HERRAMIENTAS
# ═══════════════════════════════════════════════════════════════
ALL_TOOLS = [
    'equity',           # Equity Lab
    'preflop',          # Preflop Lab
    'tracker',          # Bankroll Lab
    'feltlab',          # Hand Lab
    'range-analyzer',   # Range Lab
    'mtt-exploiter',    # MTT Exploiter
    'ailab',            # AI Table — jugar vs IA (Hand Lab)
    'tournament-lab',   # Tournament Lab — calculadora de torneos
]
# Plan free por defecto (sin código de invitación)
FREE_TOOLS = ['equity', 'mtt-exploiter', 'ailab', 'tournament-lab']

TOOL_LABELS = {
    'equity': 'Equity Lab',
    'preflop': 'Preflop Lab',
    'tracker': 'Bankroll Lab',
    'feltlab': 'Hand Lab',
    'range-analyzer': 'Range Lab',
    'mtt-exploiter': 'MTT Exploiter',
    'ailab': 'AI Table',
    'tournament-lab': 'Tournament Lab',
}


DEFAULT_SITE_SETTINGS = {
    'setup_completed': '0',
    'site_name': 'RangeLab',
    'site_tagline': 'Poker analysis suite',
    'brand_name': 'RangeSoft®',
    'footer_text': '',  # empty → auto: "Creado por {brand} · © {year}"
    'contact_email': '',
    'default_lang': 'en',
    'registration_open': '1',
}

# ═══════════════════════════════════════════════════════════════
# BASE DE DATOS
# ═══════════════════════════════════════════════════════════════
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
        g.db.execute('PRAGMA journal_mode = WAL')
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    """Crea todas las tablas si no existen."""
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript('''
    -- ═══ Usuarios ═══
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        role TEXT NOT NULL DEFAULT 'user',           -- 'admin' | 'user'
        allowed_tools TEXT NOT NULL DEFAULT '[]',   -- JSON list of tool ids
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
    );

    -- ═══ Uso de herramientas (analytics) ═══
    CREATE TABLE IF NOT EXISTS tool_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tool_id TEXT NOT NULL,
        path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tool_usage_user ON tool_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON tool_usage(tool_id);
    CREATE INDEX IF NOT EXISTS idx_tool_usage_created ON tool_usage(created_at);

    -- ═══ EQUITY CALCULATOR ═══
    CREATE TABLE IF NOT EXISTS equity_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        players_json TEXT NOT NULL,      -- jugadores + cartas/rangos
        board_json TEXT,                 -- cartas del board
        result_json TEXT,                -- último cálculo
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_equity_user ON equity_sessions(user_id);

    -- ═══ PREFLOP TRAINER ═══
    CREATE TABLE IF NOT EXISTS preflop_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        hero TEXT NOT NULL,
        vs TEXT,
        stack INTEGER NOT NULL,
        situation TEXT NOT NULL,
        sequence TEXT,
        raise_size TEXT,
        range_json TEXT NOT NULL,        -- matriz 13x13 con frecuencias
        table_size INTEGER NOT NULL DEFAULT 6,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, hero, vs, stack, situation, table_size),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_preflop_user ON preflop_tables(user_id);

    -- ═══ POKER TRACKER ═══
    CREATE TABLE IF NOT EXISTS tracker_state (
        user_id INTEGER PRIMARY KEY,
        bankroll REAL DEFAULT 0,
        initial_bankroll REAL DEFAULT 0,
        theme TEXT DEFAULT 'dark',
        welcome_shown INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        cost REAL NOT NULL,
        base_cost REAL,
        rebuys INTEGER DEFAULT 0,
        win REAL DEFAULT 0,
        position TEXT,
        type TEXT,
        speed TEXT,
        site TEXT,
        players INTEGER DEFAULT 0,
        date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tournaments_user_date ON tournaments(user_id, date);

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,              -- 'deposit' | 'withdraw'
        amount REAL NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

    -- ═══ FELTLAB HAND LAB ═══
    CREATE TABLE IF NOT EXISTS hands (
        id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        site TEXT,
        tournament TEXT,
        tournament_name TEXT,
        level INTEGER,
        blinds TEXT,
        date TEXT,
        table_name TEXT,
        button INTEGER,
        hero TEXT,
        hero_cards TEXT,
        hero_net REAL DEFAULT 0,
        hero_net_bb REAL DEFAULT 0,
        hero_folded INTEGER DEFAULT 0,
        hero_showdown INTEGER DEFAULT 0,
        winner TEXT,
        pot_total REAL DEFAULT 0,
        bb REAL DEFAULT 1,
        board TEXT,
        players_json TEXT,
        actions_json TEXT,
        source_file TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_hands_user ON hands(user_id);
    CREATE INDEX IF NOT EXISTS idx_hands_tournament ON hands(user_id, tournament);
    CREATE INDEX IF NOT EXISTS idx_hands_site ON hands(site);
    CREATE INDEX IF NOT EXISTS idx_hands_id_only ON hands(id);

    CREATE TABLE IF NOT EXISTS hand_notes (
        hand_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        text TEXT,
        tags TEXT,                       -- JSON array
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (hand_id, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hand_favorites (
        hand_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (hand_id, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feltlab_config (
        user_id INTEGER PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feltlab_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        hands_count INTEGER DEFAULT 0,
        tournaments TEXT,
        site TEXT,
        loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hand_library_packs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        site_label TEXT DEFAULT 'mixed',
        hand_count INTEGER DEFAULT 0,
        tourney_count INTEGER DEFAULT 0,
        tournament_types TEXT DEFAULT '[]',
        is_public INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS hand_library_pack_hands (
        pack_id INTEGER NOT NULL,
        hand_id TEXT NOT NULL,
        hand_json TEXT NOT NULL,
        PRIMARY KEY (pack_id, hand_id),
        FOREIGN KEY (pack_id) REFERENCES hand_library_packs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_library_public ON hand_library_packs(is_public, created_at DESC);

    -- ═══ Configuración del sitio (wizard + admin) ═══
    CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')
    db.commit()
    # Seed defaults if empty
    try:
        n = db.execute('SELECT COUNT(*) AS c FROM site_settings').fetchone()[0]
        if n == 0:
            for k, v in DEFAULT_SITE_SETTINGS.items():
                db.execute(
                    'INSERT INTO site_settings (key, value) VALUES (?, ?)',
                    (k, v if isinstance(v, str) else json.dumps(v))
                )
            db.commit()
    except Exception as e:
        print('seed site_settings:', e)
    # Migración: table_size en preflop_tables
    try:
        cols = [r[1] for r in db.execute('PRAGMA table_info(preflop_tables)').fetchall()]
        if cols and 'table_size' not in cols:
            db.execute('ALTER TABLE preflop_tables ADD COLUMN table_size INTEGER NOT NULL DEFAULT 6')
            db.commit()
    except Exception as e:
        print('migration table_size:', e)

    # Migración: columnas de roles / permisos en users
    try:
        ucols = [r[1] for r in db.execute('PRAGMA table_info(users)').fetchall()]
        if ucols:
            if 'role' not in ucols:
                db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
            if 'allowed_tools' not in ucols:
                db.execute("ALTER TABLE users ADD COLUMN allowed_tools TEXT NOT NULL DEFAULT '[]'")
            if 'preferred_lang' not in ucols:
                db.execute("ALTER TABLE users ADD COLUMN preferred_lang TEXT DEFAULT 'en'")
            db.commit()
            # Primer usuario existente → admin con todo
            first = db.execute('SELECT id, role FROM users ORDER BY id ASC LIMIT 1').fetchone()
            if first and first['role'] != 'admin':
                db.execute(
                    "UPDATE users SET role = 'admin', allowed_tools = ? WHERE id = ?",
                    (json.dumps(ALL_TOOLS), first['id'])
                )
            # Usuarios sin herramientas definidas → plan free
            db.execute(
                "UPDATE users SET allowed_tools = ? "
                "WHERE role != 'admin' AND (allowed_tools IS NULL OR allowed_tools = '' OR allowed_tools = '[]')",
                (json.dumps(FREE_TOOLS),)
            )
            db.commit()
    except Exception as e:
        print('migration users roles:', e)

    # Migración: site (sala) en tournaments
    try:
        tcols = [r[1] for r in db.execute('PRAGMA table_info(tournaments)').fetchall()]
        if tcols and 'site' not in tcols:
            db.execute('ALTER TABLE tournaments ADD COLUMN site TEXT')
            db.commit()
    except Exception as e:
        print('migration tournaments site:', e)

    # Migración: notes en transactions (depósitos / retiros)
    try:
        txcols = [r[1] for r in db.execute('PRAGMA table_info(transactions)').fetchall()]
        if txcols and 'notes' not in txcols:
            db.execute("ALTER TABLE transactions ADD COLUMN notes TEXT DEFAULT ''")
            db.commit()
    except Exception as e:
        print('migration transactions notes:', e)

    # Si ya hay usuarios y setup no marcado → marcar completado (upgrade)
    try:
        sc = db.execute("SELECT value FROM site_settings WHERE key = 'setup_completed'").fetchone()
        uc = db.execute('SELECT COUNT(*) AS c FROM users').fetchone()[0]
        if uc > 0 and (not sc or str(sc[0]) not in ('1', 'true', 'yes')):
            db.execute(
                "INSERT INTO site_settings (key, value) VALUES ('setup_completed', '1') "
                "ON CONFLICT(key) DO UPDATE SET value = '1'"
            )
            db.commit()
    except Exception as e:
        print('migration setup_completed:', e)
    db.close()

# ═══════════════════════════════════════════════════════════════
# SITE SETTINGS
# ═══════════════════════════════════════════════════════════════
_site_cache = {'ts': 0, 'data': None}

def get_site_settings(force=False):
    """Lee configuración del sitio (cache corta en memoria)."""
    import time
    now = time.time()
    if not force and _site_cache['data'] is not None and (now - _site_cache['ts']) < 5:
        return dict(_site_cache['data'])
    out = dict(DEFAULT_SITE_SETTINGS)
    try:
        db = get_db()
        rows = db.execute('SELECT key, value FROM site_settings').fetchall()
        for r in rows:
            out[r['key']] = r['value']
    except Exception:
        # Durante init o sin app context
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute('SELECT key, value FROM site_settings').fetchall()
            for r in rows:
                out[r['key']] = r['value']
            conn.close()
        except Exception:
            pass
    _site_cache['data'] = out
    _site_cache['ts'] = now
    return dict(out)

def set_site_settings(updates: dict):
    db = get_db()
    for k, v in updates.items():
        if v is None:
            continue
        val = v if isinstance(v, str) else json.dumps(v)
        db.execute(
            '''INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP''',
            (k, val)
        )
    db.commit()
    _site_cache['data'] = None  # invalidate

def is_setup_completed():
    s = get_site_settings()
    return str(s.get('setup_completed', '0')) in ('1', 'true', 'yes')


def site_public_dict():
    """Datos públicos para templates / JS (sin secretos)."""
    s = get_site_settings()
    brand = (s.get('brand_name') or 'RangeSoft®').strip() or 'RangeSoft®'
    year = str(datetime.now().year)
    footer = (s.get('footer_text') or '').strip()
    if not footer:
        footer = f'Created by {brand} · © {year}'
    return {
        'site_name': 'RangeLab',  # nombre fijo: la herramienta siempre se llama RangeLab
        'site_tagline': (s.get('site_tagline') or '').strip(),
        'brand_name': brand,
        'footer_text': footer,
        'contact_email': (s.get('contact_email') or '').strip(),
        'default_lang': (s.get('default_lang') or 'en').strip() or 'en',
        'registration_open': str(s.get('registration_open', '1')) in ('1', 'true', 'yes'),
        'setup_completed': is_setup_completed(),
        'all_tools': list(ALL_TOOLS),
        'tool_labels': dict(TOOL_LABELS),
    }

@app.context_processor
def inject_site():
    try:
        return {'site': site_public_dict()}
    except Exception:
        return {'site': {
            'site_name': 'RangeLab', 'brand_name': 'RangeSoft®',
            'footer_text': f'Created by RangeSoft® · © {datetime.now().year}',
            'contact_email': '', 'setup_completed': True,
            'registration_open': True,
            'site_tagline': '', 'default_lang': 'en',
            'all_tools': list(ALL_TOOLS), 'tool_labels': dict(TOOL_LABELS),
        }}

# ═══════════════════════════════════════════════════════════════
# SEGURIDAD Y DATOS DEL DESARROLLADOR
# ═══════════════════════════════════════════════════════════════
DEVELOPER_INFO = {
    'name': 'XatoDev',
    'email': 'xatodev.contacto@gmail.com',
}

@app.context_processor
def inject_developer():
    return {'developer': DEVELOPER_INFO}

def _safe_err(e):
    """Registra el error en el servidor y devuelve un mensaje genérico al cliente."""
    app.logger.error('Error interno: %r', e)
    return 'Error interno del servidor'

# --- Token de instalación: evita que un desconocido se adueñe del sitio nuevo ---
SETUP_TOKEN_FILE = os.path.join(DATA_DIR, 'setup_token.txt')

def get_setup_token():
    if is_setup_completed():
        return None
    try:
        with open(SETUP_TOKEN_FILE, 'r') as f:
            t = f.read().strip()
            if t:
                return t
    except FileNotFoundError:
        pass
    t = secrets.token_urlsafe(9)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SETUP_TOKEN_FILE, 'w') as f:
        f.write(t)
    return t

def _announce_setup_token():
    if is_setup_completed():
        return
    t = get_setup_token()
    print('═══════════════════════════════════════════')
    print('  RangeLab · installation pending')
    print(f'  Installation token: {t}')
    print('  Enter it at /setup to create the administrator.')
    print('═══════════════════════════════════════════')

def _consume_setup_token():
    try:
        os.remove(SETUP_TOKEN_FILE)
    except OSError:
        pass

# --- Límite de intentos de inicio de sesión (fuerza bruta) ---
_LOGIN_FAILS = {}
_LOGIN_WINDOW = 15 * 60
_LOGIN_MAX_FAILS = 8

def _login_key(username):
    return f"{request.remote_addr or ''}|{username}"

def _login_blocked(key):
    now = _time.time()
    recent = [t for t in _LOGIN_FAILS.get(key, []) if now - t < _LOGIN_WINDOW]
    _LOGIN_FAILS[key] = recent
    return len(recent) >= _LOGIN_MAX_FAILS

def _login_fail(key):
    _LOGIN_FAILS.setdefault(key, []).append(_time.time())
    if len(_LOGIN_FAILS) > 5000:  # evitar crecimiento sin límite
        _LOGIN_FAILS.clear()

@app.after_request
def _security_headers(response):
    h = response.headers
    h.setdefault('X-Content-Type-Options', 'nosniff')
    h.setdefault('X-Frame-Options', 'SAMEORIGIN')
    h.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    h.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    h.setdefault('Content-Security-Policy',
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self' data:; "
        "connect-src 'self'; worker-src 'self'; manifest-src 'self'; "
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'")
    if (request.path or '').startswith('/api/'):
        h['Cache-Control'] = 'no-store'
    if os.environ.get('RANGELAB_HTTPS', '').strip() in ('1', 'true', 'yes'):
        h.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    return response

@app.before_request
def _guard_setup():
    """Si no hay instalación, solo permitir setup, health y static."""
    if is_setup_completed():
        return None
    path = request.path or ''
    if path.startswith('/static') or path in (
        '/setup', '/api/setup/status', '/api/setup/complete',
        '/api/health', '/favicon.ico', '/manifest.webmanifest', '/sw.js'
    ):
        return None
    if path.startswith('/api/'):
        return jsonify({'error': 'System not installed', 'setup_required': True}), 503
    return redirect(url_for('setup_page'))

# ═══════════════════════════════════════════════════════════════
# AUTH — Decoradores y helpers
# ═══════════════════════════════════════════════════════════════
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Not authenticated'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Not authenticated'}), 401
            return redirect(url_for('login_page'))
        db = get_db()
        user = db.execute('SELECT role FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        if not user or user['role'] != 'admin':
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Administrator access required'}), 403
            return abort(403)
        return f(*args, **kwargs)
    return decorated

def current_user_id():
    return session.get('user_id')

def _parse_tools(raw=None):
    """Acceso libre: todas las herramientas para cualquier usuario."""
    return list(ALL_TOOLS)
    try:
        tools = json.loads(raw) if isinstance(raw, str) else list(raw)
        return [t for t in tools if t in ALL_TOOLS]
    except Exception:
        return list(fallback)

def get_user_row(user_id=None):
    uid = user_id if user_id is not None else current_user_id()
    if not uid:
        return None
    return get_db().execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()

def user_has_tool(tool_id, user_row=None):
    row = user_row or get_user_row()
    if not row:
        return False
    return tool_id in ALL_TOOLS

def log_tool_usage(tool_id, user_id=None):
    """Registra un acceso a herramienta (best-effort, no falla la request)."""
    try:
        uid = user_id or current_user_id()
        if not uid or tool_id not in ALL_TOOLS:
            return
        db = get_db()
        db.execute(
            'INSERT INTO tool_usage (user_id, tool_id, path) VALUES (?, ?, ?)',
            (uid, tool_id, (request.path or '')[:200])
        )
        db.commit()
    except Exception:
        pass

def tool_required(tool_id):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'user_id' not in session:
                if request.is_json or request.path.startswith('/api/'):
                    return jsonify({'error': 'Not authenticated'}), 401
                return redirect(url_for('login_page'))
            row = get_user_row()
            if not row or not user_has_tool(tool_id, row):
                if request.is_json or request.path.startswith('/api/'):
                    return jsonify({'error': 'You do not have access to this tool'}), 403
                return redirect(url_for('portal'))
            log_tool_usage(tool_id, row['id'])
            return f(*args, **kwargs)
        return decorated
    return decorator

def user_json(row):
    tools = list(ALL_TOOLS)
    keys = row.keys() if hasattr(row, 'keys') else []
    return {
        'id': row['id'],
        'username': row['username'],
        'display_name': row['display_name'] or row['username'],
        'role': row['role'] if 'role' in keys else 'user',
        'allowed_tools': tools,
        'preferred_lang': (row['preferred_lang'] if 'preferred_lang' in keys else 'en') or 'en',
        'created_at': row['created_at'],
        'last_login': row['last_login'],
        'is_admin': (row['role'] if 'role' in keys else 'user') == 'admin',
    }

# ═══════════════════════════════════════════════════════════════
# RUTAS DE AUTENTICACIÓN
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# SETUP WIZARD (solo primera instalación)
# ═══════════════════════════════════════════════════════════════
@app.route('/setup')
def setup_page():
    if is_setup_completed():
        return redirect(url_for('login_page'))
    return render_template('setup.html')


@app.route('/api/setup/status')
def api_setup_status():
    return jsonify({'setup_completed': is_setup_completed()})


@app.route('/api/setup/complete', methods=['POST'])
def api_setup_complete():
    """Asistente de instalación: configura el sitio y crea el admin (requiere token)."""
    if is_setup_completed():
        return jsonify({'error': 'Installation is already complete'}), 409

    data = request.get_json() or {}
    expected = get_setup_token()
    given = str(data.get('setup_token') or '').strip()
    if not expected or not hmac.compare_digest(given, expected):
        return jsonify({'error': 'Invalid installation token. Copy the token shown in the server console.'}), 403

    site_name = 'RangeLab'  # fijo
    site_tagline = (data.get('site_tagline') or '').strip()[:160]
    brand_name = (data.get('brand_name') or 'RangeSoft').strip()[:80] or 'RangeSoft'
    footer_text = (data.get('footer_text') or '').strip()[:200]
    contact_email = (data.get('contact_email') or '').strip()[:120]
    default_lang = (data.get('default_lang') or 'en').strip().lower()
    if default_lang not in ('es', 'en'):
        default_lang = 'en'
    registration_open = '1' if data.get('registration_open', True) else '0'

    admin_user = (data.get('admin_username') or '').strip().lower()
    admin_pass = data.get('admin_password') or ''
    admin_display = (data.get('admin_display_name') or admin_user).strip()[:80]

    if not admin_user or len(admin_user) < 3:
        return jsonify({'error': 'Admin username: at least 3 characters'}), 400
    if not admin_user.replace('_', '').isalnum():
        return jsonify({'error': 'Username: letters, numbers and _ only'}), 400
    if not admin_pass or len(admin_pass) < 8:
        return jsonify({'error': 'Admin password: at least 8 characters'}), 400

    db = get_db()
    if db.execute('SELECT COUNT(*) AS c FROM users').fetchone()['c'] > 0:
        return jsonify({'error': 'Users already exist. Installation locked.'}), 409

    try:
        set_site_settings({
            'site_name': site_name,
            'site_tagline': site_tagline,
            'brand_name': brand_name,
            'footer_text': footer_text,
            'contact_email': contact_email,
            'default_lang': default_lang,
            'registration_open': registration_open,
            'setup_completed': '1',
        })
        cur = db.execute(
            "INSERT INTO users (username, password_hash, display_name, role, allowed_tools, preferred_lang) "
            "VALUES (?, ?, ?, 'admin', ?, ?)",
            (admin_user, generate_password_hash(admin_pass), admin_display,
             json.dumps(ALL_TOOLS), default_lang)
        )
        uid = cur.lastrowid
        db.execute('INSERT INTO tracker_state (user_id) VALUES (?)', (uid,))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already taken'}), 409
    except Exception as e:
        return jsonify({'error': _safe_err(e)}), 500

    _consume_setup_token()
    session.permanent = True
    session['user_id'] = uid
    session['username'] = admin_user
    return jsonify({
        'ok': True,
        'user': user_json(db.execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()),
        'site': site_public_dict(),
    })


@app.route('/api/site')
def api_site_public():
    return jsonify(site_public_dict())


@app.route('/api/admin/site', methods=['GET'])
@admin_required
def admin_site_get():
    s = get_site_settings(force=True)
    return jsonify({
        'settings': s,
        'public': site_public_dict(),
        'all_tools': list(ALL_TOOLS),
        'tool_labels': dict(TOOL_LABELS),
    })


@app.route('/api/admin/site', methods=['PUT'])
@admin_required
def admin_site_put():
    data = request.get_json() or {}
    allowed_keys = {
        'site_name', 'site_tagline', 'brand_name', 'footer_text',
        'contact_email', 'default_lang', 'registration_open',
    }
    updates = {}
    for k in allowed_keys:
        if k not in data:
            continue
        if k == 'site_name':  # el nombre de la herramienta es fijo
            continue
        v = data[k]
        if k == 'registration_open':
            v = '1' if v in (True, 1, '1', 'true', 'yes') else '0'
        elif k == 'default_lang':
            v = 'es' if str(v).lower() == 'es' else 'en'
        else:
            v = str(v).strip() if v is not None else ''
        updates[k] = v
    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400
    set_site_settings(updates)
    return jsonify({'ok': True, 'public': site_public_dict()})


@app.route('/login')
def login_page():
    if not is_setup_completed():
        return redirect(url_for('setup_page'))
    if 'user_id' in session:
        return redirect(url_for('portal'))
    return render_template('login.html')

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    if not is_setup_completed():
        return jsonify({'error': 'The system is not installed yet. Complete the setup wizard.'}), 403
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()[:40]
    password = (data.get('password') or '')[:256]
    display_name = (data.get('display_name') or username).strip()[:80]

    if not username or len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if not password or len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if not username.replace('_', '').isalnum():
        return jsonify({'error': 'Username can only contain letters, numbers and _'}), 400

    site = get_site_settings()
    if str(site.get('registration_open', '1')) not in ('1', 'true', 'yes'):
        return jsonify({'error': 'Public registration is closed.'}), 403

    db = get_db()
    existing_count = db.execute('SELECT COUNT(*) AS c FROM users').fetchone()['c']
    is_first = existing_count == 0
    role = 'admin' if is_first else 'user'
    allowed = list(ALL_TOOLS)

    try:
        cur = db.execute(
            'INSERT INTO users (username, password_hash, display_name, role, allowed_tools) VALUES (?, ?, ?, ?, ?)',
            (username, generate_password_hash(password), display_name, role, json.dumps(allowed))
        )
        user_id = cur.lastrowid
        db.execute('INSERT INTO tracker_state (user_id) VALUES (?)', (user_id,))
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        # Mismo mensaje y código que una validación cualquiera: no se revela si el usuario existe
        return jsonify({'error': 'Could not create the account. Try a different username.'}), 400

    session.permanent = True
    session['user_id'] = user_id
    session['username'] = username
    return jsonify({
        'ok': True,
        'user_id': user_id,
        'username': username,
        'role': role,
        'allowed_tools': allowed,
        'is_first_admin': is_first,
    })


@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()[:80]
    password = (data.get('password') or '')[:256]
    remember = bool(data.get('remember', True))
    key = _login_key(username)
    if _login_blocked(key):
        return jsonify({'error': 'Too many failed attempts. Wait 15 minutes.'}), 429

    db = get_db()
    user = db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if not user or not check_password_hash(user['password_hash'], password):
        _login_fail(key)
        return jsonify({'error': 'Incorrect username or password'}), 401
    _LOGIN_FAILS.pop(key, None)

    db.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', (user['id'],))
    db.commit()

    session.permanent = remember
    session['user_id'] = user['id']
    session['username'] = user['username']
    return jsonify({'ok': True, 'user': user_json(user)})

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'ok': True})

@app.route('/api/auth/me')
def api_me():
    if 'user_id' not in session:
        return jsonify({'authenticated': False}), 200
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    if not user:
        session.clear()
        return jsonify({'authenticated': False}), 200
    return jsonify({'authenticated': True, 'user': user_json(user)})


@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def api_change_password():
    data = request.get_json() or {}
    old_password = data.get('old_password') or ''
    new_password = data.get('new_password') or ''
    if not old_password or not new_password:
        return jsonify({'error': 'Fill in all fields'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (current_user_id(),)).fetchone()
    if not user or not check_password_hash(user['password_hash'], old_password):
        return jsonify({'error': 'Current password is incorrect'}), 401
    db.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        (generate_password_hash(new_password), user['id'])
    )
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/auth/profile', methods=['PUT'])
@login_required
def api_update_profile():
    """Actualizar display_name, username y/o preferred_lang."""
    data = request.get_json() or {}
    db = get_db()
    uid = current_user_id()
    user = db.execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    updates = []
    params = []

    if 'display_name' in data:
        dn = (data.get('display_name') or '').strip()[:80]
        if not dn:
            dn = user['username']
        updates.append('display_name = ?')
        params.append(dn)

    if 'username' in data:
        new_user = (data.get('username') or '').strip().lower()
        if not new_user or len(new_user) < 3:
            return jsonify({'error': 'Username must be at least 3 characters'}), 400
        if not new_user.replace('_', '').isalnum():
            return jsonify({'error': 'Only letters, numbers and underscores'}), 400
        if new_user != user['username']:
            exists = db.execute('SELECT id FROM users WHERE username = ? AND id != ?', (new_user, uid)).fetchone()
            if exists:
                return jsonify({'error': 'Username already taken'}), 409
            updates.append('username = ?')
            params.append(new_user)

    if 'preferred_lang' in data:
        lang = (data.get('preferred_lang') or 'es').strip().lower()
        if lang not in ('es', 'en'):
            return jsonify({'error': 'Unsupported language'}), 400
        updates.append('preferred_lang = ?')
        params.append(lang)

    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400

    params.append(uid)
    db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    row = db.execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()
    if 'username' in data and row['username'] != user['username']:
        session['username'] = row['username']
    return jsonify({'ok': True, 'user': user_json(row)})


@app.route('/api/auth/data-summary')
@login_required
def api_data_summary():
    """Resumen de datos guardados del usuario (membresía / perfil)."""
    uid = current_user_id()
    db = get_db()
    def count(sql, *args):
        try:
            return db.execute(sql, args).fetchone()[0]
        except Exception:
            return 0

    summary = {
        'equity_sessions': count('SELECT COUNT(*) FROM equity_sessions WHERE user_id = ?', uid),
        'preflop_tables': count('SELECT COUNT(*) FROM preflop_tables WHERE user_id = ?', uid),
        'tournaments': count('SELECT COUNT(*) FROM tournaments WHERE user_id = ?', uid),
        'transactions': count('SELECT COUNT(*) FROM transactions WHERE user_id = ?', uid),
        'hands': count('SELECT COUNT(*) FROM hands WHERE user_id = ?', uid),
        'hand_notes': count('SELECT COUNT(*) FROM hand_notes WHERE user_id = ?', uid),
        'hand_favorites': count('SELECT COUNT(*) FROM hand_favorites WHERE user_id = ?', uid),
    }
    return jsonify({'ok': True, 'summary': summary})


# ═══════════════════════════════════════════════════════════════
# PORTAL
# ═══════════════════════════════════════════════════════════════
@app.route('/')
@login_required
def portal():
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (current_user_id(),)).fetchone()
    uj = user_json(user)
    return render_template('portal.html', user=uj, allowed_tools=uj['allowed_tools'], is_admin=uj['is_admin'])


@app.route('/profile')
@login_required
def profile_page():
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (current_user_id(),)).fetchone()
    uj = user_json(user)
    return render_template('profile.html', user=uj, is_admin=uj['is_admin'])

@app.route('/tool/equity')
@login_required
@tool_required('equity')
def tool_equity():
    return render_template('equity.html')

@app.route('/tool/preflop')
@login_required
@tool_required('preflop')
def tool_preflop():
    return render_template('preflop.html')

@app.route('/tool/tracker')
@login_required
@tool_required('tracker')
def tool_tracker():
    return render_template('tracker.html')

@app.route('/tool/feltlab')
@login_required
@tool_required('feltlab')
def tool_feltlab():
    return render_template('feltlab.html')

@app.route('/tool/range-analyzer')
@login_required
@tool_required('range-analyzer')
def tool_range_analyzer():
    return render_template('range_analyzer.html')

@app.route('/tool/mtt-exploiter')
@login_required
@tool_required('mtt-exploiter')
def tool_mtt_exploiter():
    return render_template('mtt_exploiter.html')

@app.route('/tool/ailab')
@login_required
@tool_required('ailab')
def tool_ailab():
    return render_template('ailab.html')

@app.route('/tool/tournament-lab')
@login_required
@tool_required('tournament-lab')
def tool_tournament_lab():
    return render_template('tournament_lab.html')

# ═══════════════════════════════════════════════════════════════
# API: AI TABLE (perfil desde Hand Lab)
# ═══════════════════════════════════════════════════════════════
def _ailab_baseline_profile():
    """Perfil por defecto cuando no hay manos en Hand Lab."""
    return {
        'source': 'baseline',
        'hands_used': 0,
        'vpip': 24.0,
        'pfr': 18.0,
        'af': 2.2,
        'three_bet': 7.5,
        'fold_to_cbet': 48.0,
        'cbet': 58.0,
        'wtsd': 26.0,
        'aggression': 0.55,
        'tightness': 0.55,
        'bluff_freq': 0.28,
        'call_station': 0.22,
        'note': 'Perfil base (sin manos en Hand Lab). Importa manos en Hand Lab para personalizar la IA.',
    }


def _ailab_compute_profile_from_hands(rows):
    """Agrega stats básicas desde filas de hands (con actions_json)."""
    if not rows:
        return _ailab_baseline_profile()

    vpip_n = pfr_n = hands_n = 0
    bet_raise = call_n = fold_n = 0
    three_bet_n = three_bet_opp = 0
    cbet_n = cbet_opp = 0
    fold_cbet_n = fold_cbet_opp = 0
    sd_n = 0

    for row in rows:
        hands_n += 1
        try:
            actions = json.loads(row['actions_json'] or '[]')
        except Exception:
            actions = []
        if not isinstance(actions, list):
            actions = []

        hero = (row['hero'] or '').strip()
        hero_folded = bool(row['hero_folded'])
        hero_sd = bool(row['hero_showdown'])
        if hero_sd:
            sd_n += 1

        # actions: flexible format — list of {player, street, type, amount?} or strings
        preflop_acted = False
        preflop_raised = False
        streets_seen = set()
        raises_pre = 0

        for a in actions:
            if isinstance(a, str):
                continue
            if not isinstance(a, dict):
                continue
            pl = (a.get('player') or a.get('name') or a.get('p') or '').strip()
            street = (a.get('street') or a.get('round') or a.get('s') or 'preflop')
            if isinstance(street, str):
                street = street.lower()
            else:
                street = 'preflop'
            atype = (a.get('type') or a.get('action') or a.get('a') or '').lower()
            streets_seen.add(street)

            is_hero = pl == hero or (not pl and a.get('hero'))
            if not is_hero:
                # track opportunities roughly
                if street == 'preflop' and atype in ('raise', 'bet', '3bet', 'reraise'):
                    raises_pre += 1
                continue

            if street == 'preflop':
                if atype in ('call', 'raise', 'bet', 'allin', 'all-in', '3bet', 'limp'):
                    preflop_acted = True
                if atype in ('raise', 'bet', 'allin', 'all-in', '3bet', 'reraise'):
                    preflop_raised = True
                if atype in ('raise', '3bet', 'reraise', 'allin', 'all-in') and raises_pre >= 1:
                    three_bet_n += 1
                if raises_pre >= 1:
                    three_bet_opp += 1

            if atype in ('bet', 'raise', '3bet', 'reraise', 'allin', 'all-in'):
                bet_raise += 1
            elif atype in ('call', 'check'):
                call_n += 1
            elif atype in ('fold',):
                fold_n += 1

            if street == 'flop' and atype in ('bet', 'raise'):
                cbet_n += 1
            if street == 'flop':
                cbet_opp += 1
            if street == 'flop' and atype == 'fold':
                fold_cbet_n += 1
                fold_cbet_opp += 1
            elif street == 'flop' and atype in ('call', 'raise', 'bet', 'check'):
                fold_cbet_opp += 1

        if preflop_acted and not hero_folded:
            # still count VPIP if they put money in
            pass
        if preflop_acted:
            vpip_n += 1
        if preflop_raised:
            pfr_n += 1
        elif preflop_acted and not hero_folded:
            vpip_n = vpip_n  # already counted

        # fallback VPIP: if hero_net suggests played or not folded pre without action data
        if not actions and not hero_folded:
            vpip_n += 1

    def pct(num, den, default):
        if den <= 0:
            return default
        return round(100.0 * num / den, 1)

    vpip = pct(vpip_n, hands_n, 24.0)
    pfr = pct(pfr_n, hands_n, 18.0)
    af = round(bet_raise / max(call_n, 1), 2) if (bet_raise + call_n) > 0 else 2.2
    three_bet = pct(three_bet_n, max(three_bet_opp, hands_n // 4), 7.5)
    cbet = pct(cbet_n, max(cbet_opp, 1), 58.0)
    fold_to_cbet = pct(fold_cbet_n, max(fold_cbet_opp, 1), 48.0)
    wtsd = pct(sd_n, hands_n, 26.0)

    # Normalize to AI knobs 0–1
    tightness = max(0.15, min(0.9, (40 - min(vpip, 45)) / 40))
    aggression = max(0.15, min(0.95, af / 4.0))
    bluff_freq = max(0.1, min(0.55, 0.45 - (fold_to_cbet - 40) / 200))
    call_station = max(0.08, min(0.6, (wtsd - 15) / 40))

    return {
        'source': 'handlab',
        'hands_used': hands_n,
        'vpip': vpip,
        'pfr': pfr,
        'af': af,
        'three_bet': three_bet,
        'fold_to_cbet': fold_to_cbet,
        'cbet': cbet,
        'wtsd': wtsd,
        'aggression': round(aggression, 3),
        'tightness': round(tightness, 3),
        'bluff_freq': round(bluff_freq, 3),
        'call_station': round(call_station, 3),
        'note': f'IA entrenada con {hands_n} manos de Hand Lab (tu estilo agregado).',
    }


@app.route('/api/ailab/profile', methods=['GET'])
@login_required
@tool_required('ailab')
def ailab_profile():
    """Perfil de estilo para la IA a partir de manos de Hand Lab del usuario."""
    limit = min(int(request.args.get('limit', 2500)), 8000)
    db = get_db()
    uid = current_user_id()
    total = db.execute(
        'SELECT COUNT(*) AS c FROM hands WHERE user_id = ?', (uid,)
    ).fetchone()['c']
    rows = db.execute(
        'SELECT hero, hero_folded, hero_showdown, actions_json, hero_net '
        'FROM hands WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT ?',
        (uid, limit)
    ).fetchall()
    profile = _ailab_compute_profile_from_hands(rows)
    profile['hands_total'] = total
    return jsonify(profile)


def _ailab_insert_hand(db, uid, hand):
    """Inserta una mano AI Table en hands. Devuelve (ok, id)."""
    if not isinstance(hand, dict):
        return False, None
    hid = str(hand.get('id') or '').strip() or ('AI' + secrets.token_hex(8))
    try:
        db.execute(
            "INSERT OR IGNORE INTO hands "
            "(id, user_id, site, tournament, tournament_name, level, blinds, "
            "date, table_name, button, hero, hero_cards, hero_net, hero_net_bb, "
            "hero_folded, hero_showdown, winner, pot_total, bb, board, "
            "players_json, actions_json, source_file) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                hid, uid, (hand.get('site') or 'ailab'),
                hand.get('tournament'),
                hand.get('tournamentName') or hand.get('tournament_name') or 'AI Table',
                hand.get('level'),
                json.dumps(hand.get('blinds') if isinstance(hand.get('blinds'), list) else []),
                hand.get('date') or datetime.utcnow().strftime('%Y/%m/%d %H:%M:%S UTC'),
                hand.get('table') or hand.get('table_name') or 'AI Table',
                hand.get('button'),
                hand.get('hero') or 'Hero',
                json.dumps(hand.get('hero_cards') if isinstance(hand.get('hero_cards'), list) else []),
                float(hand.get('hero_net') or 0),
                float(hand.get('hero_net_bb') or 0),
                int(bool(hand.get('hero_folded'))),
                int(bool(hand.get('hero_showdown'))),
                hand.get('winner'),
                float(hand.get('pot_total') or 0),
                float(hand.get('bb') or 1),
                json.dumps(hand.get('board') if isinstance(hand.get('board'), list) else []),
                json.dumps(hand.get('players') if isinstance(hand.get('players'), list) else []),
                json.dumps(hand.get('actions') if isinstance(hand.get('actions'), list) else []),
                hand.get('sourceFile') or hand.get('source_file') or 'ailab',
            )
        )
        return True, hid
    except Exception:
        return False, hid


@app.route('/api/ailab/save-hand', methods=['POST'])
@login_required
@tool_required('ailab')
def ailab_save_hand():
    """Guarda una mano jugada en AI Table dentro de Hand Lab (tabla hands)."""
    data = request.get_json() or {}
    hand = data.get('hand') or data
    db = get_db()
    uid = current_user_id()
    ok, hid = _ailab_insert_hand(db, uid, hand)
    if not ok:
        db.rollback()
        return jsonify({'error': 'Could not save'}), 500
    db.commit()
    return jsonify({'ok': True, 'id': hid})


@app.route('/api/ailab/save-hands', methods=['POST'])
@login_required
@tool_required('ailab')
def ailab_save_hands():
    """Guarda varias manos de AI Table en Hand Lab."""
    data = request.get_json() or {}
    hands = data.get('hands') or []
    if not isinstance(hands, list) or not hands:
        return jsonify({'ok': True, 'inserted': 0})
    db = get_db()
    uid = current_user_id()
    inserted = 0
    ids = []
    for h in hands[:150]:
        ok, hid = _ailab_insert_hand(db, uid, h)
        if ok:
            inserted += 1
            ids.append(hid)
    db.commit()
    return jsonify({'ok': True, 'inserted': inserted, 'ids': ids, 'received': len(hands)})


# ═══════════════════════════════════════════════════════════════
# API: EQUITY CALCULATOR
# ═══════════════════════════════════════════════════════════════
@app.route('/api/equity/sessions', methods=['GET'])
@login_required
def equity_list():
    db = get_db()
    rows = db.execute(
        'SELECT id, name, created_at, updated_at FROM equity_sessions WHERE user_id = ? ORDER BY updated_at DESC',
        (current_user_id(),)
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/equity/sessions', methods=['POST'])
@login_required
def equity_create():
    data = request.get_json() or {}
    db = get_db()
    cur = db.execute(
        '''INSERT INTO equity_sessions (user_id, name, players_json, board_json, result_json)
           VALUES (?, ?, ?, ?, ?)''',
        (current_user_id(),
         data.get('name', 'Sin nombre'),
         json.dumps(data.get('players', [])),
         json.dumps(data.get('board', [])),
         json.dumps(data.get('result', {})))
    )
    db.commit()
    return jsonify({'ok': True, 'id': cur.lastrowid})

@app.route('/api/equity/sessions/<int:sid>', methods=['GET'])
@login_required
def equity_get(sid):
    db = get_db()
    row = db.execute(
        'SELECT * FROM equity_sessions WHERE id = ? AND user_id = ?',
        (sid, current_user_id())
    ).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({
        'id': row['id'],
        'name': row['name'],
        'players': json.loads(row['players_json']),
        'board': json.loads(row['board_json'] or '[]'),
        'result': json.loads(row['result_json'] or '{}'),
        'created_at': row['created_at'],
        'updated_at': row['updated_at']
    })

@app.route('/api/equity/sessions/<int:sid>', methods=['PUT'])
@login_required
def equity_update(sid):
    data = request.get_json() or {}
    db = get_db()
    db.execute(
        '''UPDATE equity_sessions
           SET name = COALESCE(?, name),
               players_json = COALESCE(?, players_json),
               board_json = COALESCE(?, board_json),
               result_json = COALESCE(?, result_json),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND user_id = ?''',
        (data.get('name'),
         json.dumps(data['players']) if 'players' in data else None,
         json.dumps(data['board']) if 'board' in data else None,
         json.dumps(data['result']) if 'result' in data else None,
         sid, current_user_id())
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/equity/sessions/<int:sid>', methods=['DELETE'])
@login_required
def equity_delete(sid):
    db = get_db()
    db.execute('DELETE FROM equity_sessions WHERE id = ? AND user_id = ?', (sid, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

# ═══════════════════════════════════════════════════════════════
# API: PREFLOP TRAINER
# ═══════════════════════════════════════════════════════════════
@app.route('/api/preflop/tables', methods=['GET'])
@login_required
@tool_required('preflop')
def preflop_list():
    """Lista tablas. ?full=1 incluye range completo (evita N+1 get por id)."""
    db = get_db()
    full = request.args.get('full', '0') in ('1', 'true', 'yes')
    if full:
        rows = db.execute(
            "SELECT id, hero, vs, stack, situation, sequence, raise_size, table_size, "
            "range_json, updated_at FROM preflop_tables WHERE user_id = ? "
            "ORDER BY updated_at DESC",
            (current_user_id(),)
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT id, hero, vs, stack, situation, sequence, raise_size, table_size, "
            "updated_at FROM preflop_tables WHERE user_id = ? ORDER BY updated_at DESC",
            (current_user_id(),)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if d.get('table_size') is None:
            d['table_size'] = 6
        if full and 'range_json' in d:
            try:
                d['range'] = json.loads(d.pop('range_json') or '{}')
            except Exception:
                d['range'] = {}
                d.pop('range_json', None)
        out.append(d)
    return jsonify(out)


@app.route('/api/preflop/tables', methods=['POST'])
@login_required
@tool_required('preflop')
def preflop_upsert():
    """Crea o actualiza una tabla (upsert por clave única)."""
    data = request.get_json() or {}
    hero = data.get('hero')
    vs = data.get('vs') or ''
    stack = data.get('stack')
    situation = data.get('situation')
    table_size = int(data.get('table_size') or 6)
    if table_size not in (6, 8):
        table_size = 6
    if not all([hero, stack, situation]):
        return jsonify({'error': 'Missing required fields'}), 400

    db = get_db()
    db.execute(
        '''INSERT INTO preflop_tables
           (user_id, hero, vs, stack, situation, sequence, raise_size, range_json, table_size, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, hero, vs, stack, situation, table_size) DO UPDATE SET
             sequence = excluded.sequence,
             raise_size = excluded.raise_size,
             range_json = excluded.range_json,
             updated_at = CURRENT_TIMESTAMP''',
        (current_user_id(), hero, vs, stack, situation,
         data.get('sequence', ''), data.get('raise_size', ''),
         json.dumps(data.get('range', {})), table_size)
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/preflop/tables/<int:tid>', methods=['GET'])
@login_required
@tool_required('preflop')
def preflop_get(tid):
    db = get_db()
    row = db.execute(
        'SELECT * FROM preflop_tables WHERE id = ? AND user_id = ?',
        (tid, current_user_id())
    ).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({
        'id': row['id'],
        'hero': row['hero'], 'vs': row['vs'], 'stack': row['stack'],
        'situation': row['situation'],
        'sequence': row['sequence'], 'raise_size': row['raise_size'],
        'table_size': row['table_size'] if 'table_size' in row.keys() else 6,
        'range': json.loads(row['range_json'])
    })

@app.route('/api/preflop/tables/<int:tid>', methods=['DELETE'])
@login_required
@tool_required('preflop')
def preflop_delete(tid):
    db = get_db()
    db.execute('DELETE FROM preflop_tables WHERE id = ? AND user_id = ?', (tid, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/preflop/bulk', methods=['POST'])
@login_required
@tool_required('preflop')
def preflop_bulk():
    """Reemplaza TODAS las tablas del usuario (para importación)."""
    data = request.get_json() or {}
    tables = data.get('tables', [])
    db = get_db()
    db.execute('DELETE FROM preflop_tables WHERE user_id = ?', (current_user_id(),))
    for t in tables:
        ts = int(t.get('table_size') or 6)
        if ts not in (6, 8):
            ts = 6
        db.execute(
            '''INSERT INTO preflop_tables
               (user_id, hero, vs, stack, situation, sequence, raise_size, range_json, table_size)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (current_user_id(), t.get('hero'), t.get('vs'), t.get('stack'),
             t.get('situation'), t.get('sequence', ''), t.get('raise_size', ''),
             json.dumps(t.get('range', {})), ts)
        )
    db.commit()
    return jsonify({'ok': True, 'count': len(tables)})

# ═══════════════════════════════════════════════════════════════
# API: POKER TRACKER
# ═══════════════════════════════════════════════════════════════
@app.route('/api/tracker/state', methods=['GET'])
@login_required
@tool_required('tracker')
def tracker_state_get():
    db = get_db()
    row = db.execute('SELECT * FROM tracker_state WHERE user_id = ?', (current_user_id(),)).fetchone()
    if not row:
        db.execute('INSERT INTO tracker_state (user_id) VALUES (?)', (current_user_id(),))
        db.commit()
        row = db.execute('SELECT * FROM tracker_state WHERE user_id = ?', (current_user_id(),)).fetchone()
    return jsonify({
        'bankroll': row['bankroll'],
        'initial_bankroll': row['initial_bankroll'],
        'theme': row['theme'],
        'welcome_shown': bool(row['welcome_shown'])
    })

@app.route('/api/tracker/state', methods=['PUT'])
@login_required
@tool_required('tracker')
def tracker_state_update():
    data = request.get_json() or {}
    db = get_db()
    db.execute(
        '''UPDATE tracker_state SET
             bankroll = COALESCE(?, bankroll),
             initial_bankroll = COALESCE(?, initial_bankroll),
             theme = COALESCE(?, theme),
             welcome_shown = COALESCE(?, welcome_shown)
           WHERE user_id = ?''',
        (data.get('bankroll'), data.get('initial_bankroll'),
         data.get('theme'),
         int(data['welcome_shown']) if 'welcome_shown' in data else None,
         current_user_id())
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/tracker/tournaments', methods=['GET'])
@login_required
@tool_required('tracker')
def tournaments_list():
    db = get_db()
    rows = db.execute(
        'SELECT * FROM tournaments WHERE user_id = ? ORDER BY date DESC, id DESC',
        (current_user_id(),)
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tracker/tournaments', methods=['POST'])
@login_required
@tool_required('tracker')
def tournaments_create():
    data = request.get_json() or {}
    db = get_db()
    date_val = data.get('date') or datetime.now().strftime('%Y-%m-%d')
    if isinstance(date_val, str) and len(date_val) >= 10:
        date_val = date_val[:10]
    cur = db.execute(
        '''INSERT INTO tournaments
           (user_id, name, cost, base_cost, rebuys, win, position, type, speed, site, players, date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (current_user_id(),
         data.get('name', 'Torneo sin nombre'),
         data.get('cost', 0), data.get('base_cost'), data.get('rebuys', 0),
         data.get('win', 0), data.get('position'), data.get('type'),
         data.get('speed'), data.get('site'), data.get('players', 0),
         date_val, data.get('notes'))
    )
    net = float(data.get('win', 0) or 0) - float(data.get('cost', 0) or 0)
    db.execute('UPDATE tracker_state SET bankroll = bankroll + ? WHERE user_id = ?',
               (net, current_user_id()))
    db.commit()
    return jsonify({'ok': True, 'id': cur.lastrowid})


@app.route('/api/tracker/tournaments/<int:tid>', methods=['PUT'])
@login_required
@tool_required('tracker')
def tournaments_update(tid):
    data = request.get_json() or {}
    db = get_db()
    old = db.execute('SELECT * FROM tournaments WHERE id = ? AND user_id = ?',
                     (tid, current_user_id())).fetchone()
    if not old:
        return jsonify({'error': 'Not found'}), 404

    old_net = float(old['win'] or 0) - float(old['cost'] or 0)
    new_win = data.get('win', old['win'])
    new_cost = data.get('cost', old['cost'])
    new_net = float(new_win or 0) - float(new_cost or 0)
    delta = new_net - old_net

    date_val = data.get('date') if data.get('date') not in (None, '') else old['date']
    if not date_val:
        date_val = datetime.now().strftime('%Y-%m-%d')
    if isinstance(date_val, str) and len(date_val) >= 10:
        date_val = date_val[:10]

    db.execute(
        '''UPDATE tournaments SET
             name = COALESCE(?, name), cost = COALESCE(?, cost),
             base_cost = ?, rebuys = COALESCE(?, rebuys),
             win = COALESCE(?, win), position = ?, type = ?,
             speed = ?, site = ?, players = COALESCE(?, players),
             date = ?, notes = ?
           WHERE id = ? AND user_id = ?''',
        (data.get('name'), data.get('cost'), data.get('base_cost'),
         data.get('rebuys'), data.get('win'), data.get('position'),
         data.get('type'), data.get('speed'), data.get('site'),
         data.get('players'), date_val, data.get('notes'), tid, current_user_id())
    )
    db.execute('UPDATE tracker_state SET bankroll = bankroll + ? WHERE user_id = ?',
               (delta, current_user_id()))
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/tracker/tournaments/<int:tid>', methods=['DELETE'])
@login_required
@tool_required('tracker')
def tournaments_delete(tid):
    db = get_db()
    old = db.execute('SELECT * FROM tournaments WHERE id = ? AND user_id = ?',
                     (tid, current_user_id())).fetchone()
    if not old:
        return jsonify({'error': 'Not found'}), 404
    net = old['win'] - old['cost']
    db.execute('DELETE FROM tournaments WHERE id = ? AND user_id = ?', (tid, current_user_id()))
    db.execute('UPDATE tracker_state SET bankroll = bankroll - ? WHERE user_id = ?',
               (net, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/tracker/transactions', methods=['GET'])
@login_required
@tool_required('tracker')
def transactions_list():
    db = get_db()
    rows = db.execute(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC',
        (current_user_id(),)
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tracker/transactions', methods=['POST'])
@login_required
@tool_required('tracker')
def transactions_create():
    data = request.get_json() or {}
    tx_type = data.get('type')
    amount = float(data.get('amount', 0))
    if tx_type not in ('deposit', 'withdraw') or amount <= 0:
        return jsonify({'error': 'Invalid data'}), 400

    db = get_db()
    state = db.execute('SELECT bankroll FROM tracker_state WHERE user_id = ?',
                       (current_user_id(),)).fetchone()
    # skip_balance_check: útil en importaciones masivas (orden deposit→torneos→withdraw)
    skip_check = bool(data.get('skip_balance_check'))
    if not skip_check and tx_type == 'withdraw' and state['bankroll'] < amount:
        return jsonify({'error': 'Insufficient bankroll'}), 400

    notes = (data.get('notes') or '').strip()[:500]

    date_val = data.get('date')
    if date_val and isinstance(date_val, str) and len(date_val) >= 10:
        date_val = date_val[:10]
        db.execute(
            'INSERT INTO transactions (user_id, type, amount, date, notes) VALUES (?, ?, ?, ?, ?)',
            (current_user_id(), tx_type, amount, date_val, notes)
        )
    else:
        db.execute(
            'INSERT INTO transactions (user_id, type, amount, notes) VALUES (?, ?, ?, ?)',
            (current_user_id(), tx_type, amount, notes)
        )
    delta = amount if tx_type == 'deposit' else -amount
    db.execute('UPDATE tracker_state SET bankroll = bankroll + ? WHERE user_id = ?',
               (delta, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/tracker/transactions/<int:tid>', methods=['PUT'])
@login_required
@tool_required('tracker')
def transactions_update(tid):
    """Actualiza notas (y opcionalmente fecha) de un depósito/retiro existente."""
    data = request.get_json() or {}
    db = get_db()
    tx = db.execute('SELECT * FROM transactions WHERE id = ? AND user_id = ?',
                    (tid, current_user_id())).fetchone()
    if not tx:
        return jsonify({'error': 'Not found'}), 404

    notes = data.get('notes')
    if notes is not None:
        notes = str(notes).strip()[:500]
        db.execute('UPDATE transactions SET notes = ? WHERE id = ? AND user_id = ?',
                   (notes, tid, current_user_id()))

    date_val = data.get('date')
    if date_val and isinstance(date_val, str) and len(date_val) >= 10:
        date_val = date_val[:10]
        db.execute('UPDATE transactions SET date = ? WHERE id = ? AND user_id = ?',
                   (date_val, tid, current_user_id()))

    db.commit()
    row = db.execute('SELECT * FROM transactions WHERE id = ? AND user_id = ?',
                     (tid, current_user_id())).fetchone()
    return jsonify(dict(row) if row else {'ok': True})


@app.route('/api/tracker/transactions/<int:tid>', methods=['DELETE'])
@login_required
@tool_required('tracker')
def transactions_delete(tid):
    db = get_db()
    tx = db.execute('SELECT * FROM transactions WHERE id = ? AND user_id = ?',
                    (tid, current_user_id())).fetchone()
    if not tx:
        return jsonify({'error': 'Not found'}), 404
    delta = -tx['amount'] if tx['type'] == 'deposit' else tx['amount']
    db.execute('DELETE FROM transactions WHERE id = ? AND user_id = ?', (tid, current_user_id()))
    db.execute('UPDATE tracker_state SET bankroll = bankroll + ? WHERE user_id = ?',
               (delta, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/tracker/clear', methods=['POST'])
@login_required
@tool_required('tracker')
def tracker_clear():
    """Borra historial completo (mantiene bankroll)."""
    db = get_db()
    db.execute('DELETE FROM tournaments WHERE user_id = ?', (current_user_id(),))
    db.execute('DELETE FROM transactions WHERE user_id = ?', (current_user_id(),))
    db.commit()
    return jsonify({'ok': True})

# ═══════════════════════════════════════════════════════════════
# API: FELTLAB HAND LAB
# ═══════════════════════════════════════════════════════════════
def _hand_row_to_dict(row):
    """Convierte una fila de hands al formato camelCase que espera el frontend."""
    d = dict(row)
    return {
        'id': d.get('id'),
        'site': d.get('site'),
        'tournament': d.get('tournament'),
        'tournamentName': d.get('tournament_name'),
        'level': d.get('level'),
        'blinds': json.loads(d.get('blinds') or '[]'),
        'date': d.get('date'),
        'table': d.get('table_name'),
        'button': d.get('button'),
        'hero': d.get('hero'),
        'hero_cards': json.loads(d.get('hero_cards') or '[]'),
        'hero_net': d.get('hero_net') or 0,
        'hero_net_bb': d.get('hero_net_bb') or 0,
        'hero_folded': bool(d.get('hero_folded')),
        'hero_showdown': bool(d.get('hero_showdown')),
        'winner': d.get('winner'),
        'pot_total': d.get('pot_total') or 0,
        'bb': d.get('bb') or 1,
        'board': json.loads(d.get('board') or '[]'),
        'players': json.loads(d.get('players_json') or '[]'),
        'actions': json.loads(d.get('actions_json') or '[]'),
        'sourceFile': d.get('source_file'),
    }


@app.route('/api/feltlab/hands/count', methods=['GET'])
@login_required
@tool_required('feltlab')
def feltlab_hands_count():
    """Conteo rapido sin transferir manos."""
    db = get_db()
    c = db.execute(
        'SELECT COUNT(*) AS c FROM hands WHERE user_id = ?',
        (current_user_id(),)
    ).fetchone()['c']
    return jsonify({'count': c})


@app.route('/api/feltlab/hands', methods=['GET'])
@login_required
@tool_required('feltlab')
def feltlab_hands_list():
    """Lista manos. limit, offset, site=acr|coinpoker, light=1 (sin actions)."""
    limit = min(int(request.args.get('limit', 8000)), 30000)
    offset = max(int(request.args.get('offset', 0)), 0)
    site = (request.args.get('site') or '').strip().lower()
    light = request.args.get('light', '0') in ('1', 'true', 'yes')
    db = get_db()
    where = 'user_id = ?'
    params = [current_user_id()]
    if site in ('acr', 'wpn'):
        where += " AND lower(COALESCE(site,'')) NOT LIKE '%coin%'"
    elif site in ('coin', 'coinpoker'):
        where += " AND lower(COALESCE(site,'')) LIKE '%coin%'"

    if light:
        rows = db.execute(
            f"SELECT id, site, tournament, tournament_name, level, date, table_name, "
            f"button, hero, hero_net, hero_net_bb, hero_folded, hero_showdown, "
            f"bb, board, players_json, source_file "
            f"FROM hands WHERE {where} ORDER BY date ASC, id ASC LIMIT ? OFFSET ?",
            (*params, limit, offset)
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                board = json.loads(d.get('board') or '[]')
            except Exception:
                board = []
            try:
                players = json.loads(d.get('players_json') or '[]')
            except Exception:
                players = []
            out.append({
                'id': d.get('id'), 'site': d.get('site'),
                'tournament': d.get('tournament'),
                'tournamentName': d.get('tournament_name'),
                'level': d.get('level'), 'date': d.get('date'),
                'table': d.get('table_name'), 'button': d.get('button'),
                'hero': d.get('hero'),
                'hero_net': d.get('hero_net') or 0,
                'hero_net_bb': d.get('hero_net_bb') or 0,
                'hero_folded': bool(d.get('hero_folded')),
                'hero_showdown': bool(d.get('hero_showdown')),
                'bb': d.get('bb') or 1,
                'board': board, 'players': players,
                'actions': [],
                'sourceFile': d.get('source_file'),
            })
        return jsonify(out)

    rows = db.execute(
        f"SELECT * FROM hands WHERE {where} ORDER BY date ASC, id ASC LIMIT ? OFFSET ?",
        (*params, limit, offset)
    ).fetchall()
    return jsonify([_hand_row_to_dict(r) for r in rows])


@app.route('/api/feltlab/hands/<hand_id>', methods=['GET'])
@login_required
@tool_required('feltlab')
def feltlab_hand_get(hand_id):
    db = get_db()
    row = db.execute(
        'SELECT * FROM hands WHERE id = ? AND user_id = ?',
        (hand_id, current_user_id())
    ).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(_hand_row_to_dict(row))


# 🆕 Eliminar UNA mano (con cascada de notas y favoritas)
@app.route('/api/feltlab/hands/<hand_id>', methods=['DELETE'])
@login_required
@tool_required('feltlab')
def feltlab_hand_delete(hand_id):
    db = get_db()
    uid = current_user_id()
    cur = db.execute('DELETE FROM hands WHERE id = ? AND user_id = ?', (hand_id, uid))
    if cur.rowcount == 0:
        db.rollback()
        return jsonify({'error': 'Not found'}), 404
    db.execute('DELETE FROM hand_notes WHERE hand_id = ? AND user_id = ?', (hand_id, uid))
    db.execute('DELETE FROM hand_favorites WHERE hand_id = ? AND user_id = ?', (hand_id, uid))
    db.commit()
    return jsonify({'ok': True, 'deleted': 1})


# 🆕 Eliminar VARIAS manos por lista de IDs (borrado por filtro)
@app.route('/api/feltlab/hands/bulk-delete', methods=['POST'])
@login_required
@tool_required('feltlab')
def feltlab_hands_bulk_delete():
    data = request.get_json() or {}
    ids = data.get('ids') or []
    if not isinstance(ids, list) or not ids:
        return jsonify({'ok': True, 'deleted': 0})
    ids = [str(x) for x in ids if x is not None][:20000]
    if not ids:
        return jsonify({'ok': True, 'deleted': 0})

    db = get_db()
    uid = current_user_id()
    deleted = 0
    chunk = 400
    for i in range(0, len(ids), chunk):
        part = ids[i:i + chunk]
        placeholders = ','.join('?' * len(part))
        cur = db.execute(
            f'DELETE FROM hands WHERE user_id = ? AND id IN ({placeholders})',
            (uid, *part)
        )
        deleted += cur.rowcount
        db.execute(
            f'DELETE FROM hand_notes WHERE user_id = ? AND hand_id IN ({placeholders})',
            (uid, *part)
        )
        db.execute(
            f'DELETE FROM hand_favorites WHERE user_id = ? AND hand_id IN ({placeholders})',
            (uid, *part)
        )
    db.commit()
    return jsonify({'ok': True, 'deleted': deleted, 'requested': len(ids)})


@app.route('/api/feltlab/hands/bulk', methods=['POST'])
@login_required
@tool_required('feltlab')
def feltlab_hands_bulk():
    """Inserta muchas manos en lote (rápido). Ignora duplicados del mismo usuario."""
    data = request.get_json() or {}
    hands = data.get('hands', [])
    if not hands:
        return jsonify({'ok': True, 'inserted': 0})

    db = get_db()
    uid = current_user_id()
    rows = []
    for h in hands:
        hid = h.get('id')
        if not hid:
            continue
        rows.append((
            hid, uid, h.get('site'), h.get('tournament'),
            h.get('tournamentName') or h.get('tournament_name'),
            h.get('level'),
            json.dumps(h.get('blinds') or []),
            h.get('date'), h.get('table') or h.get('table_name'), h.get('button'),
            h.get('hero'), json.dumps(h.get('hero_cards') or []),
            h.get('hero_net', 0), h.get('hero_net_bb', 0),
            int(bool(h.get('hero_folded'))), int(bool(h.get('hero_showdown'))),
            h.get('winner'), h.get('pot_total', 0), h.get('bb', 1),
            json.dumps(h.get('board') or []),
            json.dumps(h.get('players') or []),
            json.dumps(h.get('actions') or []),
            h.get('sourceFile') or h.get('source_file')
        ))

    before = db.execute('SELECT COUNT(*) AS c FROM hands WHERE user_id = ?', (uid,)).fetchone()['c']
    sql = (
        "INSERT OR IGNORE INTO hands "
        "(id, user_id, site, tournament, tournament_name, level, blinds, "
        "date, table_name, button, hero, hero_cards, hero_net, hero_net_bb, "
        "hero_folded, hero_showdown, winner, pot_total, bb, board, "
        "players_json, actions_json, source_file) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    batch = 500
    for i in range(0, len(rows), batch):
        db.executemany(sql, rows[i:i + batch])
    db.commit()
    after = db.execute('SELECT COUNT(*) AS c FROM hands WHERE user_id = ?', (uid,)).fetchone()['c']
    return jsonify({'ok': True, 'inserted': max(0, after - before), 'received': len(rows)})


@app.route('/api/feltlab/hands/clear', methods=['POST'])
@login_required
@tool_required('feltlab')
def feltlab_hands_clear():
    db = get_db()
    uid = current_user_id()
    db.execute('DELETE FROM hands WHERE user_id = ?', (uid,))
    db.execute('DELETE FROM hand_notes WHERE user_id = ?', (uid,))
    db.execute('DELETE FROM hand_favorites WHERE user_id = ?', (uid,))
    db.execute('DELETE FROM feltlab_files WHERE user_id = ?', (uid,))
    db.commit()
    return jsonify({'ok': True})

# ═══ Notas ═══
@app.route('/api/feltlab/notes', methods=['GET'])
@login_required
@tool_required('feltlab')
def feltlab_notes_list():
    db = get_db()
    rows = db.execute(
        'SELECT hand_id, text, tags, updated_at FROM hand_notes WHERE user_id = ?',
        (current_user_id(),)
    ).fetchall()
    return jsonify([{
        'hand_id': r['hand_id'],
        'text': r['text'],
        'tags': json.loads(r['tags'] or '[]'),
        'updated_at': r['updated_at']
    } for r in rows])

@app.route('/api/feltlab/notes/<hand_id>', methods=['PUT'])
@login_required
@tool_required('feltlab')
def feltlab_note_put(hand_id):
    data = request.get_json() or {}
    text = data.get('text', '')
    tags = data.get('tags', [])
    db = get_db()
    db.execute(
        '''INSERT INTO hand_notes (hand_id, user_id, text, tags, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(hand_id, user_id) DO UPDATE SET
             text = excluded.text, tags = excluded.tags, updated_at = CURRENT_TIMESTAMP''',
        (hand_id, current_user_id(), text, json.dumps(tags))
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/feltlab/notes/<hand_id>', methods=['DELETE'])
@login_required
@tool_required('feltlab')
def feltlab_note_delete(hand_id):
    db = get_db()
    db.execute('DELETE FROM hand_notes WHERE hand_id = ? AND user_id = ?',
               (hand_id, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

# ═══ Favoritas ═══
@app.route('/api/feltlab/favorites', methods=['GET'])
@login_required
@tool_required('feltlab')
def feltlab_favs_list():
    db = get_db()
    rows = db.execute('SELECT hand_id FROM hand_favorites WHERE user_id = ?',
                      (current_user_id(),)).fetchall()
    return jsonify([r['hand_id'] for r in rows])

@app.route('/api/feltlab/favorites/<hand_id>', methods=['PUT'])
@login_required
@tool_required('feltlab')
def feltlab_fav_add(hand_id):
    db = get_db()
    db.execute('INSERT OR IGNORE INTO hand_favorites (hand_id, user_id) VALUES (?, ?)',
               (hand_id, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/feltlab/favorites/<hand_id>', methods=['DELETE'])
@login_required
@tool_required('feltlab')
def feltlab_fav_del(hand_id):
    db = get_db()
    db.execute('DELETE FROM hand_favorites WHERE hand_id = ? AND user_id = ?',
               (hand_id, current_user_id()))
    db.commit()
    return jsonify({'ok': True})

# ═══ Config ═══
@app.route('/api/feltlab/config', methods=['GET'])
@login_required
@tool_required('feltlab')
def feltlab_config_get():
    db = get_db()
    row = db.execute('SELECT config_json FROM feltlab_config WHERE user_id = ?',
                     (current_user_id(),)).fetchone()
    return jsonify(json.loads(row['config_json']) if row else {})

@app.route('/api/feltlab/config', methods=['PUT'])
@login_required
@tool_required('feltlab')
def feltlab_config_put():
    data = request.get_json() or {}
    db = get_db()
    db.execute(
        '''INSERT INTO feltlab_config (user_id, config_json, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP''',
        (current_user_id(), json.dumps(data))
    )
    db.commit()
    return jsonify({'ok': True})

# ═══ Archivos cargados ═══
@app.route('/api/feltlab/files', methods=['GET'])
@login_required
@tool_required('feltlab')
def feltlab_files_list():
    db = get_db()
    rows = db.execute('SELECT * FROM feltlab_files WHERE user_id = ?',
                      (current_user_id(),)).fetchall()
    return jsonify([{
        'name': r['name'],
        'handsCount': r['hands_count'],
        'tournaments': json.loads(r['tournaments'] or '[]'),
        'site': r['site'],
        'loaded_at': r['loaded_at']
    } for r in rows])

@app.route('/api/feltlab/files', methods=['POST'])
@login_required
@tool_required('feltlab')
def feltlab_file_put():
    data = request.get_json() or {}
    db = get_db()
    db.execute(
        '''INSERT INTO feltlab_files (user_id, name, hands_count, tournaments, site)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, name) DO UPDATE SET
             hands_count = excluded.hands_count,
             tournaments = excluded.tournaments,
             site = excluded.site''',
        (current_user_id(), data.get('name'), data.get('handsCount', 0),
         json.dumps(data.get('tournaments', [])), data.get('site'))
    )
    db.commit()
    return jsonify({'ok': True})


# ═══════════════════════════════════════════════════════════════
# API: MTT EXPLOITER — Pool personal (sin CoinPoker)
# ═══════════════════════════════════════════════════════════════
def _mtt_round2(x):
    return round(float(x) + 1e-12, 2)


def _mtt_classify_villain(stats):
    vpip = stats.get('vpip') or 0
    pfr = stats.get('pfr') or 0
    af = stats.get('af') if stats.get('af') is not None else 1
    stack = stats.get('avgStackBB') or 30
    allin = stats.get('allinFreq') or 0
    if stack > 0 and stack < 20 and allin > 20:
        return 'shortstack'
    if vpip >= 45 and af < 2:
        return 'fish'
    if vpip >= 32 and pfr < 10:
        return 'calling_station'
    if vpip <= 18 and pfr >= 12:
        return 'nit'
    if vpip >= 45 and af >= 4:
        return 'maniac'
    if vpip >= 28 and pfr >= 24:
        return 'lag'
    if 20 <= vpip <= 28 and 18 <= pfr <= 24:
        return 'reg'
    return 'unknown'


def _mtt_confidence(n):
    if n >= 50:
        return 'high'
    if n >= 20:
        return 'medium'
    return 'low'


def _mtt_acc_new():
    return {
        'dealt': 0, 'vpip': 0, 'pfr': 0,
        'three_opp': 0, 'three_hits': 0,
        'fold_cbet_opp': 0, 'folds_cbet': 0,
        'showdowns': 0, 'saw_flop': 0,
        'bets': 0, 'raises': 0, 'calls': 0, 'allins': 0,
        'stack_sum': 0.0, 'stack_n': 0,
        'sites': set(),
    }


def _mtt_acc_update(acc, hand, name):
    """Actualiza contadores de un villano con UNA mano (sin guardar la mano)."""
    players = hand['players']
    actions = hand['actions']
    for p in players:
        if p.get('name') == name:
            if p.get('sitting_out') or p.get('sittingOut') or p.get('waiting'):
                return
            break
    if not any(a.get('player') == name for a in actions):
        return

    acc['dealt'] += 1
    site = hand.get('site') or 'acr'
    acc['sites'].add(site)

    bb = hand.get('bb') or 1
    for p in players:
        if p.get('name') == name and p.get('stack') is not None and bb:
            try:
                acc['stack_sum'] += float(p['stack']) / float(bb)
                acc['stack_n'] += 1
            except (TypeError, ValueError):
                pass

    v_acts = [a for a in actions if a.get('player') == name]
    preflop = [a for a in v_acts if a.get('street') == 'preflop']
    if any(a.get('type') in ('call', 'raise', 'bet', 'allin') for a in preflop):
        acc['vpip'] += 1
    if any(a.get('type') in ('raise', 'allin') for a in preflop):
        acc['pfr'] += 1
    if any(a.get('type') == 'allin' for a in v_acts):
        acc['allins'] += 1

    pre_all = [a for a in actions if a.get('street') == 'preflop']
    raise_seen = False
    for a in pre_all:
        t, pl = a.get('type'), a.get('player')
        if t in ('raise', 'allin') and pl != name:
            raise_seen = True
        elif raise_seen and pl == name:
            acc['three_opp'] += 1
            if t in ('raise', 'allin'):
                acc['three_hits'] += 1
            break

    flop = [a for a in actions if a.get('street') == 'flop']
    faced = False
    for a in flop:
        if a.get('player') != name and a.get('type') in ('bet', 'raise', 'allin'):
            faced = True
        elif faced and a.get('player') == name:
            acc['fold_cbet_opp'] += 1
            if a.get('type') == 'fold':
                acc['folds_cbet'] += 1
            break

    board = hand.get('board') or []
    folded_pre = any(a.get('type') == 'fold' and a.get('street') == 'preflop' for a in v_acts)
    if not folded_pre and (len(board) >= 3 or flop):
        in_post = any(
            a.get('player') == name and a.get('street') in ('flop', 'turn', 'river', 'showdown')
            for a in actions
        )
        if in_post or not any(a.get('player') == name and a.get('type') == 'fold' for a in actions):
            acc['saw_flop'] += 1
            showed = any(a.get('type') == 'show' for a in v_acts)
            never_fold = not any(a.get('type') == 'fold' for a in v_acts)
            hand_sd = any(a.get('type') == 'show' for a in actions)
            if showed or (never_fold and hand_sd):
                acc['showdowns'] += 1

    for a in v_acts:
        t = a.get('type')
        if t == 'bet':
            acc['bets'] += 1
        elif t == 'raise':
            acc['raises'] += 1
        elif t == 'call':
            acc['calls'] += 1


def _mtt_acc_to_stats(acc):
    total = acc['dealt'] or 0
    avg_stack = (acc['stack_sum'] / acc['stack_n']) if acc['stack_n'] else 0
    bets, raises, calls = acc['bets'], acc['raises'], acc['calls']
    return {
        'vpip': _mtt_round2((acc['vpip'] / total) * 100) if total else 0,
        'pfr': _mtt_round2((acc['pfr'] / total) * 100) if total else 0,
        'threebet': _mtt_round2((acc['three_hits'] / acc['three_opp']) * 100) if acc['three_opp'] else None,
        'foldCbet': _mtt_round2((acc['folds_cbet'] / acc['fold_cbet_opp']) * 100) if acc['fold_cbet_opp'] else None,
        'wtsd': _mtt_round2((acc['showdowns'] / acc['saw_flop']) * 100) if acc['saw_flop'] else None,
        'af': _mtt_round2((bets + raises) / calls) if calls else (_mtt_round2(bets + raises) if (bets + raises) else None),
        'allinFreq': _mtt_round2((acc['allins'] / total) * 100) if total else 0,
        'avgStackBB': _mtt_round2(avg_stack),
        'dealtHands': total,
    }


@app.route('/api/mtt/pool/analyze', methods=['GET'])
@login_required
def mtt_pool_analyze():
    """
    Pool PERSONAL del usuario logueado, sin CoinPoker.
    Agregacion incremental en servidor (no guarda listas de manos por rival).
    """
    limit = min(int(request.args.get('limit', 50000)), 100000)
    db = get_db()

    uid = current_user_id()
    total_users = 1
    total_raw = db.execute(
        "SELECT COUNT(*) AS c FROM hands WHERE user_id = ? AND lower(COALESCE(site, '')) NOT LIKE '%coin%'",
        (uid,)
    ).fetchone()['c']

    rows = db.execute(
        """
        SELECT id, site, tournament, hero, bb,
               players_json, actions_json, board
        FROM hands
        WHERE user_id = ?
          AND lower(COALESCE(site, '')) NOT LIKE '%coin%'
        ORDER BY date ASC, id ASC
        LIMIT ?
        """,
        (uid, limit)
    ).fetchall()

    villains = {}
    tourneys = set()
    sites = {}
    hands_count = 0

    for row in rows:
        site = (row['site'] or 'unknown').lower()
        if 'coin' in site:
            continue
        try:
            players = json.loads(row['players_json'] or '[]')
            actions = json.loads(row['actions_json'] or '[]')
            board = json.loads(row['board'] or '[]')
        except Exception:
            continue
        if not players or len(players) < 2:
            continue

        hands_count += 1
        sites[site] = sites.get(site, 0) + 1
        if row['tournament']:
            tourneys.add(row['tournament'])

        hand = {
            'site': row['site'] or 'acr',
            'hero': row['hero'],
            'bb': row['bb'] or 1,
            'players': players,
            'actions': actions,
            'board': board,
        }
        hero = row['hero']
        for p in players:
            name = p.get('name')
            if not name or len(name) < 2 or name == hero:
                continue
            if p.get('sitting_out') or p.get('sittingOut') or p.get('waiting'):
                continue
            acc = villains.get(name)
            if acc is None:
                acc = _mtt_acc_new()
                villains[name] = acc
            _mtt_acc_update(acc, hand, name)

    out_villains = []
    for name, acc in villains.items():
        if acc['dealt'] < 1:
            continue
        site_list = [s for s in acc['sites'] if s]
        if site_list and all('coin' in str(s).lower() for s in site_list):
            continue
        stats = _mtt_acc_to_stats(acc)
        sample = stats['dealtHands']
        out_villains.append({
            'hash': name.lower(),
            'alias': name,
            'sites': list(acc['sites']) or ['acr'],
            'hands': sample,
            **stats,
            'type': _mtt_classify_villain(stats),
            'confidence': _mtt_confidence(sample),
        })
    out_villains.sort(key=lambda v: v['hands'], reverse=True)

    solid = [v for v in out_villains if v['hands'] >= 5]

    def avg(key):
        vals = [v[key] for v in solid if v.get(key) is not None]
        return _mtt_round2(sum(vals) / len(vals)) if vals else 0

    return jsonify({
        'ok': True,
        'scope': 'personal',
        'handsCount': hands_count,
        'rawRows': total_raw,
        'contributors': total_users,
        'tourneysCount': len(tourneys),
        'sites': sites,
        'villains': out_villains,
        'pool': {
            'vpip': avg('vpip'),
            'pfr': avg('pfr'),
            'threebet': avg('threebet'),
            'foldCbet': avg('foldCbet'),
            'wtsd': avg('wtsd'),
            'af': avg('af'),
            'rivals': len(out_villains),
            'rivalsSolid': len(solid),
        },
        'limit': limit,
    })


@app.route('/api/mtt/pool/meta', methods=['GET'])
@login_required
def mtt_pool_meta():
    """Resumen rapido del pool PERSONAL (sin CoinPoker)."""
    db = get_db()
    uid = current_user_id()
    total = db.execute(
        "SELECT COUNT(*) AS c FROM hands WHERE user_id = ? AND lower(COALESCE(site, '')) NOT LIKE '%coin%'",
        (uid,)
    ).fetchone()['c']
    return jsonify({
        'ok': True,
        'hands': total,
        'uniqueHands': total,
        'contributors': 1,
        'scope': 'personal',
    })


# ═══════════════════════════════════════════════════════════════
# API: BIBLIOTECA DE MANOS (opt-in del dueño)
# ═══════════════════════════════════════════════════════════════
@app.route('/api/library/packs', methods=['GET'])
@login_required
@tool_required('feltlab')
def library_list():
    """Packs publicos + propios del usuario."""
    db = get_db()
    uid = current_user_id()
    rows = db.execute(
        """
        SELECT p.*, u.username, u.display_name
        FROM hand_library_packs p
        JOIN users u ON u.id = p.owner_id
        WHERE p.is_public = 1 OR p.owner_id = ?
        ORDER BY p.created_at DESC
        LIMIT 200
        """,
        (uid,)
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            ttypes = json.loads(d.get('tournament_types') or '[]')
        except Exception:
            ttypes = []
        out.append({
            'id': d['id'],
            'title': d['title'],
            'description': d.get('description') or '',
            'siteLabel': d.get('site_label') or 'mixed',
            'handCount': d.get('hand_count') or 0,
            'tourneyCount': d.get('tourney_count') or 0,
            'tournamentTypes': ttypes,
            'isPublic': bool(d.get('is_public')),
            'isOwner': d['owner_id'] == uid,
            'owner': d.get('display_name') or d.get('username'),
            'username': d.get('username'),
            'createdAt': d.get('created_at'),
        })
    return jsonify(out)


@app.route('/api/library/packs', methods=['POST'])
@login_required
@tool_required('feltlab')
def library_publish():
    """Publica pack (opt-in). scope=all|acr|coinpoker; handIds opcional."""
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title required'}), 400
    description = (data.get('description') or '').strip()[:500]
    scope = (data.get('scope') or 'acr').lower()
    hand_ids = data.get('handIds')

    db = get_db()
    uid = current_user_id()
    where = 'user_id = ?'
    params = [uid]
    if scope in ('acr', 'wpn'):
        where += " AND lower(COALESCE(site,'')) NOT LIKE '%coin%'"
        site_label = 'acr'
    elif scope in ('coin', 'coinpoker'):
        where += " AND lower(COALESCE(site,'')) LIKE '%coin%'"
        site_label = 'coinpoker'
    else:
        site_label = 'mixed'

    if hand_ids and isinstance(hand_ids, list) and len(hand_ids) > 0:
        ids = hand_ids[:5000]
        placeholders = ','.join('?' * len(ids))
        where += f' AND id IN ({placeholders})'
        params.extend(ids)

    rows = db.execute(
        f'SELECT * FROM hands WHERE {where} ORDER BY date ASC, id ASC LIMIT 20000',
        params
    ).fetchall()
    if not rows:
        return jsonify({'error': 'No hands match this filter to publish'}), 400

    tourneys = set()
    for r in rows:
        if r['tournament']:
            tourneys.add(str(r['tournament']))
        if r['tournament_name']:
            tourneys.add(str(r['tournament_name'])[:80])

    types = set()
    for name in list(tourneys)[:80]:
        low = name.lower()
        if 'ko' in low or 'knockout' in low or 'bounty' in low:
            types.add('KO/Bounty')
        elif 'satellite' in low or 'sat ' in low:
            types.add('Satellite')
        elif 'turbo' in low:
            types.add('Turbo')
        elif 'hyper' in low:
            types.add('Hyper')
        else:
            types.add('MTT')
    if not types:
        types.add('MTT')

    cur = db.execute(
        "INSERT INTO hand_library_packs "
        "(owner_id, title, description, site_label, hand_count, tourney_count, "
        "tournament_types, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
        (uid, title[:120], description, site_label, len(rows),
         len(tourneys), json.dumps(sorted(types)))
    )
    pack_id = cur.lastrowid

    batch = []
    for r in rows:
        d = _hand_row_to_dict(r)
        batch.append((pack_id, d['id'], json.dumps(d, ensure_ascii=False)))
    for i in range(0, len(batch), 400):
        db.executemany(
            'INSERT OR IGNORE INTO hand_library_pack_hands (pack_id, hand_id, hand_json) VALUES (?, ?, ?)',
            batch[i:i + 400]
        )
    db.commit()
    return jsonify({'ok': True, 'id': pack_id, 'handCount': len(rows)})


@app.route('/api/library/packs/<int:pack_id>', methods=['GET'])
@login_required
@tool_required('feltlab')
def library_get(pack_id):
    db = get_db()
    uid = current_user_id()
    row = db.execute(
        "SELECT p.*, u.username, u.display_name "
        "FROM hand_library_packs p JOIN users u ON u.id = p.owner_id "
        "WHERE p.id = ? AND (p.is_public = 1 OR p.owner_id = ?)",
        (pack_id, uid)
    ).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    d = dict(row)
    try:
        ttypes = json.loads(d.get('tournament_types') or '[]')
    except Exception:
        ttypes = []
    include_hands = request.args.get('hands', '0') in ('1', 'true')
    hands = []
    if include_hands:
        hrows = db.execute(
            'SELECT hand_json FROM hand_library_pack_hands WHERE pack_id = ?',
            (pack_id,)
        ).fetchall()
        for hr in hrows:
            try:
                hands.append(json.loads(hr['hand_json']))
            except Exception:
                pass
    return jsonify({
        'id': d['id'],
        'title': d['title'],
        'description': d.get('description') or '',
        'siteLabel': d.get('site_label'),
        'handCount': d.get('hand_count') or 0,
        'tourneyCount': d.get('tourney_count') or 0,
        'tournamentTypes': ttypes,
        'owner': d.get('display_name') or d.get('username'),
        'username': d.get('username'),
        'isOwner': d['owner_id'] == uid,
        'createdAt': d.get('created_at'),
        'hands': hands if include_hands else None,
    })


@app.route('/api/library/packs/<int:pack_id>/import', methods=['POST'])
@login_required
@tool_required('feltlab')
def library_import(pack_id):
    """Importa pack a manos del usuario (OR IGNORE)."""
    db = get_db()
    uid = current_user_id()
    pack = db.execute(
        'SELECT * FROM hand_library_packs WHERE id = ? AND (is_public = 1 OR owner_id = ?)',
        (pack_id, uid)
    ).fetchone()
    if not pack:
        return jsonify({'error': 'Pack not available'}), 404

    hrows = db.execute(
        'SELECT hand_json FROM hand_library_pack_hands WHERE pack_id = ?',
        (pack_id,)
    ).fetchall()
    before = db.execute('SELECT COUNT(*) AS c FROM hands WHERE user_id = ?', (uid,)).fetchone()['c']
    sql = (
        "INSERT OR IGNORE INTO hands "
        "(id, user_id, site, tournament, tournament_name, level, blinds, "
        "date, table_name, button, hero, hero_cards, hero_net, hero_net_bb, "
        "hero_folded, hero_showdown, winner, pot_total, bb, board, "
        "players_json, actions_json, source_file) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    rows_ins = []
    for hr in hrows:
        try:
            h = json.loads(hr['hand_json'])
        except Exception:
            continue
        hid = h.get('id')
        if not hid:
            continue
        rows_ins.append((
            hid, uid, h.get('site'), h.get('tournament'),
            h.get('tournamentName') or h.get('tournament_name'),
            h.get('level'),
            json.dumps(h.get('blinds') or []),
            h.get('date'), h.get('table') or h.get('table_name'), h.get('button'),
            h.get('hero'), json.dumps(h.get('hero_cards') or []),
            h.get('hero_net', 0), h.get('hero_net_bb', 0),
            int(bool(h.get('hero_folded'))), int(bool(h.get('hero_showdown'))),
            h.get('winner'), h.get('pot_total', 0), h.get('bb', 1),
            json.dumps(h.get('board') or []),
            json.dumps(h.get('players') or []),
            json.dumps(h.get('actions') or []),
            h.get('sourceFile') or ('library:' + str(pack_id))
        ))
    for i in range(0, len(rows_ins), 400):
        db.executemany(sql, rows_ins[i:i + 400])
    db.commit()
    after = db.execute('SELECT COUNT(*) AS c FROM hands WHERE user_id = ?', (uid,)).fetchone()['c']
    return jsonify({
        'ok': True,
        'inserted': max(0, after - before),
        'received': len(rows_ins),
        'packTitle': pack['title'],
    })


@app.route('/api/library/packs/<int:pack_id>', methods=['DELETE'])
@login_required
@tool_required('feltlab')
def library_delete(pack_id):
    db = get_db()
    uid = current_user_id()
    cur = db.execute(
        'DELETE FROM hand_library_packs WHERE id = ? AND owner_id = ?',
        (pack_id, uid)
    )
    db.commit()
    if cur.rowcount == 0:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'ok': True})


# ═══════════════════════════════════════════════════════════════
# ADMIN DASHBOARD + CÓDIGOS DE INVITACIÓN
# ═══════════════════════════════════════════════════════════════
@app.route('/admin')
@admin_required
def admin_dashboard():
    return render_template('admin.html', tool_labels=TOOL_LABELS, all_tools=ALL_TOOLS)

@app.route('/api/admin/stats')
@admin_required
def admin_stats():
    db = get_db()
    users_count = db.execute('SELECT COUNT(*) AS c FROM users').fetchone()['c']
    admins = db.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").fetchone()['c']
    usage_total = 0
    try:
        usage_total = db.execute('SELECT COUNT(*) AS c FROM tool_usage').fetchone()['c']
    except Exception:
        pass
    return jsonify({'users': users_count, 'admins': admins, 'tool_opens': usage_total})

@app.route('/api/admin/usage')
@admin_required
def admin_usage():
    """Estadísticas de uso por herramienta y por usuario."""
    db = get_db()
    try:
        by_tool = db.execute(
            '''SELECT tool_id, COUNT(*) AS opens,
                      COUNT(DISTINCT user_id) AS unique_users,
                      MAX(created_at) AS last_used
               FROM tool_usage GROUP BY tool_id ORDER BY opens DESC'''
        ).fetchall()
        by_user = db.execute(
            '''SELECT u.id, u.username, u.display_name, u.role,
                      COUNT(t.id) AS opens,
                      COUNT(DISTINCT t.tool_id) AS tools_used,
                      MAX(t.created_at) AS last_used
               FROM users u
               LEFT JOIN tool_usage t ON t.user_id = u.id
               GROUP BY u.id
               ORDER BY opens DESC'''
        ).fetchall()
        recent = db.execute(
            '''SELECT t.tool_id, t.created_at, u.username
               FROM tool_usage t
               JOIN users u ON u.id = t.user_id
               ORDER BY t.created_at DESC LIMIT 30'''
        ).fetchall()
    except Exception as e:
        return jsonify({'by_tool': [], 'by_user': [], 'recent': [], 'error': _safe_err(e)})

    return jsonify({
        'by_tool': [
            {
                'tool_id': r['tool_id'],
                'label': TOOL_LABELS.get(r['tool_id'], r['tool_id']),
                'opens': r['opens'],
                'unique_users': r['unique_users'],
                'last_used': r['last_used'],
            } for r in by_tool
        ],
        'by_user': [
            {
                'id': r['id'],
                'username': r['username'],
                'display_name': r['display_name'] or r['username'],
                'role': r['role'],
                'opens': r['opens'] or 0,
                'tools_used': r['tools_used'] or 0,
                'last_used': r['last_used'],
            } for r in by_user
        ],
        'recent': [
            {
                'tool_id': r['tool_id'],
                'label': TOOL_LABELS.get(r['tool_id'], r['tool_id']),
                'username': r['username'],
                'created_at': r['created_at'],
            } for r in recent
        ],
    })

@app.route('/api/admin/usage/clear', methods=['POST'])
@admin_required
def admin_usage_clear():
    db = get_db()
    db.execute('DELETE FROM tool_usage')
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/admin/db')
@admin_required
def admin_db_info():
    """Info de la base de datos: tamaño, tablas, conteos."""
    db = get_db()
    import os as _os
    size_bytes = 0
    try:
        size_bytes = _os.path.getsize(DB_PATH)
    except Exception:
        pass
    tables = []
    try:
        names = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
        for n in names:
            name = n['name']
            try:
                cnt = db.execute(f'SELECT COUNT(*) AS c FROM "{name}"').fetchone()['c']
            except Exception:
                cnt = -1
            tables.append({'name': name, 'rows': cnt})
    except Exception as e:
        return jsonify({'error': _safe_err(e), 'tables': [], 'size_bytes': size_bytes})

    return jsonify({
        'size_bytes': size_bytes,
        'size_mb': round(size_bytes / (1024 * 1024), 3),
        'tables': tables,
        'table_count': len(tables),
    })

@app.route('/api/admin/db/vacuum', methods=['POST'])
@admin_required
def admin_db_vacuum():
    db = get_db()
    db.execute('VACUUM')
    db.commit()
    import os as _os
    size_bytes = 0
    try:
        size_bytes = _os.path.getsize(DB_PATH)
    except Exception:
        pass
    return jsonify({'ok': True, 'size_bytes': size_bytes, 'size_mb': round(size_bytes / (1024 * 1024), 3)})

@app.route('/api/admin/db/backup', methods=['GET'])
@admin_required
def admin_db_backup():
    """Copia consistente de la BD (API de backup de SQLite). Segura aunque el servidor esté en uso."""
    import tempfile
    import sqlite3 as _sq
    import os as _os
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    tmpdir = tempfile.mkdtemp(prefix='rangelab-backup-')
    dest = _os.path.join(tmpdir, f'rangelab-{stamp}.db')
    src = _sq.connect(DB_PATH, timeout=30)
    dst = _sq.connect(dest)
    try:
        src.backup(dst)
        ok = dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    finally:
        dst.close()
        src.close()
    if not ok:
        abort(500)

    @after_this_request
    def _cleanup(response):
        try:
            _os.remove(dest)
            _os.rmdir(tmpdir)
        except Exception:
            pass
        return response

    return send_file(dest, as_attachment=True, download_name=f'rangelab-{stamp}.db',
                     mimetype='application/octet-stream')

@app.route('/api/admin/db/clear-table', methods=['POST'])
@admin_required
def admin_db_clear_table():
    """Vacía una tabla permitida (no users ni invite_codes por seguridad directa)."""
    data = request.get_json() or {}
    name = (data.get('table') or '').strip()
    allowed = {
        'tool_usage', 'equity_sessions', 'hand_notes', 'hand_favorites',
        'feltlab_files', 'hand_library_pack_hands', 'hand_library_packs',
        'tournaments', 'transactions',
    }
    if name not in allowed:
        return jsonify({'error': 'This table cannot be cleared'}), 400
    db = get_db()
    try:
        db.execute(f'DELETE FROM "{name}"')
        db.commit()
        return jsonify({'ok': True, 'table': name})
    except Exception as e:
        return jsonify({'error': _safe_err(e)}), 500

@app.route('/api/admin/users')
@admin_required
def admin_list_users():
    db = get_db()
    rows = db.execute(
        'SELECT id, username, display_name, role, created_at, last_login '
        'FROM users ORDER BY id ASC'
    ).fetchall()
    return jsonify([user_json(r) for r in rows])

@app.route('/api/admin/users/<int:uid>', methods=['PUT'])
@admin_required
def admin_update_user(uid):
    data = request.get_json() or {}
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = data.get('role')
    if role not in (None, 'admin', 'user'):
        return jsonify({'error': 'Invalid role'}), 400

    tools = data.get('allowed_tools')
    if tools is not None:
        if not isinstance(tools, list):
            return jsonify({'error': 'allowed_tools must be a list'}), 400
        tools = [t for t in tools if t in ALL_TOOLS]

    display_name = data.get('display_name')

    updates = []
    params = []
    if role is not None:
        updates.append('role = ?')
        params.append(role)
        if role == 'admin':
            tools = list(ALL_TOOLS)
    if tools is not None:
        updates.append('allowed_tools = ?')
        params.append(json.dumps(tools))
    if display_name is not None:
        updates.append('display_name = ?')
        params.append(str(display_name).strip()[:80] or user['username'])

    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400

    # No permitir quitar el último admin
    if role == 'user' and user['role'] == 'admin':
        admins = db.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").fetchone()['c']
        if admins <= 1:
            return jsonify({'error': 'You cannot remove the last administrator'}), 400

    params.append(uid)
    db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    row = db.execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()
    return jsonify({'ok': True, 'user': user_json(row)})

@app.route('/api/admin/users/<int:uid>', methods=['DELETE'])
@admin_required
def admin_delete_user(uid):
    if uid == current_user_id():
        return jsonify({'error': 'You cannot delete your own account'}), 400
    db = get_db()
    user = db.execute('SELECT role FROM users WHERE id = ?', (uid,)).fetchone()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    if user['role'] == 'admin':
        admins = db.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").fetchone()['c']
        if admins <= 1:
            return jsonify({'error': 'You cannot delete the last administrator'}), 400
    db.execute('DELETE FROM users WHERE id = ?', (uid,))
    db.commit()
    return jsonify({'ok': True})

# ═══════════════════════════════════════════════════════════════
# LOGS estáticos (para FeltLab auto-carga)
# ═══════════════════════════════════════════════════════════════
@app.route('/logs/<path:filename>')
@login_required
def serve_logs(filename):
    return send_from_directory(LOGS_DIR, filename)

# ═══════════════════════════════════════════════════════════════
# INICIO
# ═══════════════════════════════════════════════════════════════

@app.route('/favicon.ico')
def favicon():
    from flask import send_from_directory
    icons = os.path.join(app.root_path, 'static', 'icons')
    # Prefer PNG system icon (same as PWA / portal)
    for name in ('icon-192.png', 'icon-64.png', 'apple-touch-icon.png'):
        path = os.path.join(icons, name)
        if os.path.isfile(path):
            return send_from_directory(icons, name, mimetype='image/png')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<rect width="32" height="32" rx="8" fill="#0c1222"/>'
        '<text x="16" y="22" text-anchor="middle" font-size="18" fill="#f0c14b">♠</text>'
        '</svg>'
    )
    return app.response_class(svg, mimetype='image/svg+xml')


@app.route('/manifest.webmanifest')
def web_manifest():
    name = 'RangeLab'
    try:
        site = get_site_config()
        if isinstance(site, dict) and site.get('site_name'):
            name = site.get('site_name') or 'RangeLab'
    except Exception:
        pass
    icon = lambda src, sizes, purpose='any': {'src': src, 'sizes': sizes, 'type': 'image/png', 'purpose': purpose}
    shortcut = lambda label, url: {
        'name': label, 'short_name': label, 'url': url,
        'icons': [icon('/static/icons/icon-192.png', '192x192')]
    }
    payload = {
        'id': '/',
        'name': name,
        'short_name': name[:12] if name else 'RangeLab',
        'description': 'Self-hosted poker analysis suite',
        'lang': 'es',
        'start_url': '/',
        'scope': '/',
        'display': 'standalone',
        'orientation': 'any',
        'background_color': '#07090f',
        'theme_color': '#0c1222',
        'categories': ['games', 'productivity'],
        'icons': [
            icon('/static/icons/icon-64.png', '64x64'),
            icon('/static/icons/icon-192.png', '192x192'),
            icon('/static/icons/icon-512.png', '512x512'),
            icon('/static/icons/icon-512-maskable.png', '512x512', 'maskable'),
            {'src': '/static/icons/favicon.svg', 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'any'},
        ],
        'shortcuts': [
            shortcut('Equity Lab', '/tool/equity'),
            shortcut('Hand Lab', '/tool/feltlab'),
            shortcut('AI Table', '/tool/ailab'),
            shortcut('Bankroll Lab', '/tool/tracker'),
        ],
    }
    resp = jsonify(payload)
    resp.mimetype = 'application/manifest+json'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp

@app.route('/sw.js')
def service_worker():
    """Service Worker en raiz para scope / (offline shell)."""
    resp = send_from_directory(app.static_folder, 'sw.js')
    resp.headers['Content-Type'] = 'application/javascript; charset=utf-8'
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp




@app.route('/api/health')
def api_health():
    """Health check for monitoring / load balancers. No auth required."""
    try:
        db = get_db()
        db.execute('SELECT 1').fetchone()
        return jsonify({
            'ok': True,
            'service': 'RangeLab',
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': _safe_err(e)}), 503



# Bootstrap for gunicorn / WSGI (init once per worker)
try:
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(LOGS_DIR, exist_ok=True)
    init_db()
    _announce_setup_token()
except Exception as _boot_err:
    print('bootstrap warning:', _boot_err)

# ═══════════════════════════════════════════════════════════════
# COMPRESIÓN GZIP (HTML, CSS, JS, JSON, SVG). Sin dependencias extra.
# En el móvil reduce mucho el peso de carga (rangelab.css pasa de ~377 KB a una fracción).
# ═══════════════════════════════════════════════════════════════
import gzip as _gzip

_GZIP_TYPES = ('text/', 'application/javascript', 'application/json', 'image/svg+xml',
               'application/manifest+json')

@app.after_request
def _gzip_response(response):
    try:
        if response.status_code != 200 or response.headers.get('Content-Encoding'):
            return response
        if 'gzip' not in (request.headers.get('Accept-Encoding') or ''):
            return response
        mime = response.mimetype or ''
        if not any(mime.startswith(t) for t in _GZIP_TYPES):
            return response
        if response.direct_passthrough:
            response.direct_passthrough = False
        data = response.get_data()
        if len(data) < 860:
            return response
        response.set_data(_gzip.compress(data, compresslevel=6))
        response.headers['Content-Encoding'] = 'gzip'
        response.headers['Vary'] = 'Accept-Encoding'
        etag = response.headers.get('ETag')
        if etag and not etag.startswith('W/'):
            response.headers['ETag'] = 'W/' + etag   # la representación comprimida es distinta
    except Exception:
        pass
    return response


if __name__ == '__main__':
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(LOGS_DIR, exist_ok=True)
    init_db()
    host = os.environ.get('RANGELAB_HOST', '127.0.0.1').strip() or '127.0.0.1'
    try:
        port = int(os.environ.get('RANGELAB_PORT', '5000'))
    except ValueError:
        port = 5000
    print('═══════════════════════════════════════════')
    print(f'  RangeLab Suite v{APP_VERSION} — Servidor Flask')
    print(f'  Base de datos: {DB_PATH}')
    print(f'  Abre: http://{host}:{port}')
    print('═══════════════════════════════════════════')
    app.run(host=host, port=port, debug=False, use_reloader=False)