# Cómo contribuir

¡Gracias por tu interés en RangeLab! Antes de empezar, lee la [licencia](LICENSE): las contribuciones se distribuyen bajo los mismos términos.

## Flujo de trabajo

1. Abre un *issue* describiendo el error o la mejora antes de trabajar en cambios grandes.
2. Haz un *fork* y crea una rama con nombre descriptivo (`fix/toast-movil`, `feat/nuevo-filtro`).
3. Haz los cambios manteniendo el estilo del código existente.
4. Ejecuta las pruebas: `python -m unittest discover -s tests -v`.
5. Abre un *pull request* usando la plantilla proporcionada.

## Reglas del proyecto

- **No subas datos personales**: nada de `data/`, `backups/`, `logs/`, `.secret_key`, bases de datos ni capturas con datos reales.
- **No añadas secretos** (claves, tokens, contraseñas) al código ni a la documentación.
- **Cambios de frontend**: si modificas archivos en `static/` (CSS, JS, iconos), incrementa `VERSION` en `static/sw.js` para que los navegadores y la app instalada reciban la nueva versión.
- **Dependencias**: añade nuevas librerías solo si son imprescindibles, con versión acotada en `requirements.txt` y su licencia en `THIRD_PARTY_NOTICES.md`.
- **Licencia**: no se aceptan cambios que introduzcan funciones de pago, paywalls o integraciones comerciales.

## Publicar una versión nueva

1. Actualiza `APP_VERSION` en `app.py`.
2. Actualiza la etiqueta de imagen en `docker-compose.yml`.
3. Si cambiaron archivos estáticos, incrementa `VERSION` en `static/sw.js`.
4. Añade la entrada correspondiente en `CHANGELOG.md`.
5. Crea la etiqueta en Git: `git tag v1.4.1` y publícala.
