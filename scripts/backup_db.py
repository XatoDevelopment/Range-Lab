#!/usr/bin/env python3
"""
RangeLab — copia de seguridad de la base de datos (segura con el servidor en marcha).

NO copies rangelab.db a mano mientras RangeLab funciona: la base usa modo WAL y
parte de los datos recientes están en el archivo *-wal, así que la copia puede
quedar incompleta. Este script usa la API de backup de SQLite, que genera una
copia consistente.

Uso:
  python3 scripts/backup_db.py                      # copia en ./backups
  python3 scripts/backup_db.py --dest /ruta --keep 30
  RANGELAB_DB_PATH=/datos/rangelab.db python3 scripts/backup_db.py

Programación sugerida (Linux/macOS, cada noche a las 3:00):
  0 3 * * * cd /ruta/RangeLab && python3 scripts/backup_db.py --dest /ruta/backups
Windows: Programador de tareas → ejecutar `python scripts\\backup_db.py --dest C:\\copias`.

Códigos de salida: 0 = copia correcta, 1 = error (ver mensaje).
"""
import argparse
import datetime as dt
import glob
import os
import sqlite3
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEFAULT_DB = os.environ.get('RANGELAB_DB_PATH', '').strip() or os.path.join(BASE_DIR, 'data', 'rangelab.db')


def backup(db_path, dest_dir, keep):
    if not os.path.isfile(db_path):
        raise SystemExit(f'ERROR: no existe la base de datos: {db_path}')
    os.makedirs(dest_dir, exist_ok=True)

    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    out = os.path.join(dest_dir, f'rangelab-{stamp}.db')
    tmp = out + '.partial'

    src = sqlite3.connect(db_path, timeout=30)
    dst = sqlite3.connect(tmp)
    try:
        src.backup(dst)
        result = dst.execute('PRAGMA integrity_check').fetchone()[0]
        if result != 'ok':
            raise SystemExit(f'ERROR: la copia no supera integrity_check: {result}')
    finally:
        dst.close()
        src.close()
    os.replace(tmp, out)

    # Retención: conserva las últimas N copias
    copies = sorted(glob.glob(os.path.join(dest_dir, 'rangelab-*.db')))
    removed = 0
    for old in copies[:-keep] if keep > 0 else []:
        os.remove(old)
        removed += 1

    size_kb = os.path.getsize(out) // 1024
    print(f'OK  {out}  ({size_kb} KB)  · copias conservadas: {min(len(copies), keep)}'
          + (f' · antiguas borradas: {removed}' if removed else ''))
    return out


def main():
    ap = argparse.ArgumentParser(description='Copia de seguridad de RangeLab')
    ap.add_argument('--db', default=DEFAULT_DB, help='ruta de rangelab.db')
    ap.add_argument('--dest', default=os.path.join(BASE_DIR, 'backups'), help='carpeta de destino')
    ap.add_argument('--keep', type=int, default=14, help='número de copias a conservar (0 = todas)')
    args = ap.parse_args()
    try:
        backup(args.db, args.dest, args.keep)
    except SystemExit:
        raise
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
