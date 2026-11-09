# Únete BB v5.0 — Railway

Página de promoción de Telegram con chat en vivo, nick sin registro, contador de visitantes, fondo animado y **modo Gabriela**.

## Cambios de esta versión

- Gabriela dispone de los botones **🔒 Deshabilitar enlace** y **🔓 Habilitar enlace** dentro del chat.
- Los cambios llegan al instante a todos los navegadores conectados mediante eventos en vivo (Server-Sent Events).
- Mientras el enlace está deshabilitado, el botón principal se desactiva, desaparece el enlace de invitación en el chat y también se bloquea el acceso a `/join` en el servidor.
- Solo la sesión que tiene reservado el nick `Gabriela` puede activar el botón de la animación épica y cambiar el estado del enlace.
- Si se libera `Gabriela` o se desconecta el último navegador de esa sesión, el nick queda disponible para otra persona.
- El resto del chat sigue funcionando aunque el enlace de Telegram esté deshabilitado.

## Variables en Railway

| Variable | Ejemplo | Obligatoria |
| --- | --- | --- |
| `TELEGRAM_NAME` | `Zona Femenina 💗` | Recomendada |
| `TELEGRAM_LINK` | `https://t.me/TuGrupo` | Sí, para habilitar el botón |
| `BUTTON_TEXT` | `Entra, bb 😈💗` | No |
| `CHAT_TITLE` | `Chat en vivo 💬` | No |
| `CHAT_WELCOME` | `Únete a nuestro grupo 💕` | No |
| `GABRIELA_SHOUT` | `entra bb 💕` | No |
| `LINK_ENABLED` | `true` o `false` | No, por defecto `true` |

`LINK_ENABLED` controla el estado **inicial** al arrancar. Gabriela puede cambiarlo cuando el sitio está funcionando.

## Despliegue

1. Descomprime este ZIP y sube los archivos a tu repositorio de GitHub.
2. Vincula el repositorio a Railway y crea un servicio Node.js.
3. Establece las variables de entorno.
4. Inicia con `npm start` (Railway puede detectarlo automáticamente).
5. Abre el dominio que Railway genera para tu servicio.

Para probar en tu equipo: `npm start` y después abre http://localhost:3000.

## Límites a tener en cuenta

- **Sin inicio de sesión**, cualquier persona que tome primero el nick `Gabriela` podrá usar esos controles. Esto no verifica la identidad real de Gabriela. Si necesitas que solo una persona concreta lo pueda usar, conviene añadir un PIN privado.
- El chat, el contador y el estado activado/desactivado se guardan solo en memoria. Al reiniciar o redesplegar Railway se borran los mensajes y el estado del enlace vuelve a lo configurado por `LINK_ENABLED`.
- Usa **una sola réplica de Railway** para mantener el chat y los controles sincronizados sin base de datos.
- El contador representa navegadores conectados aproximadamente, no garantiza individuos únicos.
