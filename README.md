# Únete, bb 💗 — landing + chat en vivo para Railway

Página publicitaria para compartir un grupo o canal de Telegram, con chat público en vivo debajo del botón, un contador 👁️ de conectados y fondo rosa/violeta animado. Los visitantes **no necesitan registrarse**: escriben un nick (2–22 caracteres) y ya pueden enviar mensajes. Los mensajes nuevos y el contador 👁️ se actualizan al instante con Server-Sent Events (SSE). No usa dependencias externas ni base de datos.

## Variables en Railway

| Variable | Ejemplo | Descripción |
|---|---|---|
| `TELEGRAM_NAME` | `Zona Chat` | Nombre de tu comunidad |
| `TELEGRAM_LINK` | `https://t.me/TuCanal` | Destino del botón |
| `BUTTON_TEXT` | `Entra, bb 😈💗` | Texto del botón principal y el enlace de la invitación en el chat |
| `CHAT_TITLE` | `Chat en vivo 💬` | Título del chat (opcional) |
| `CHAT_WELCOME` | `¡Hola, bb! 💕 Únete al Telegram y saluda por aquí.` | Mensaje destacado firmado como **Mensaje de la página** (opcional) |

El enlace tiene que apuntar a `https://t.me/` o `https://telegram.me/`. Si no es válido, el botón aparece desactivado.

## Desplegar en Railway

1. Sube estos archivos a un repositorio GitHub (o utiliza el despliegue por CLI de Railway).
2. Crea un servicio en Railway a partir del repositorio.
3. En **Variables**, configura `TELEGRAM_NAME`, `TELEGRAM_LINK` y las opcionales que quieras.
4. Railway iniciará la app con `npm start` y definirá `PORT` automáticamente.
5. En **Settings → Networking**, crea un dominio público y comparte el enlace.

Si cambias las variables, Railway volverá a desplegar la app con los nuevos textos.

## Probar en local

Con Node.js 18 o superior:

```bash
TELEGRAM_NAME='Mi grupo' TELEGRAM_LINK='https://t.me/mi_grupo' npm start
```

Abre `http://localhost:3000` en dos pestañas para probar mensajes entre usuarios.

## Contador 👁️ y fondo animado

El ojo muestra las **sesiones de navegador que siguen conectadas al chat ahora mismo**, sin números simulados. Varias pestañas del mismo navegador normalmente se cuentan una sola vez. Si alguien pierde conexión, el número se actualiza al reconectar o cerrar el canal SSE. No es una medida exacta de personas físicas (una persona puede usar distintos dispositivos, y un bot también puede conectarse).

El fondo incluye auroras rosadas/violetas animadas y puntitos suaves. Respeta la preferencia de accesibilidad **reducir movimiento** y no necesita servicios ni imágenes de terceros.

## Avisos importantes

- **El chat es real, no simulado:** el mensaje fijado es un anuncio del sitio, no testimonios falsos.
- **Mensajes temporales:** se guardan solo en RAM (máximo 100). Un reinicio, cambio de variables o nuevo despliegue borra el historial. Si quieres historial permanente o escalado en múltiples instancias, hay que conectar Redis o una base de datos.
- Usa **una sola réplica de Railway** para que todos vean los mismos mensajes. Si se despliegan varias réplicas, cada una tendría su propio chat.
- El nick no prueba la identidad de nadie: cualquiera puede escoger el mismo. No compartas datos sensibles en el chat.
- Antispam básico: 1 mensaje cada ~3.5 segundos por dirección de conexión, 240 caracteres máximo por mensaje. No hay moderación avanzada; conviene agregarla si el sitio crece.
- El servidor mantiene direcciones de conexión temporalmente en memoria para limitar envíos, pero no las escribe en el historial de mensajes.
