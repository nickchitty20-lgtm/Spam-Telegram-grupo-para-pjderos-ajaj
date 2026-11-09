# Únete BB v7.0 — La conquista de Gabriela 💘

Sitio web en Node.js + HTML5 listo para Railway. Mantiene el chat público, nicks únicos, contador en línea, indicador de escritura, animación de Gabriela, permisos individuales del enlace, minijuegos, finales y clasificación en tiempo real de la v6.6. Añade votaciones, mensajes privados, multimedia temporal y controles de Telegram para Gabriela.

## 🚀 Subir a Railway

1. Sube **todos** los archivos de este ZIP a un repositorio de GitHub, manteniendo la carpeta `public` al lado de `server.js`, `extras.js` y `package.json`.
2. Conecta el repositorio a un servicio web de Railway. Railway ejecuta `npm start` y asigna automáticamente `PORT`.
3. Configura tus variables en **Railway → Variables**:

| Variable | Ejemplo | Para qué sirve |
|---|---|---|
| `TELEGRAM_NAME` | `Zona Femenina` | Nombre de la comunidad |
| `TELEGRAM_LINK` | `https://t.me/TuGrupo` | Enlace inicial del grupo (retrocompatible) |
| `TELEGRAM_GROUP_LINK` | `https://t.me/TuGrupo` | Enlace de grupo/canal, tiene prioridad sobre `TELEGRAM_LINK` |
| `TELEGRAM_USER_LINK` | `https://t.me/TuUsuario` | Tu usuario personal de Telegram |
| `BUTTON_TEXT` | `Únete, bb 💗` | Texto del botón principal |
| `CHAT_TITLE` | `Chat en vivo 💬` | Encabezado del chat |
| `CHAT_WELCOME` | `¡Bienvenido, bb! 💘` | Mensaje destacado inicial |
| `GABRIELA_SHOUT` | `Entra bb 💕` | Frase de la animación épica |
| `GABRIELA_PIN` | `una-frase-secreta-larga` | **OBLIGATORIA** para reclamar el nick Gabriela y acceder al panel administrativo |
| `LINK_MODE` | `exclusive` | `exclusive`: solo Gabriela y nicks autorizados. `public`: todos los nicks registrados, salvo bloqueados |
| `LINK_ENABLED` | `true` | Estado general inicial del enlace |
| `MIN_PLAYERS` | `3` | Mínimo de inscritos para iniciar concursos (2 a 20) |

4. Despliega tu web. Entra con el nick exacto **Gabriela** y con tu PIN. Los demás usuarios solo necesitan un nick, sin iniciar sesión.
5. Para actualizar desde v6.6, **reemplaza también todos los archivos de `public`** y añade el archivo nuevo `extras.js`. Haz un nuevo despliegue y recarga la web con `Ctrl+F5`.

## 👑 Nuevas funciones de Gabriela

### ✈️ Cambiar destino del enlace

Hay dos destinos: **grupo/canal** o **usuario personal** de Telegram. Ambos se pueden configurar desde Railway o editar en tu panel. Los botones «Usar grupo» y «Usar mi usuario» cambian en tiempo real el destino del botón `/join` para los visitantes autorizados. Sigue siendo obligatorio registrar un nick antes de entrar. Los permisos de enlace público, exclusivo y por nick se mantienen.

### 🗳️ Votaciones en vivo

Gabriela escribe una pregunta y de dos a cinco opciones, selecciona 30 s, 60 s, 2 min o 5 min y abre la votación. Todos observan la encuesta y el recuento en vivo; los nicks registrados emiten **un voto por sesión**. Se puede cerrar manualmente; una encuesta nueva sustituye la anterior.

### 📣 Anuncios para todos

Gabriela escribe un anuncio y elige entre 5 y 90 segundos. Aparece una pantalla emergente para todos los que están conectados, con barra de duración y opción de cerrar. También puede **fijar un mensaje** debajo del aviso del chat y cambiarlo en cualquier momento. Los recién llegados ven el anuncio mientras todavía esté vigente.

### 💌 Foto o video exclusivamente para un nick

Gabriela selecciona un nick en la lista, elige una foto/video y asigna 10, 30 o cualquier duración de **5 a 120 segundos**. Solo esa **sesión** recibe el evento y puede obtener el archivo temporal desde una ruta protegida (`/api/media/<id>`). El archivo no aparece en el chat público ni en la encuesta; se muestra superpuesto en la pantalla del destinatario y desaparece al agotarse el plazo. Se cierra también al cambiar el nick.

### 💬 Buzón privado temporal

Gabriela puede activar/desactivar los mensajes privados y, por separado, el permiso para recibir fotos/videos. Los visitantes con nick ven el formulario **solo mientras se habilite**. Gabriela ve su bandeja privada y puede responder por texto o foto/video eligiendo el nick. Estos mensajes **no se publican** en el chat general ni se envían a otros visitantes.

### 🛡️ Moderación y sorpresas

Gabriela puede silenciar un nick por 5 minutos, quitar el silencio, organizar un sorteo público aleatorio entre nicks conectados, fijar un aviso, lanzar la animación épica y conceder acceso privado al finalista de los concursos.

## 📸 Archivos multimedia y limitaciones reales

- Imágenes permitidas: **JPG, PNG, GIF, WebP** hasta **8 MB**.
- Videos permitidos: **MP4 y WebM** hasta **16 MB**.
- Se reconocen por la cabecera del archivo (no se permite subir HTML, SVG ni otros formatos ejecutables).
- Fotos/videos mostrados a un nick expiran en **5–120 segundos**. Los archivos del buzón privado caducan en **20 minutos**.
- No hay botón de descargar en la interfaz de contenido temporal; se deshabilitan opciones de descarga visibles de video y el clic derecho sobre ese visor. El servidor envía `Cache-Control: no-store` y comprueba la cookie de sesión y el nick en cada solicitud.
- **IMPORTANTE: ninguna aplicación web puede impedir al 100 % que el destinatario capture, grabe o copie contenido que llega a su dispositivo.** La expiración y los controles de pantalla *no* hacen imposible guardar el contenido.
- Los archivos multimedia y mensajes privados viven **en memoria RAM del servidor**, sin cifrado de extremo a extremo, base de datos ni almacenamiento permanente configurado. Se pierden al reiniciar o redesplegar. El contenido puede permanecer accesible al destinatario hasta su expiración, y un usuario puede conservar capturas por su cuenta.

## 🔐 Seguridad y funcionamiento

- El PIN secreto de Gabriela es obligatorio en esta versión; no lo pongas en el repositorio. Bloqueo temporal tras 5 intentos erróneos por sesión.
- El nick de los visitantes no verifica identidad real. Los nicks se reservan solo mientras la sesión está conectada y hay un pequeño periodo de reconexión. Las votaciones aplican un voto por sesión de navegador, no por persona física.
- La ruta `/join` verifica que el visitante tenga un nick y el permiso correspondiente antes de redirigir a Telegram. Si el enlace de invitación de Telegram ya es conocido por fuera de esta web, esta página no puede bloquearlo; considera activar solicitudes de unión desde Telegram.
- Los envíos se limitan por frecuencia y tamaño. Los archivos tienen una capacidad total máxima en memoria de 48 MB.
- Funciona con **una sola réplica de Railway**. Chat, votos, medios, permisos y resultados viven en RAM de esa réplica y se reinician tras un despliegue; varias réplicas podrían desincronizar sesiones.
- Usa HTTPS (Railway proporciona HTTPS con sus dominios públicos) y publica reglas de uso para evitar compartir contenido personal de terceros sin su consentimiento.
- El servidor no ofrece garantías de disponibilidad, respaldo ni cifrado extremo a extremo: es un prototipo funcional, no un servicio de mensajería privada de alta seguridad.

## 🧪 Ejecutar en local

Requiere Node.js 18 o superior.

```bash
# configura GABRIELA_PIN y al menos uno de los enlaces en tu entorno
npm start
```

Visita `http://localhost:3000`. No necesitas instalar paquetes: todo usa librerías incluidas en Node.js.

Para comprobar sintaxis de JavaScript: `npm test`.
