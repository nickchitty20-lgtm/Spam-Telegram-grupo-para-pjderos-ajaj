# Únete BB v6.4 — Nick obligatorio + Acceso Gabriela corregido

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
| `LINK_ENABLED` | `true` | Interruptor general inicial; `false` inicia con botón apagado |
| `MIN_PLAYERS` | `3` | Mínimo de nicks conectados e inscritos para iniciar retos (de 2 a 20). |
| `LINK_MODE` | `exclusive` | Modo inicial: `exclusive` = Gabriela y los nicks autorizados, `public` = todos los nicks registrados salvo bloqueados |

El nombre `Gabriela` (sin importar mayúsculas y minúsculas) está reservado a una sola sesión. Cualquier otro nick también es exclusivo mientras esté conectado. Si defines `GABRIELA_PIN`, el servidor exige el PIN para reclamar Gabriela y nunca lo guarda en el navegador ni lo muestra en HTML.

## Controles de Gabriela

- Enviar animación global `GABRIELA — entra bb 💕`.
- **Habilitar para TODOS:** abre el botón a todos los visitantes con nick registrado de inmediato (reinicia permisos anteriores de nick). **Deshabilitar para TODOS:** bloquea el acceso para todos. **Solo nicks autorizados:** Gabriela y los habilitados por ella.
- Seleccionar un nick conectado y habilitarlo (enciende el enlace, activa modo exclusivo, y no habilita a los demás) o bloquearlo individualmente. El botón `/join` también valida en el servidor que el visitante tenga un nick registrado y esté conectado. **Gabriela siempre tiene acceso cuando el interruptor general está encendido**, aunque `LINK_MODE=exclusive` y todavía no haya sido seleccionada en la lista. Si una persona ya conoce la URL de Telegram, no es posible impedir que acceda directamente a Telegram.
- Activar tres retos: **primer clic** (el servidor recibe el primero), **toques en 10 segundos** (ranking actualizado) y **eliminatoria** (en cada ronda pasan los mejores 50%).
- Los retos se abren con 3 nicks conectados y comienzan con 3 participantes voluntariamente inscritos. Todos ven inscripciones, rondas, puntuaciones, eliminados y ganador. El reto y el panel están disponibles solo para usuarios con nick registrado; el control es exclusivo de Gabriela.

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

## Corrección del problema del botón deshabilitado

Se mantienen las correcciones previas: los permisos de Gabriela: ya no queda bloqueada en modo exclusivo. Además, el botón y la ruta `/join` exigen tener un nick activo, incluso si Gabriela habilita el acceso general. Los botones son explícitos y el servidor sincroniza al instante los estados mediante SSE. Si se quiere permitir únicamente a un nick, seleccionar ese nick y pulsar **Habilitar a este nick**: esta acción enciende el enlace automáticamente y cambia a modo exclusivo.

Si sigue mostrando `⚠️ TELEGRAM_LINK no está configurado`, colocar en Railway una URL válida que empiece por `https://t.me/`. Hay que desplegar la nueva versión en una sola réplica.

## Qué hacer si todavía se ve deshabilitado

1. Comprueba que `TELEGRAM_LINK` contiene una URL real del tipo `https://t.me/tu_grupo`.
2. Entra al chat con un nick (si eliges `Gabriela`, usa el PIN si está configurado).
3. En el panel de Gabriela pulsa «Habilitar para TODOS los nicks», o usa «Solo nicks autorizados» para limitarlo. Gabriela **no requiere permiso individual**.
4. Si tenías abierta la web antes de desplegar, recarga la página para cargar el JavaScript actualizado.
5. Comprueba que Railway está usando esta versión v6.3 y que solo hay una réplica.


## Cambios en v6.3 — nicks visibles para autorizar

En el panel de Gabriela ya no se utiliza una lista desplegable: aparece una **lista de tarjetas** con los nicks escritos por cada visitante que esté conectado y registrado. Pulsa un nombre para seleccionarlo; se resaltará y aparecerá debajo «Seleccionado: Nombre». Luego pulsa «Habilitar a este nick» o «Deshabilitar». Se mantienen los permisos y controles de la v6.2.

La lista se actualiza en vivo. Si no aparece algún nick, esa persona debe conectarse y registrar un nick (no basta con entrar sin elegir nombre). Si alguien decidió registrar un nick de solo números, se mostrará ese nick tal como lo registró.

Importante: reemplaza **todos** los archivos del ZIP, incluidos `public/index.html`, `public/app.js` y `public/style.css`. Después de desplegar, actualiza la página con Ctrl+F5 para evitar archivos viejos en caché.

## Cambios v6.4

El mínimo por defecto para abrir e iniciar los retos es **3**, en lugar de 7. Gabriela puede comenzar con 3 nicks conectados y 3 personas inscritas. Se puede cambiar desde Railway ajustando `MIN_PLAYERS` a un número entero entre 2 y 20 (el valor inicial es 3). Los mensajes del panel y la validación del servidor usan el mismo mínimo.
