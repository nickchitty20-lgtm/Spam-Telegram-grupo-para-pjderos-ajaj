'use strict';

// Página promocional + chat anónimo en vivo, sin dependencias externas.
const http = require('node:http');
const crypto = require('node:crypto');

const port = Number(process.env.PORT) || 3000;
const name = (process.env.TELEGRAM_NAME || 'Mi comunidad').trim().slice(0, 70);
const rawLink = (process.env.TELEGRAM_LINK || '').trim();
const cta = (process.env.BUTTON_TEXT || 'Únete, bb 💗').trim().slice(0, 75);
const chatTitle = (process.env.CHAT_TITLE || 'Chat en vivo 💬').trim().slice(0, 70);
const chatWelcome = (process.env.CHAT_WELCOME || '¿Qué esperas, bb? 💕 Únete a nuestro Telegram desde el botón de arriba y salúdanos por aquí.').trim().slice(0, 280);

function safeTelegramLink(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'].includes(url.hostname.toLowerCase())) return '';
    if (!url.pathname || url.pathname === '/' || url.username || url.password) return '';
    return url.toString();
  } catch { return ''; }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
const telegramLink = safeTelegramLink(rawLink);
const safeName = escapeHtml(name);
const safeCta = escapeHtml(cta);
const safeLink = escapeHtml(telegramLink);
const title = `${safeName} | Únete, bb 💗`;

// El historial vive solo en esta instancia. Se reinicia al redesplegar Railway.
const clients = new Map(); // respuesta SSE -> id efímero del navegador (para no contar pestañas duplicadas)
const history = [];
const lastMessageByIp = new Map();
const MAX_MESSAGES = 100;
const COOLDOWN_MS = 3500;
const MAX_CONNECTIONS = 250;
function normalize(value, length) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length)
    : '';
}
function sendSSE(res, event, payload) {
  if (res.destroyed || res.writableEnded) return false;
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); return true; }
  catch { return false; }
}
function broadcast(event, payload) {
  for (const client of clients.keys()) {
    if (!sendSSE(client, event, payload)) clients.delete(client);
  }
}
function broadcastPresence() {
  // Visitas con conexión SSE abierta. Distintas pestañas de un mismo navegador cuentan una vez.
  const online = new Set(clients.values()).size;
  broadcast('presence', { online });
}
function json(res, status, data, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(data));
}

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#20101f" />
<meta name="description" content="Entra a ${safeName} en Telegram 💗" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="Un clic y estás dentro 💌 ¡Únete a nuestra comunidad en Telegram!" />
<title>${title}</title>
<style>
:root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
* { box-sizing: border-box; }
body { min-height:100vh; margin:0; padding:24px 14px 36px; background:#110b1a; color:#fff; overflow-x:hidden; }
/* Fondo animado de auroras difusas, sin imágenes ni librerías externas. */
.ambient { position:fixed; inset:0; z-index:0; overflow:hidden; pointer-events:none; background:radial-gradient(circle at 15% 15%,#4e224b 0,transparent 40%),radial-gradient(circle at 88% 80%,#242653 0,transparent 48%); animation:ambient-hue 18s ease-in-out infinite alternate; }
.orb { position:absolute; width:55vw; height:55vw; max-width:440px; max-height:440px; min-width:240px; min-height:240px; border-radius:50%; filter:blur(28px); opacity:.44; will-change:transform; }
.orb-one { top:-120px; left:-110px; background:radial-gradient(circle,#f13a8a9c,transparent 68%); animation:orb-one 20s ease-in-out infinite alternate; }
.orb-two { right:-130px; top:27%; background:radial-gradient(circle,#8a42e4aa,transparent 68%); animation:orb-two 25s ease-in-out infinite alternate; }
.orb-three { bottom:-210px; left:6%; background:radial-gradient(circle,#f5629a66,transparent 66%); animation:orb-three 23s ease-in-out infinite alternate; }
.stardust { position:absolute; inset:0; opacity:.42; background-image:radial-gradient(#ffdaee 1px, transparent 1px),radial-gradient(#f9a9ff 1px,transparent 1px); background-size:105px 115px,165px 177px; background-position:0 0,45px 70px; animation:stardust 30s linear infinite; }
@keyframes ambient-hue { to { filter:hue-rotate(18deg); } }
@keyframes orb-one { to { transform:translate(35vw,24vh) scale(1.22); } }
@keyframes orb-two { to { transform:translate(-33vw,-25vh) scale(.84); } }
@keyframes orb-three { to { transform:translate(20vw,-30vh) scale(1.12); } }
@keyframes stardust { to { background-position:80px -135px,-55px -170px; } }
@media (prefers-reduced-motion:reduce) { .ambient,.orb,.stardust { animation:none !important; } }
.page { position:relative; z-index:1; width:min(100%,460px); margin:0 auto; }
.card { border:1px solid #ffffff25; border-radius:24px; background:#ffffff0d; box-shadow:0 24px 70px #0004; backdrop-filter:blur(10px); }
.hero { padding:32px 23px 23px; text-align:center; }
.badge { display:inline-block; padding:7px 12px; background:#fa4e961c; border:1px solid #fa8dbc50; border-radius:999px; font-size:12px; color:#ffc0d9; font-weight:700; }
.heart { margin:19px 0 10px; font-size:52px; filter:drop-shadow(0 8px 26px #ff4b9570); }
h1 { font-size:clamp(33px,8vw,47px); letter-spacing:-.05em; line-height:1.1; margin:7px 0 13px; }
.hero p { color:#dfcfdd; font-size:15px; line-height:1.65; margin:0 auto 22px; max-width:330px; }
.name { color:#ff85b9; overflow-wrap:anywhere; }
.button { display:flex; justify-content:center; align-items:center; gap:10px; width:100%; padding:15px 18px; border:0; border-radius:14px; color:#fff; background:linear-gradient(105deg,#ff4c98,#ef367c); text-decoration:none; font-size:18px; font-weight:800; box-shadow:0 10px 30px #f13e7c4a; transition:transform .2s,filter .2s; cursor:pointer; }
.button:hover { transform:translateY(-2px); filter:brightness(1.09); }
.button[aria-disabled=true] { background:#63505c; box-shadow:none; cursor:not-allowed; }
.small { margin-top:13px; font-size:12px; color:#af9aa9; }
.chat { margin-top:15px; padding:18px 15px 14px; }
.chat-top { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:13px; }
.chat-top h2 { font-size:18px; letter-spacing:-.02em; margin:0; overflow-wrap:anywhere; }
.online-meter { display:inline-flex; align-items:center; gap:5px; flex-shrink:0; font-size:12px; color:#f8c4dc; background:#ff4c9820; border:1px solid #f779aa60; border-radius:999px; padding:7px 11px; font-weight:800; font-variant-numeric:tabular-nums; box-shadow:0 0 14px #ed4a8e17; }
.online-meter svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }
.online-meter .num { color:#fff; font-size:14px; min-width:1ch; text-align:right; }
.online-meter .online-label { font-size:10px; font-weight:600; }
.online-meter.offline { color:#b9a4b9; border-color:#ffffff2e; background:#ffffff0c; }
.online-meter:not(.offline)::before { content:''; width:6px; height:6px; background:#62e2ac; border-radius:50%; box-shadow:0 0 8px #62e2ac; animation:glow 2s ease-in-out infinite; }
@keyframes glow { 50% { opacity:.35; } }
@media (prefers-reduced-motion:reduce) { .online-meter::before { animation:none !important; } }
.notice { background:#ff4c9812; border:1px solid #ff86b535; border-radius:12px; padding:11px 12px; margin-bottom:12px; }
.notice strong { color:#ffb8d4; font-size:12px; }
.notice p { margin:5px 0 0; color:#f3c7df; line-height:1.45; font-size:13px; overflow-wrap:anywhere; white-space:pre-wrap; }
.notice a { color:#ffc1d9; font-weight:750; text-decoration:underline; display:inline-block; margin-top:7px; font-size:12px; }
.messages { min-height:160px; max-height:320px; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:10px; padding:12px 6px 12px 0; scrollbar-color:#8b4c70 transparent; }
.empty { margin:auto; text-align:center; color:#a993a8; font-size:13px; line-height:1.6; }
.msg { display:flex; align-items:flex-start; gap:9px; }
.avatar { width:30px; height:30px; flex:0 0 30px; border-radius:50%; background:#63364f; color:#ffd0e0; display:grid; place-items:center; font-size:13px; font-weight:800; }
.msg-body { min-width:0; flex:1; }
.msg-meta { display:flex; align-items:baseline; gap:8px; margin-bottom:3px; }
.msg-nick { font-size:12px; font-weight:800; color:#ffc0d8; overflow-wrap:anywhere; }
.msg-time { font-size:10px; color:#8e7c8e; }
.msg-text { color:#f6e7f3; font-size:13px; line-height:1.4; overflow-wrap:anywhere; white-space:pre-wrap; }
.entry { border-top:1px solid #ffffff20; margin-top:8px; padding-top:13px; }
.entry-help { color:#bda7b9; margin:0 0 8px; font-size:12px; }
.form-row { display:flex; gap:8px; }
input { min-width:0; flex:1; padding:12px 13px; border:1px solid #ffffff28; border-radius:11px; outline:none; background:#ffffff11; color:#fff; font:inherit; font-size:13px; }
input:focus { border-color:#ff84b5; box-shadow:0 0 0 2px #ff74ab24; }
input::placeholder { color:#ae97aa; }
.send { border:none; border-radius:11px; background:#f44792; color:white; padding:11px 13px; font-size:13px; font-weight:800; cursor:pointer; white-space:nowrap; }
.send:disabled { opacity:.5; cursor:not-allowed; }
.chat-footer { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px; }
.identity { font-size:12px; color:#af9bab; overflow-wrap:anywhere; }
.change { color:#ffaccb; font-size:12px; border:0; padding:2px 0; background:none; cursor:pointer; }
.feedback { min-height:16px; color:#ffb6ba; font-size:11px; margin-top:6px; }
[hidden] { display:none !important; }
</style>
</head>
<body>
<div class="ambient" aria-hidden="true"><span class="orb orb-one"></span><span class="orb orb-two"></span><span class="orb orb-three"></span><span class="stardust"></span></div>
<main class="page">
<section class="card hero">
  <span class="badge">💌 Invitación especial</span>
  <div class="heart" aria-hidden="true">💗</div>
  <h1>Únete, bb 💕</h1>
  <p>Te estamos esperando en <strong class="name">${safeName}</strong>.<br>Entra y descubre qué hay dentro 👀</p>
  ${telegramLink ? `<a class="button" href="${safeLink}" target="_blank" rel="noopener noreferrer"><svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.6 3.5-3.5 16.4a1.1 1.1 0 0 1-1.7.7l-5.1-3.8-2.5 2.4c-.3.3-.6.5-1.1.5l.4-5.3 9.6-8.7c.4-.3-.1-.5-.6-.2L5.4 12.7.5 11.2a1 1 0 0 1 0-1.9L20 2.5a1.2 1.2 0 0 1 1.6 1Z" fill="currentColor"/></svg>${safeCta}</a>` : `<span class="button" aria-disabled="true">Enlace pendiente 💌</span>`}
  <div class="small">Te lleva directamente a Telegram ✈️</div>
</section>
<section class="card chat" aria-label="Chat público de la página">
  <div class="chat-top"><h2>${escapeHtml(chatTitle)}</h2><div class="online-meter offline" id="presence" role="status" aria-label="Personas conectadas al chat" title="Sesiones conectadas en tiempo real"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span class="num" id="onlineNumber">—</span><span class="online-label">en línea</span></div></div>
  <div class="notice"><strong>📌 Mensaje de la página</strong><p>${escapeHtml(chatWelcome)}</p>${telegramLink ? `<a href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeCta} ↗</a>` : ''}</div>
  <div class="messages" id="messages" role="log" aria-live="polite"><div class="empty" id="empty">💬 Todavía no hay mensajes.<br>¡Sé el primero en saludar!</div></div>
  <div class="entry">
    <form id="nickForm" autocomplete="off">
      <p class="entry-help">Sin cuenta ni registro. Elige un nick para escribir 👇</p>
      <div class="form-row"><input id="nickInput" aria-label="Tu nick" placeholder="Tu nick (2-22 caracteres)" minlength="2" maxlength="22" required><button type="submit" class="send">Entrar 💗</button></div>
    </form>
    <form id="messageForm" hidden autocomplete="off">
      <div class="form-row"><input id="messageInput" aria-label="Tu mensaje" placeholder="Escribe algo bonito... 💕" maxlength="240" required><button type="submit" class="send" id="sendButton">Enviar</button></div>
      <div class="chat-footer"><span class="identity">Escribiendo como <b id="myNick"></b></span><button type="button" class="change" id="changeNick">Cambiar nick</button></div>
    </form>
    <div class="feedback" id="feedback" role="status"></div>
  </div>
</section>
</main>
<script>
(() => {
  const messages = document.querySelector('#messages');
  const empty = document.querySelector('#empty');
  const presence = document.querySelector('#presence');
  const onlineNumber = document.querySelector('#onlineNumber');
  const feedback = document.querySelector('#feedback');
  const nickForm = document.querySelector('#nickForm');
  const nickInput = document.querySelector('#nickInput');
  const messageForm = document.querySelector('#messageForm');
  const messageInput = document.querySelector('#messageInput');
  const sendButton = document.querySelector('#sendButton');
  const myNick = document.querySelector('#myNick');
  let nick = '';
  try { nick = (localStorage.getItem('bb_chat_nick') || '').trim(); } catch {}
  const showNick = () => {
    const active = nick.length >= 2 && nick.length <= 22;
    nickForm.hidden = active;
    messageForm.hidden = !active;
    myNick.textContent = nick;
  };
  showNick();
  const seen = new Set();
  function addMessage(message) {
    if (!message || !message.id || seen.has(message.id)) return;
    seen.add(message.id);
    if (seen.size > 130) { const first = seen.values().next().value; seen.delete(first); }
    const wasNearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 70;
    const msg = document.createElement('div'); msg.className = 'msg';
    const avatar = document.createElement('div'); avatar.className = 'avatar';
    avatar.textContent = (message.nick || '?').substring(0, 1).toUpperCase();
    const body = document.createElement('div'); body.className = 'msg-body';
    const meta = document.createElement('div'); meta.className = 'msg-meta';
    const author = document.createElement('span'); author.className = 'msg-nick'; author.textContent = message.nick;
    const time = document.createElement('time'); time.className = 'msg-time';
    time.dateTime = message.at; time.textContent = new Date(message.at).toLocaleTimeString('es', {hour:'2-digit',minute:'2-digit'});
    const text = document.createElement('div'); text.className = 'msg-text'; text.textContent = message.text;
    meta.append(author, time); body.append(meta, text); msg.append(avatar, body);
    messages.appendChild(msg);
    empty.hidden = true;
    while (messages.querySelectorAll('.msg').length > 100) messages.querySelector('.msg').remove();
    if (wasNearBottom) messages.scrollTop = messages.scrollHeight;
  }
  // Un ID aleatorio por navegador evita contar dos pestañas como dos personas.
  // No se envía a servicios externos ni se guarda en el servidor.
  let viewerId = '';
  try { viewerId = localStorage.getItem('bb_viewer_id') || ''; } catch {}
  if (!/^[a-z0-9-]{16,64}$/i.test(viewerId)) {
    viewerId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('bb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    try { localStorage.setItem('bb_viewer_id', viewerId); } catch {}
  }
  const stream = new EventSource('/api/stream?visitor=' + encodeURIComponent(viewerId));
  stream.addEventListener('error', () => {
    presence.classList.add('offline');
    onlineNumber.textContent = '—';
    presence.title = 'Reconectando al chat...';
  });
  stream.addEventListener('history', e => { try {
    const data = JSON.parse(e.data);
    data.messages.forEach(addMessage);
  } catch {} });
  stream.addEventListener('message-new', e => { try { addMessage(JSON.parse(e.data)); } catch {} });
  stream.addEventListener('presence', e => { try {
    const n = JSON.parse(e.data).online;
    if (!Number.isInteger(n) || n < 0) return;
    onlineNumber.textContent = String(n);
    presence.classList.remove('offline');
    presence.title = n + ' sesión(es) de navegador conectada(s) ahora';
  } catch {} });
  nickForm.addEventListener('submit', e => {
    e.preventDefault();
    const value = nickInput.value.replace(/\s+/g, ' ').trim();
    if (value.length < 2 || value.length > 22) { feedback.textContent = 'El nick debe tener entre 2 y 22 caracteres.'; return; }
    nick = value;
    try { localStorage.setItem('bb_chat_nick', nick); } catch {}
    feedback.textContent = '';
    showNick(); messageInput.focus();
  });
  document.querySelector('#changeNick').addEventListener('click', () => {
    nick = ''; try { localStorage.removeItem('bb_chat_nick'); } catch {}
    nickInput.value = myNick.textContent;
    showNick(); nickInput.focus();
  });
  messageForm.addEventListener('submit', async e => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !nick || sendButton.disabled) return;
    sendButton.disabled = true; feedback.textContent = '';
    try {
      const response = await fetch('/api/messages', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nick,text})
      });
      const result = await response.json();
      if (!response.ok) { feedback.textContent = result.error || 'No se pudo enviar el mensaje'; return; }
      messageInput.value = '';
      messageInput.focus();
    } catch { feedback.textContent = 'Sin conexión, vuelve a intentar.'; }
    finally { sendButton.disabled = false; }
  });
})();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const route = requestUrl.pathname;
  if (req.method === 'GET' && route === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK'); return;
  }
  if (req.method === 'GET' && (route === '/' || route === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control':'no-cache',
      'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin' });
    res.end(html); return;
  }
  if (req.method === 'GET' && route === '/api/stream') {
    if (clients.size >= MAX_CONNECTIONS) { json(res, 503, { error:'Chat lleno, intenta más tarde.' }); return; }
    res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'X-Accel-Buffering':'no' });
    res.flushHeaders();
    res.write(': conectado\n\n');
    const suppliedId = requestUrl.searchParams.get('visitor') || '';
    const visitorId = /^[a-z0-9-]{16,64}$/i.test(suppliedId) ? suppliedId : crypto.randomUUID();
    clients.set(res, visitorId);
    sendSSE(res, 'history', { messages:history });
    broadcastPresence();
    const heartbeat = setInterval(() => {
      if (res.destroyed || res.writableEnded) return;
      try { res.write(': ping\n\n'); } catch { res.destroy(); }
    }, 22000);
    // El cierre pertenece a la respuesta SSE (no a la petición GET): así el contador baja correctamente.
    res.on('close', () => { clearInterval(heartbeat); if (clients.delete(res)) broadcastPresence(); });
    return;
  }
  if (req.method === 'POST' && route === '/api/messages') {
    // Railway coloca la IP del visitante en X-Forwarded-For.
    // Se usa la última IP entregada por el proxy para limitar el spam.
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',').pop().trim().slice(0, 100) : '';
    const ip = forwardedIp || req.socket.remoteAddress || 'unknown';
    if ((Date.now() - (lastMessageByIp.get(ip) || 0)) < COOLDOWN_MS) {
      json(res, 429, { error:'Espera unos segundos antes de escribir otra vez 💕' }); return;
    }
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 4096) { json(res, 413, {error:'Mensaje demasiado largo.'}); req.destroy(); }
    });
    req.on('end', () => {
      if (res.writableEnded || res.destroyed) return;
      let body;
      try { body = JSON.parse(data); } catch { json(res, 400, {error:'Datos inválidos.'}); return; }
      const nick = normalize(body.nick, 22);
      const text = normalize(body.text, 240);
      if (nick.length < 2 || text.length < 1) { json(res, 400, {error:'Escribe un nick y un mensaje válidos.'}); return; }
      // Volver a comprobar tras leer el cuerpo para evitar mensajes simultáneos.
      if ((Date.now() - (lastMessageByIp.get(ip) || 0)) < COOLDOWN_MS) {
        json(res, 429, {error:'Espera unos segundos antes de escribir otra vez 💕'}); return;
      }
      lastMessageByIp.set(ip, Date.now());
      const message = { id:crypto.randomUUID(), nick, text, at:new Date().toISOString() };
      history.push(message);
      if (history.length > MAX_MESSAGES) history.shift();
      broadcast('message-new', message);
      json(res, 201, {ok:true, id:message.id});
    });
    req.on('error', () => { if (!res.writableEnded) json(res, 400, {error:'No se pudo leer el mensaje.'}); });
    return;
  }
  json(res, 404, {error:'No encontrado'});
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Únete, bb 💗 con chat en vivo en puerto ${port}`);
  if (!telegramLink) console.warn('Configura TELEGRAM_LINK con una URL https://t.me/... válida');
});

// Reducir crecimiento de datos de rate limit en procesos de larga duración.
setInterval(() => {
  const oldest = Date.now() - 120000;
  for (const [ip, time] of lastMessageByIp) if (time < oldest) lastMessageByIp.delete(ip);
}, 60000).unref();
