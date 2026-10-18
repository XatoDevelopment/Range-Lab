# Política de seguridad

## Reportar una vulnerabilidad

**No abras un issue público** para vulnerabilidades de seguridad. Envía los detalles por correo a **xatodev.contacto@gmail.com** con el asunto `[RangeLab Security]`.

Incluye, si es posible:
- Versión afectada y pasos para reproducirla.
- Impacto estimado.
- Propuesta de solución, si la tienes.

Intentaremos responder en un plazo razonable y coordinar la publicación del parche antes de hacer pública la información.

## Versiones soportadas

Solo la última versión publicada recibe correcciones de seguridad.

## Buenas prácticas de despliegue

- Usa HTTPS delante del servidor (Caddy, Nginx o similar) y activa `RANGELAB_HTTPS=1`.
- Si hay proxy inverso, activa `RANGELAB_TRUST_PROXY=1`.
- Fija `RANGELAB_SECRET_KEY` en entornos con varias réplicas.
- Haz copias de seguridad periódicas con `scripts/backup_db.py` y guárdalas fuera del servidor.
