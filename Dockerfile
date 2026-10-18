# RangeLab Suite — production image
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    RANGELAB_HOST=0.0.0.0 \
    RANGELAB_PORT=5000 \
    RANGELAB_DB_PATH=/data/rangelab.db

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY templates/ templates/
COPY static/ static/

RUN mkdir -p /data /app/logs \
    && useradd -r -u 10001 -g root rangelab \
    && chown -R rangelab:root /data /app/logs

USER rangelab

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://127.0.0.1:5000/api/health || exit 1

# Gunicorn: 2 workers, threads for SQLite-friendly load
CMD ["gunicorn", "-b", "0.0.0.0:5000", "-w", "2", "--threads", "4", \
     "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", \
     "app:app"]
