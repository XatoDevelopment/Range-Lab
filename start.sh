#!/usr/bin/env bash
# RangeLab — Linux / macOS launcher
set -euo pipefail
cd "$(dirname "$0")"

export PYTHONUTF8=1
PORT="${RANGELAB_PORT:-5000}"
HOST="${RANGELAB_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}/login"
PIDFILE="ranglab_server.pid"
LOGDIR="logs"

mkdir -p "$LOGDIR"

# Already running?
if curl -sf --max-time 1 "$URL" >/dev/null 2>&1; then
  echo "RangeLab ya está en marcha → $URL"
  command -v xdg-open >/dev/null && xdg-open "$URL" 2>/dev/null || true
  command -v open >/dev/null && open "$URL" 2>/dev/null || true
  exit 0
fi

# Prefer system python3
PYTHON="${RANGELAB_PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "ERROR: no se encuentra python3. Instala Python 3.10+ o define RANGELAB_PYTHON."
  exit 1
fi

# Optional: install deps if missing
if ! "$PYTHON" -c "import flask" 2>/dev/null; then
  echo "Instalando dependencias (flask)..."
  "$PYTHON" -m pip install -q -r requirements.txt || {
    echo "No se pudo instalar flask. Ejecuta: pip install -r requirements.txt"
    exit 1
  }
fi

echo "Iniciando RangeLab en $HOST:$PORT ..."
nohup "$PYTHON" app.py >> "$LOGDIR/server.log" 2>> "$LOGDIR/server_error.log" &
echo $! > "$PIDFILE"

# Wait for ready
for i in $(seq 1 30); do
  if curl -sf --max-time 1 "$URL" >/dev/null 2>&1; then
    echo "Listo → $URL"
    command -v xdg-open >/dev/null && xdg-open "$URL" 2>/dev/null || true
    command -v open >/dev/null && open "$URL" 2>/dev/null || true
    exit 0
  fi
  sleep 0.4
done

echo "El servidor no respondió a tiempo. Revisa $LOGDIR/server_error.log"
exit 1
