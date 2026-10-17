#!/usr/bin/env python3
"""
RangeLab — restablecer la contraseña de un usuario (p. ej. el administrador) SIN borrar datos.

Uso (con el servidor parado o en marcha):
  python3 scripts/reset_admin_password.py <usuario>
  (pide la nueva contraseña sin mostrarla; mínimo 8 caracteres)

  RANGELAB_DB_PATH=/datos/rangelab.db python3 scripts/reset_admin_password.py admin
"""
import getpass
import os
import sqlite3
import sys

from werkzeug.security import generate_password_hash

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB = os.environ.get('RANGELAB_DB_PATH', '').strip() or os.path.join(BASE_DIR, 'data', 'rangelab.db')


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    username = sys.argv[1].strip().lower()
    if not os.path.isfile(DB):
        print(f'ERROR: no existe la base de datos: {DB}')
        sys.exit(1)

    conn = sqlite3.connect(DB, timeout=30)
    row = conn.execute('SELECT id, role FROM users WHERE username = ?', (username,)).fetchone()
    if not row:
        print(f'ERROR: no existe el usuario "{username}"')
        sys.exit(1)

    pw1 = getpass.getpass('Nueva contraseña: ')
    pw2 = getpass.getpass('Repite la contraseña: ')
    if pw1 != pw2:
        print('ERROR: las contraseñas no coinciden')
        sys.exit(1)
    if len(pw1) < 8:
        print('ERROR: la contraseña debe tener al menos 8 caracteres')
        sys.exit(1)

    conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (generate_password_hash(pw1), row[0]))
    conn.commit()
    conn.close()
    print(f'OK: contraseña de "{username}" actualizada (rol: {row[1]}). Los datos no se han tocado.')


if __name__ == '__main__':
    main()
