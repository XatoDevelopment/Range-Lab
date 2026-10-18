# RangeLab Suite

Suite de herramientas de análisis de póker con código fuente disponible. Funciona en tu propio servidor con Python y Flask, y se usa desde el navegador en PC y móvil (también instalable como app).

## Herramientas

- **Equity Lab**: cálculo de equity entre manos y rangos.
- **Preflop Lab**: estudio de rangos y decisiones preflop.
- **Bankroll Lab**: control de bankroll, sesiones y resultados.
- **Hand Lab**: importación, revisión y análisis de manos.
- **Range Lab**: analizador de rangos.
- **MTT Exploiter**: análisis y explotación en torneos multimesa.
- **AI Table**: mesa de práctica contra rivales controlados por IA, calibrada con tus estadísticas de Hand Lab.
- **Tournament Lab**: calculadora de torneos.

## Arranque rápido

Requisitos: Python 3.10 o superior.

```bash
pip install -r requirements.txt
python app.py
```

Después abre `http://localhost:5000`. La primera visita abre el asistente de instalación (`/setup`), donde se crea la cuenta de administrador. El asistente pide un **token de instalación** que se muestra en la consola del servidor al arrancar.

También puedes usar `start.sh` / `start.bat`, o Docker (`docker compose up -d`). Consulta [DEPLOY.md](DEPLOY.md) para instalación en servidor, HTTPS y mantenimiento.

## Variables de entorno

| Variable | Uso |
|---|---|
| `RANGELAB_PORT` | Puerto del servidor (por defecto 5000) |
| `RANGELAB_DB_PATH` | Ruta del archivo SQLite (por defecto `data/rangelab.db`) |
| `RANGELAB_HTTPS` | `1` para activar la cookie segura detrás de HTTPS |
| `RANGELAB_TRUST_PROXY` | `1` si el servidor está detrás de un proxy inverso (Nginx, Caddy): usa la IP real del cliente |
| `RANGELAB_SECRET_KEY` | Clave de sesión (opcional; si no se define se genera y guarda en el servidor) |

## Datos y privacidad

Los datos de usuario (base de datos, claves y copias de seguridad) se guardan localmente en `data/` y en `backups/`. Estas carpetas están excluidas del repositorio y nunca deben subirse a GitHub.

## Desarrollo

```bash
pip install -r requirements.txt
python -m unittest discover -s tests -v
```

Para contribuir, lee [CONTRIBUTING.md](CONTRIBUTING.md). Los cambios de versión y el historial están en [CHANGELOG.md](CHANGELOG.md). Para reportar una vulnerabilidad de seguridad, sigue las instrucciones de [SECURITY.md](SECURITY.md) en lugar de abrir un issue público.

## Estructura

```
app.py              Servidor Flask (rutas, API, base de datos)
templates/          Plantillas HTML de cada herramienta
static/             CSS, JavaScript, iconos y service worker (PWA)
scripts/            Utilidades: copias de seguridad y reset de contraseña de admin
tests/              Pruebas de humo
```

## Contribuir

Las contribuciones son bienvenidas: abre un *issue* para reportar errores o proponer mejoras, y un *pull request* con los cambios. Mantén el estilo del código existente y prueba el cambio antes de enviarlo.

## Donaciones

RangeLab es gratuito. Si te resulta útil y quieres apoyar su desarrollo, puedes hacer una donación voluntaria. Las donaciones no son obligatorias para usar el software.

## Desarrollador

RangeLab está desarrollado por **XatoDev** · contacto: [xatodev.contacto@gmail.com](mailto:xatodev.contacto@gmail.com)

## Licencia

Distribuido bajo la **RangeLab Non-Commercial License** (ver [LICENSE](LICENSE)). Puedes usar, modificar y compartir el software libremente para fines no comerciales. No está permitido venderlo, cobrar por él ni integrarlo en productos o servicios de pago sin acuerdo previo con el autor.

Las librerías de terceros conservan su propia licencia; consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
