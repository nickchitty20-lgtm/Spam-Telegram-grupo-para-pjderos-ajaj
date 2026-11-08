'use strict';

const http = require('node:http');

const port = Number(process.env.PORT) || 3000;
const name = (process.env.TELEGRAM_NAME || 'Mi comunidad').trim();
const rawLink = (process.env.TELEGRAM_LINK || '').trim();
const cta = (process.env.BUTTON_TEXT || 'Únete, bb 💗').trim();

function safeTelegramLink(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'].includes(url.hostname.toLowerCase())) return '';
    if (!url.pathname || url.pathname === '/') return '';
    return url.toString();
  } catch {
    return '';
  }
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

const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#fa4e96" />
  <meta name="description" content="Entra a ${safeName} en Telegram 💗" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="Un clic y estás dentro 💌 ¡Únete a nuestra comunidad en Telegram!" />
  <meta name="twitter:card" content="summary" />
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body { display: grid; place-items: center; padding: 26px 16px; background: radial-gradient(ellipse at 50% 15%, #572247 0%, transparent 50%), linear-gradient(160deg, #190f23, #100b19 90%); color: #fff; }
    .card { position: relative; overflow: hidden; width: min(100%, 440px); padding: 38px 28px; text-align: center; border: 1px solid #ffffff23; border-radius: 26px; background: #ffffff0d; box-shadow: 0 28px 80px #0006; backdrop-filter: blur(10px); }
    .badge { display: inline-block; padding: 7px 12px; background: #fa4e961c; border: 1px solid #fa8dbc50; border-radius: 999px; font-size: 12px; color: #ffc0d9; font-weight: 650; letter-spacing: .02em; }
    .heart { margin: 22px 0 10px; font-size: 60px; line-height: 1; filter: drop-shadow(0 8px 26px #ff4b9570); }
    h1 { font-size: clamp(35px, 8vw, 49px); letter-spacing: -.05em; line-height: 1.1; margin: 14px 0 14px; }
    .name { color: #ff85b9; overflow-wrap: anywhere; }
    p { color: #dfcfdd; font-size: 16px; line-height: 1.65; margin: 0 auto 26px; max-width: 330px; }
    .button { display: flex; justify-content: center; align-items: center; gap: 11px; width: 100%; padding: 16px 18px; border: none; border-radius: 15px; color: #fff; background: linear-gradient(105deg, #ff4c98, #ef367c); text-decoration: none; font-size: 18px; font-weight: 800; box-shadow: 0 10px 30px #f13e7c4a; transition: transform .2s, filter .2s; }
    .button:hover { transform: translateY(-2px); filter: brightness(1.1); }
    .button:active { transform: translateY(0); }
    .button[aria-disabled="true"] { background: #63505c; box-shadow: none; cursor: not-allowed; }
    .small { margin-top: 20px; font-size: 12px; color: #9f899e; }
    svg { flex: 0 0 auto; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">💌 Invitación especial</span>
    <div class="heart" aria-hidden="true">💗</div>
    <h1>Únete, bb <span aria-hidden="true">💕</span></h1>
    <p>Te estamos esperando en <strong class="name">${safeName}</strong>.<br />Entra y descubre qué hay dentro 👀</p>
    ${telegramLink ? `<a class="button" href="${safeLink}" target="_blank" rel="noopener noreferrer" aria-label="Ir a ${safeName} en Telegram"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21.6 3.5-3.5 16.4a1.1 1.1 0 0 1-1.7.7l-5.1-3.8-2.5 2.4c-.3.3-.6.5-1.1.5l.4-5.3 9.6-8.7c.4-.3-.1-.5-.6-.2L5.4 12.7.5 11.2a1 1 0 0 1 0-1.9L20 2.5a1.2 1.2 0 0 1 1.6 1Z" fill="currentColor"/></svg>${safeCta}</a>` : `<span class="button" aria-disabled="true">Enlace pendiente 💌</span>`}
    <div class="small">Te lleva directamente a Telegram ✈️</div>
  </main>
</body>
</html>`;

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK');
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    res.end(html);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página no encontrada');
}).listen(port, '0.0.0.0', () => {
  console.log(`Landing iniciada en puerto ${port}`);
  if (!telegramLink) console.warn('Configura TELEGRAM_LINK con una URL https://t.me/... válida');
});
