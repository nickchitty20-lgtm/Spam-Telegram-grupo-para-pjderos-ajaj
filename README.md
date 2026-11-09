# Únete BB v6.6 · La conquista de Gabriela 💘

Sitio promocional para Telegram con chat público sin cuentas, concursos en directo y permisos de acceso controlados por Gabriela. HTML5 + Node.js, sin dependencias externas ni base de datos.

## Cambios de la v6.6

- **📖 Instrucciones laterales:** botón junto al título del concurso, abre un panel deslizable con las reglas.
- **💘 La conquista de Gabriela:** temática de pretendientes, clasificación en directo y un finalista al acabar.
- **💌 Premiación manual:** Gabriela puede pulsar «Dar acceso privado al ganador» después de un reto; le concede el enlace únicamente al nick ganador, activando modo exclusivo. No se premia automáticamente.
- **🎮 Cinco minijuegos nuevos:** Código del coqueteo (preguntas sobre citas y respeto), Descifra los emojis, Secuencias del amor, Memoria de corazones (observar y recordar una secuencia) y Suerte del amor (adivinar un número secreto del servidor).
- **💬 Reto rompehielos:** desde que entran, los visitantes pueden generar frases/preguntas graciosas para conversar.
- **💗 Reacciones públicas:** corazón, fuego, enamorado y aplauso sincronizados con todas las sesiones, con limitación de spam.
- Conserva todos los juegos, contador con ojito, fondo animado, indicador de quién escribe, nicks únicos, controles de Gabriela, animación épica y acceso individual.

## Instalar en Railway

1. Sube el contenido **completo** de este ZIP a tu repositorio de GitHub (la carpeta `public` debe estar en la raíz, junto a `server.js` y `package.json`).
2. Crea un servicio web en Railway desde ese repositorio. Se usa `npm start` y el puerto `PORT` que asigna Railway.
3. Abre **Variables** e ingresa estas opciones:

| Variable | Ejemplo | Descripción |
| --- | --- | --- |
| `TELEGRAM_NAME` | `Zona Femenina` | Nombre visible de tu comunidad |
| `TELEGRAM_LINK` | `https://t.me/TuGrupo` | URL real de Telegram |
| `BUTTON_TEXT` | `Entra, bb 💗` | Texto del botón |
| `CHAT_TITLE` | `Chat en vivo 💬` | Título del chat |
| `CHAT_WELCOME` | `Participa en los concursos 💘` | Aviso destacado |
| `GABRIELA_SHOUT` | `Entra, bb 💕` | Texto de la animación global de Gabriela |
| `GABRIELA_PIN` | *elige un PIN privado y largo* | Protege los controles de Gabriela; **muy recomendado** |
| `LINK_MODE` | `exclusive` | `exclusive`: Gabriela autoriza nicks; `public`: todos los nicks registrados pueden entrar |
| `LINK_ENABLED` | `true` | Estado inicial del botón |
| `MIN_PLAYERS` | `3` | Cantidad mínima de inscritos y nicks en línea para iniciar (2–20) |

4. Despliega y abre el dominio de Railway. Si cambias de versión, vuelve a desplegar y fuerza la recarga del navegador (`Ctrl+F5`).

## Cómo jugar

1. Los visitantes entran a la web, leen las reglas con el botón **📖 Instrucciones**, y se identifican solo con un nick único en el chat. Se puede mirar y reaccionar sin nick, pero para concursar y abrir el enlace hay que registrarlo.
2. Gabriela entra con su nick **Gabriela** y su PIN. Selecciona un concurso y abre inscripciones.
3. Los jugadores inscritos ven las preguntas, el marcador y el cronómetro en directo. Los nuevos juegos se disputan en tres rondas. En el juego **Memoria** primero aparece la secuencia durante unos segundos y después la pregunta.
4. El resultado final identifica un **finalista** y se anuncia públicamente. **Ganar no garantiza invitación**: Gabriela puede pulsar «💌 Dar acceso privado al ganador» para autorizarlo o usar su lista de nicks para elegir otra persona.
5. El enlace `/join` siempre valida el permiso del visitante en el servidor antes de redirigir a Telegram.

## Consideraciones

- Solo se recomienda **una réplica** del servicio en Railway: el chat, contador, permisos, inscritos y resultados viven en RAM y se reinician cuando la aplicación se reinicia o redistribuye.
- Los nicks no requieren contraseña; **Gabriela sí debería tener PIN**. Los nicks comunes no verifican identidad y pueden perderse al desconectarse.
- Las invitaciones de Telegram compartidas directamente fuera de la web **no están controladas por estos permisos**. Si el enlace se filtra, tendrías que cambiarlo desde Telegram o aplicar aprobación de miembros en Telegram. Autorizar en esta web tampoco revoca membresías ya concedidas.
- La web no promete una relación sentimental real ni un premio garantizado. Son concursos recreativos y Gabriela decide a quién invitar.
- Para evitar abuso, se limita la frecuencia de mensajes, acciones y reacciones; no se reproducen sonidos automáticos.

## Ejecutar localmente

Necesitas Node.js 18 o superior.

```bash
npm start
```

Visita `http://localhost:3000`. No requiere `npm install` porque no tiene dependencias externas.
