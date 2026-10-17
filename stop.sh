#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PIDFILE="ranglab_server.pid"

if [[ ! -f "$PIDFILE" ]]; then
  echo "RangeLab no tiene un PID registrado."
  exit 0
fi

PID=$(cat "$PIDFILE" 2>/dev/null || true)
if [[ -z "${PID:-}" ]]; then
  rm -f "$PIDFILE"
  exit 0
fi

echo "Cerrando RangeLab (PID $PID)..."
kill "$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null || true
rm -f "$PIDFILE"
echo "RangeLab cerrado."
