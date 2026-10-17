# RangeLab — Guía de despliegue y venta (v1.1.0)

Documento listo para entregar al cliente o usar internamente al montar el producto en un servidor.

---

## 2. Requisitos del servidor

| Recurso | Mínimo recomendado |
|---------|-------------------|
| CPU | 1 vCPU |
| RAM | 1 GB (2 GB cómodo) |
| Disco | 10 GB SSD |
| SO | Ubuntu 22.04+ / Debian 12 / cualquier host con Docker |
| Puerto | 5000 (o el que mapees) + 80/443 si usas proxy |

---

## 3. Instalación con Docker (recomendado)

```bash
# 1. Copia la carpeta RangeLab al servidor
cd RangeLab

# 2. Construye y arranca
docker compose up -d --build

# 3. Abre en el navegador
# http://TU_IP:5000
```

La **primera visita** abre el **asistente de instalación** (`/setup`). Antes de empezar, copia el **token de instalación** que aparece en la consola (o en los logs del contenedor) al arrancar el servidor:

1. Nombre del sitio, marca, pie de página, email de contacto  
2. Registro abierto/cerrado  
3. Cuenta administradora (usuario + contraseña ≥ 8)  
4. **Instalar y entrar**

Después de instalar, `/setup` queda bloqueado.

### Variables útiles

| Variable | Default | Uso |
|----------|---------|-----|
| `RANGELAB_PORT` | `5000` | Puerto publicado en el host |
| `RANGELAB_HTTPS` | `0` | `1` si hay HTTPS (cookies Secure) |
| `RANGELAB_DB_PATH` | `/data/rangelab.db` | Ruta SQLite dentro del contenedor |
| `RANGELAB_SECRET_KEY` | (auto) | Clave de sesión fija (multi-réplica) |

Datos persistentes: volumen Docker `rangelab_data` (BD + `.secret_key`).

### Actualizar versión

```bash
docker compose down
# sustituye el código / imagen
docker compose up -d --build
```

La BD y la configuración del sitio se conservan en el volumen.

---

## 4. Instalación sin Docker (Python)

```bash
cd RangeLab
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export RANGELAB_HOST=0.0.0.0
export RANGELAB_PORT=5000
python app.py
```

O con Gunicorn:

```bash
gunicorn -b 0.0.0.0:5000 -w 2 --threads 4 --timeout 120 app:app
```

Windows embebido: `start.bat` (requiere `Python_Embedded`).

---

## 5. HTTPS con Caddy (ejemplo rápido)

```caddyfile
poker.tudominio.com {
    reverse_proxy 127.0.0.1:5000
}
```

En el compose / entorno: `RANGELAB_HTTPS=1`.

---

## 8. Seguridad

- Si usas proxy inverso, define `RANGELAB_TRUST_PROXY=1` para que el límite de intentos use la IP real.
- La carpeta `logs/` es accesible para cualquier usuario con sesión (la usa Hand Lab para la carga automática). Coloca solo archivos sin datos personales.
- Nunca subas `data/` (base de datos) ni `.secret_key` al repositorio: ya están excluidos en `.gitignore`.

- Contraseñas hasheadas (Werkzeug)
- Sesión `HttpOnly` + `SameSite=Lax` (+ `Secure` con HTTPS)
- APIs de tools de pago protegidas con permiso de herramienta
- Wizard de setup solo si no hay instalación
- Health: `GET /api/health`

**No** subir a repositorios públicos: `data/`, `.secret_key`, backups de BD.

**Nunca** copies `rangelab.db` a mano mientras RangeLab está funcionando: la base usa modo WAL y los datos recientes pueden estar en el archivo `-wal`, así que la copia puede quedar incompleta. Usa siempre el botón de copia del panel o `scripts/backup_db.py`, que usan la API de backup de SQLite y son seguros con el servidor en marcha.

---

## 9. Soporte técnico rápido

| Problema | Acción |
|----------|--------|
| Página en blanco / 503 setup | BD vacía o volumen mal montado; revisa logs |
| Olvidé la contraseña de admin | `python3 scripts/reset_admin_password.py <usuario>` (no borra datos) |
| Quiero recuperar una copia | Ver sección 11 · Restaurar copia |
| Cookies no persisten en HTTPS | `RANGELAB_HTTPS=1` |
| Disco lleno | Admin → BD → VACUUM; limpia `tool_usage`; revisa carpeta de copias |

Logs Docker: `docker compose logs -f rangelab`

---
