# Únete BB v6 — Telegram + Chat + Retos en vivo

Proyecto Node.js sin dependencias externas. Solo una instancia/réplica de Railway. El chat, nick, contadores, permisos y retos viven en memoria: se reinician cuando Railway reinicia o redespliega el servicio.

## Configuración Railway → Variables

| Variable | Ejemplo | Uso |
|---|---|---|
| `TELEGRAM_NAME` | `Zona Femenina 💕` | Nombre del grupo |
| `TELEGRAM_LINK` | `https://t.me/tu_grupo` | Destino del enlace |
| `BUTTON_TEXT` | `Entra, bb 😘` | Texto del botón |
| `CHAT_TITLE` | `Chat en vivo 💬` | Título del chat |
| `CHAT_WELCOME` | `Ven al grupo, bb 💗` | Mensaje fijado |
| `GABRIELA_SHOUT` | `entra bb 💕` | Texto de la animación épica |
| `GABRIELA_PIN` | `tu_PIN_largo_y_privado` | Protege que alguien suplante a Gabriela. **Recomendado**. |
| `LINK_ENABLED` | `true` | Enlace activado globalmente al arrancar |
| `LINK_MODE` | `exclusive` | `exclusive`: botón deshabilitado salvo a nicks que Gabriela autoriza; `public`: botón habilitado para todos menos los que Gabriela bloquee |

El nombre `Gabriela` (sin importar mayúsculas y minúsculas) está reservado a una sola sesión. Cualquier otro nick también es exclusivo mientras esté conectado. Si defines `GABRIELA_PIN`, el servidor exige el PIN para reclamar Gabriela y nunca lo guarda en el navegador ni lo muestra en HTML.

## Controles de Gabriela

- Enviar animación global `GABRIELA — entra bb 💕`.
- Encender o apagar el enlace global para todos.
- Seleccionar un nick conectado y habilitar o bloquear **solo a ese visitante**. El botón `/join` también valida el permiso en servidor. Si una persona ya conoce la URL de Telegram, no es posible impedir que acceda directamente a Telegram.
- Activar tres retos: **primer clic** (el servidor recibe el primero), **toques en 10 segundos** (ranking actualizado) y **eliminatoria** (en cada ronda pasan los mejores 50%).
- Los retos se abren con 7 nicks conectados y comienzan con 7 participantes voluntariamente inscritos. Todos ven inscripciones, rondas, puntuaciones, eliminados y ganador. El reto y el panel están disponibles solo para usuarios con nick registrado; el control es exclusivo de Gabriela.

## Despliegue

1. Sube los archivos a un repositorio GitHub.
2. Crea un servicio en Railway desde ese repositorio.
3. Añade tus variables, en particular `TELEGRAM_LINK` y **`GABRIELA_PIN`**.
4. Railway iniciará usando `npm start`; en Settings → Networking genera un dominio público.
5. Mantén **una sola réplica**. Para múltiples réplicas o persistencia necesitarías Redis/DB y sincronización.

## Ejecutar local

```sh
npm install
npm start
```

Abre http://localhost:3000

**Nota de privacidad y seguridad:** Los nicks no son cuentas de usuario, por lo que no demuestran identidad fuera de la sesión activa. Un PIN para Gabriela evita que el primer visitante que use ese nick obtenga poderes administrativos. El contador mide navegadores conectados, no necesariamente personas únicas. El sitio evita mostrar la URL de Telegram a un usuario sin permiso, pero no puede revocar un enlace de Telegram que ya se haya conocido.
