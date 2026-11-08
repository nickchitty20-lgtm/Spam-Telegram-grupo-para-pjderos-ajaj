# Únete, bb 💗 — landing para Telegram

Página publicitaria sencilla y responsive para compartir un enlace de grupo o canal de Telegram. No requiere base de datos, bots ni servicios externos.

## Variables de Railway

En tu servicio de Railway, abre **Variables** y agrega:

| Variable | Ejemplo | Obligatoria |
|---|---|---|
| `TELEGRAM_NAME` | `Zona Chat` | Recomendada |
| `TELEGRAM_LINK` | `https://t.me/TuCanal` o `https://t.me/+TuCodigo` | Sí |
| `BUTTON_TEXT` | `Únete, bb 💗` | No |

El enlace debe empezar por `https://t.me/` (también se admite `https://telegram.me/`). Si el enlace falta o no es válido, el botón se muestra desactivado.

## Desplegar en Railway

1. Sube el contenido a un repositorio de GitHub o conecta el proyecto a Railway.
2. Crea un servicio en Railway desde ese repositorio.
3. En **Variables**, añade `TELEGRAM_NAME` y `TELEGRAM_LINK`.
4. El comando de inicio es `npm start` (Railway suele detectarlo automáticamente).
5. En **Settings > Networking** crea un dominio público, si todavía no tienes uno.
6. Comparte esa URL. Para cambiar el canal o grupo, actualiza las variables y despliega la nueva configuración.

Railway establece `PORT` automáticamente; no necesitas configurarla manualmente.

## Ejecutar localmente

```bash
TELEGRAM_NAME="Zona Chat" TELEGRAM_LINK="https://t.me/TuCanal" npm start
```

Abre `http://localhost:3000`.

## Notas

- La vista previa al compartir incluye el nombre configurado mediante etiquetas Open Graph.
- Se han eliminado dependencias para mantener el proyecto pequeño.
- No recopila datos de visitantes ni tiene panel administrativo.
