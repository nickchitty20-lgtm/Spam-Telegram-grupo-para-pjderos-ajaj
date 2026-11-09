'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const NAME = (process.env.TELEGRAM_NAME || 'Mi comunidad').trim().slice(0, 70);
const BUTTON = (process.env.BUTTON_TEXT || 'Únete, bb 💗').trim().slice(0, 75);
const CHAT_TITLE = (process.env.CHAT_TITLE || 'Chat en vivo 💬').trim().slice(0, 70);
const CHAT_WELCOME = (process.env.CHAT_WELCOME || 'Únete al grupo, bb 💕. Charla por aquí y participa en los retos en vivo.').trim().slice(0, 280);
const SHOUT = (process.env.GABRIELA_SHOUT || 'entra bb 💕').trim().slice(0, 60);
const ADMIN_PIN = String(process.env.GABRIELA_PIN || '');
let accessMode = String(process.env.LINK_MODE || 'exclusive').trim().toLowerCase() === 'public' ? 'public' : 'exclusive';
const validLink = (() => { try {
  const url = new URL((process.env.TELEGRAM_LINK || '').trim());
  if (url.protocol !== 'https:' || !['t.me','www.t.me','telegram.me','www.telegram.me'].includes(url.hostname.toLowerCase()) || url.pathname === '/' || url.username || url.password) return '';
  return url.toString();
} catch { return ''; } })();
let globalLinkEnabled = !!validLink && !['false','0','off','no'].includes(String(process.env.LINK_ENABLED || 'true').toLowerCase());

const sessions = new Map(); // id => {nick, connections, clients:Set, disconnectTimer, lastSeen, lastMessage, lastTap}
const nickOwners = new Map(); // lowercased nick -> session id
const permissions = new Map(); // id => true|false; default comes from LINK_MODE
const messages = [];
let adminOwner = null;
let epicAt = 0;
// 3 por defecto. Ajustable desde Railway; limita valores para evitar configuraciones inválidas.
const MIN_PLAYERS = (() => {
  const parsed = Number(process.env.MIN_PLAYERS);
  return Number.isInteger(parsed) && parsed >= 2 && parsed <= 20 ? parsed : 3;
})();
const MAX_PLAYERS = 64;
let contest = null;
const contestTimers = new Set();
let stateSendTimer = null;

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html','text/html; charset=utf-8'],
  '/style.css': ['style.css','text/css; charset=utf-8'],
  '/app.js': ['app.js','text/javascript; charset=utf-8']
};
const staticContents = Object.fromEntries(Object.entries(files).map(([route,[file,type]]) => [route,{data: fs.readFileSync(path.join(__dirname, 'public', file)),type}]));

function clean(value, max) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max) : ''; }
function key(nick) { return nick.normalize('NFKC').toLocaleLowerCase('es'); }
function msg(res,status,obj) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(obj)); }
function error(res,status,reason) { msg(res,status,{error:reason}); }
function cookieId(req) { const m = /(?:^|;\s*)bb_sid=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie||''); return m ? m[1] : null; }
function getSession(req) { const id = cookieId(req); return id ? sessions.get(id) : null; }
function makeSession(req,res) {
  const existing = getSession(req);
  if (existing) return existing;
  const id = crypto.randomBytes(24).toString('hex');
  const s = {id, nick:'', connections:0, clients:new Set(), disconnectTimer:null, lastSeen:Date.now(), lastMessage:0, lastTap:0};
  sessions.set(id,s);
  const secure = String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https';
  res.setHeader('Set-Cookie', `bb_sid=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure?'; Secure':''}`);
  return s;
}
function online(s) { return s && s.connections>0; }
function isAdmin(s) { return online(s) && s.nick==='Gabriela' && adminOwner===s.id; }
function registeredCount() { let n=0; for(const s of sessions.values()) if(online(s)&&s.nick) n++; return n; }
// Una persona debe estar conectada Y haber registrado un nick antes de recibir el enlace.
// Gabriela siempre tiene entrada cuando el enlace general está habilitado,
// incluso si activa el modo exclusivo sin seleccionarse a sí misma.
function canJoin(s) {
  if(!validLink || !globalLinkEnabled || !online(s) || !s.nick) return false;
  if(isAdmin(s)) return true;
  return permissions.get(s.id) ?? (accessMode==='public');
}
function linkStatus(s) {
  return {enabled:canJoin(s),configured:!!validLink,globalEnabled:globalLinkEnabled,
    mode:accessMode,needsNick:!s?.nick,adminAccess:isAdmin(s)};
}
function send(res,event,data) { if(res.destroyed||res.writableEnded) return; try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} }
function everyone(event,data) { for (const s of sessions.values()) for(const res of s.clients) send(res,event,data); }
function toSession(s,event,data) { if(s) for(const res of s.clients) send(res,event,data); }
function sendLinkStates() { for(const s of sessions.values()) toSession(s,'link-state',linkStatus(s)); }
function roster() { return [...sessions.values()].filter(s=>online(s)&&s.nick).map(s=>({nick:s.nick,access:canJoin(s),owner:s.id===adminOwner})).sort((a,b)=>a.nick.localeCompare(b.nick,'es')); }
function sendRoster() {
  const data={users:roster(),registered:registeredCount(),minPlayers:MIN_PLAYERS};
  for (const s of sessions.values()) if(isAdmin(s)) toSession(s,'admin-roster',data);
  everyone('registered-count',{registered:data.registered,minPlayers:MIN_PLAYERS});
}
function sessionInfo(s) { return {nick:s.nick,isGabriela:isAdmin(s)}; }
function pinMatches(value) {
  if(!ADMIN_PIN) return true;
  const a=Buffer.from(String(value||'')); const b=Buffer.from(ADMIN_PIN);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function releaseNick(s) {
  if(!s.nick) return;
  if(nickOwners.get(key(s.nick))===s.id) nickOwners.delete(key(s.nick));
  if(adminOwner===s.id) adminOwner=null;
  s.nick='';
  if(contest && contest.players.has(s.id)) {
    const p=contest.players.get(s.id);
    if(contest.phase==='signup') contest.players.delete(s.id);
    else p.alive=false;
    sendContest();
  }
  toSession(s,'session',sessionInfo(s));
  sendLinkStates(); sendRoster();
}
function claim(s,body) {
  const nick=clean(body.nick,22);
  if(nick.length<2) return {status:400,error:'El nick debe tener de 2 a 22 caracteres.'};
  const fixed=key(nick)==='gabriela'?'Gabriela':nick;
  const owner=nickOwners.get(key(fixed));
  if(owner&&owner!==s.id) return {status:409,error:'Ese nick ya está en uso. Prueba otro 💗'};
  if(fixed==='Gabriela' && (!s.nick || s.nick!=='Gabriela') && !pinMatches(body.pin)) return {status:403,error:'El PIN de Gabriela no es correcto.'};
  if(s.nick!==fixed && s.nick) releaseNick(s);
  s.nick=fixed; nickOwners.set(key(fixed),s.id);
  if(fixed==='Gabriela') adminOwner=s.id;
  toSession(s,'session',sessionInfo(s)); sendLinkStates(); sendRoster();
  return {status:200,ok:true,...sessionInfo(s)};
}
function clearContestTimers() { for(const timer of contestTimers) clearTimeout(timer); contestTimers.clear(); if(stateSendTimer) clearTimeout(stateSendTimer); stateSendTimer=null; }
function later(fn,ms) { const timer=setTimeout(()=>{ contestTimers.delete(timer);fn(); },ms); contestTimers.add(timer); }
const typeNames={first:'⚡ El primero en tocar',taps:'🔥 Carrera de toques',knockout:'🏆 Eliminatoria'};
function publicContest() {
  if(!contest) return null;
  return {id:contest.id,type:contest.type,title:typeNames[contest.type],phase:contest.phase,round:contest.round,deadline:contest.deadline,winner:contest.winner||null,note:contest.note||'',minPlayers:MIN_PLAYERS,participants:[...contest.players.values()].map(p=>({nick:p.nick,score:p.score,alive:p.alive,order:p.order})).sort((a,b)=>(b.alive-a.alive)||(b.score-a.score)||(a.order-b.order))};
}
function sendContest() { everyone('challenge-state',publicContest()); }
function scheduleContest() { if(!stateSendTimer) stateSendTimer=setTimeout(()=>{stateSendTimer=null;sendContest();},120); }
function alivePlayers() { return contest ? [...contest.players.values()].filter(p=>p.alive) : []; }
function finishContest() {
  if(!contest || contest.phase==='finished') return;
  const alive=alivePlayers().sort((a,b)=>b.score-a.score || a.firstTap-b.firstTap || a.order-b.order);
  contest.winner=alive.find(p=>p.score>0)?.nick||null; contest.phase='finished';contest.deadline=0;
  contest.note=contest.winner ? `🎉 Ganó ${contest.winner}` : 'No hubo ganador';
  clearContestTimers(); sendContest();
}
function beginRound() {
  if(!contest) return;
  contest.phase='countdown';contest.deadline=Date.now()+3500;
  contest.note=contest.round===1?'Prepárate, empieza en...':'Siguiente ronda en...';sendContest();
  const id=contest.id;
  later(()=>{
    if(!contest||contest.id!==id) return;
    contest.phase='active';
    contest.deadline=Date.now()+(contest.type==='first'?15000:10000);
    contest.note=contest.type==='first'?'¡Toca primero!': '¡Toca tantas veces como puedas!';
    for(const p of contest.players.values()) if(p.alive){p.score=0;p.firstTap=Number.MAX_SAFE_INTEGER;p.lastTap=0;}
    sendContest();
    later(()=>{if(!contest||contest.id!==id||contest.phase!=='active')return;
      if(contest.type!=='knockout'){finishContest();return;}
      const ranked=alivePlayers().sort((a,b)=>b.score-a.score || a.firstTap-b.firstTap || a.order-b.order);
      const kept=Math.max(1,Math.ceil(ranked.length/2));
      const removed=ranked.slice(kept).map(p=>p.nick);
      for(const p of ranked.slice(kept)) p.alive=false;
      if(kept<=1){finishContest();return;}
      contest.phase='between';contest.deadline=Date.now()+3500;
      contest.note=removed.length?`Eliminados: ${removed.join(', ')}`:'¡Seguimos!';
      sendContest();
      later(()=>{if(!contest||contest.id!==id)return;contest.round+=1;beginRound();},3500);
    },contest.type==='first'?15000:10000);
  },3500);
}
function removeDisconnectedPlayer(s) {
  if(!contest || !contest.players.has(s.id)) return;
  if(contest.phase==='signup') contest.players.delete(s.id);
  else if(contest.phase!=='finished') contest.players.get(s.id).alive=false;
  sendContest();
  if(contest.phase==='active'&&alivePlayers().length===1) finishContest();
}
function challengeAction(s,body) {
  if(!contest) return {status:409,error:'Ahora mismo no hay reto.'};
  const p=contest.players.get(s.id);
  if(!s.nick||!online(s)||!p||p.nick!==s.nick||!p.alive) return {status:403,error:'Debes estar inscrito y seguir en juego.'};
  if(contest.phase!=='active'||Date.now()>=contest.deadline)return {status:409,error:'El botón aún no está activo o el tiempo terminó.'};
  if(contest.type==='first'){ p.score=1;p.firstTap=Date.now(); contest.winner=p.nick;finishContest();return {status:200,ok:true}; }
  const now=Date.now(); if(now-p.lastTap<95) return {status:200,ok:true,score:p.score};
  p.lastTap=now;p.score+=1;if(p.firstTap===Number.MAX_SAFE_INTEGER)p.firstTap=now;
  scheduleContest();return {status:200,ok:true,score:p.score};
}
function challengeAdmin(s,route,body) {
  if(!isAdmin(s))return {status:403,error:'Solo Gabriela puede organizar retos.'};
  if(route==='open'){
    if(!typeNames[body.type])return {status:400,error:'Elige un reto válido.'};
    if(registeredCount()<MIN_PLAYERS)return {status:409,error:`Se necesitan ${MIN_PLAYERS} nicks conectados como mínimo.`};
    clearContestTimers();
    contest={id:crypto.randomUUID(),type:body.type,phase:'signup',round:1,deadline:0,winner:null,note:'Inscripciones abiertas. ¡Pulsa Participar!',players:new Map()};
    sendContest();return {status:200,ok:true};
  }
  if(!contest)return {status:409,error:'Aún no se ha creado un reto.'};
  if(route==='cancel'){
    clearContestTimers();contest=null;sendContest();return {status:200,ok:true};
  }
  if(route==='start'){
    if(contest.phase!=='signup')return {status:409,error:'Este reto ya empezó.'};
    for(const [sid,p] of contest.players){const user=sessions.get(sid);if(!online(user)||user.nick!==p.nick)contest.players.delete(sid);}
    if(contest.players.size<MIN_PLAYERS)return {status:409,error:`Necesitas ${MIN_PLAYERS} participantes inscritos. Hay ${contest.players.size}.`};
    beginRound();return {status:200,ok:true};
  }
  return {status:404,error:'Acción desconocida.'};
}
function failPage(res) {res.writeHead(403,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#1c1024;color:white;text-align:center;padding:60px 16px"><h1>🔒 Invitación bloqueada</h1><p>Este botón no está habilitado para tu nick ahora mismo.</p><a style="color:#ff9ac8" href="/">Volver al chat</a></body></html>');}
function handlePost(req,res,s,route,body){
  if(!s) return error(res,401,'Abre primero la página principal.');
  s.lastSeen=Date.now();
  if(route==='/api/nick'){
    if(!online(s))return error(res,409,'Conectando al chat. Intenta nuevamente.');
    const out=claim(s,body);return msg(res,out.status,out);
  }
  if(route==='/api/nick/release'){releaseNick(s);return msg(res,200,{ok:true});}
  if(route==='/api/messages'){
    if(!online(s)||!s.nick)return error(res,403,'Primero registra tu nick para escribir.');
    const text=clean(body.text,240);
    if(!text)return error(res,400,'Escribe un mensaje.');
    if(Date.now()-s.lastMessage<3000)return error(res,429,'Espera unos segundos antes de enviar otro mensaje.');
    s.lastMessage=Date.now();
    const m={id:crypto.randomUUID(),nick:s.nick,text,at:new Date().toISOString()};
    messages.push(m);if(messages.length>100)messages.shift();everyone('message-new',m);return msg(res,201,{ok:true});
  }
  if(route==='/api/epic'){
    if(!isAdmin(s))return error(res,403,'Solo Gabriela puede activar la animación.');
    if(Date.now()-epicAt<12000)return error(res,429,'Espera 12 segundos entre animaciones.');
    epicAt=Date.now();everyone('gabriela-epic',{shout:SHOUT});return msg(res,200,{ok:true});
  }
  if(route==='/api/link/global'){
    if(!isAdmin(s))return error(res,403,'Solo Gabriela puede cambiar el estado del enlace.');
    if(typeof body.enabled!=='boolean')return error(res,400,'Estado inválido.');
    if(body.enabled && !validLink)return error(res,409,'Configura TELEGRAM_LINK en Railway antes de habilitar el enlace.');
    globalLinkEnabled=body.enabled;
    if(body.enabled){
      // "Habilitar para TODOS" significa todos, no solo nicks autorizados.
      accessMode='public';
      permissions.clear();
    }
    sendLinkStates();sendRoster();return msg(res,200,{ok:true,globalEnabled:globalLinkEnabled,mode:accessMode,link:linkStatus(s)});
  }
  if(route==='/api/link/exclusive'){
    if(!isAdmin(s))return error(res,403,'Solo Gabriela puede cambiar el modo del enlace.');
    if(!validLink)return error(res,409,'Configura TELEGRAM_LINK en Railway antes de habilitar el enlace.');
    globalLinkEnabled=true;
    accessMode='exclusive';
    sendLinkStates();sendRoster();return msg(res,200,{ok:true,globalEnabled:true,mode:accessMode,link:linkStatus(s)});
  }
  if(route==='/api/link/person'){
    if(!isAdmin(s))return error(res,403,'Solo Gabriela puede elegir quién entra.');
    const target=[...sessions.values()].find(x=>online(x)&&x.nick&&key(x.nick)===key(clean(body.nick,22)));
    if(!target)return error(res,404,'Ese nick no está conectado.');
    if(typeof body.enabled!=='boolean')return error(res,400,'Estado inválido.');
    if(body.enabled){
      if(!validLink)return error(res,409,'Configura TELEGRAM_LINK en Railway antes de habilitar el enlace.');
      // Activar a alguien funciona incluso si el enlace estaba apagado.
      // Pasa a exclusivo para evitar habilitar involuntariamente a todos.
      globalLinkEnabled=true;
      accessMode='exclusive';
    }
    permissions.set(target.id,body.enabled);
    sendLinkStates();sendRoster();return msg(res,200,{ok:true,nick:target.nick,enabled:body.enabled,mode:accessMode,link:linkStatus(s)});
  }
  if(route==='/api/challenge/join'){
    if(!online(s)||!s.nick)return error(res,403,'Necesitas registrar un nick para participar.');
    if(!contest||contest.phase!=='signup')return error(res,409,'Las inscripciones no están abiertas.');
    if(!contest.players.has(s.id)&&contest.players.size>=MAX_PLAYERS)return error(res,409,'El reto llegó al máximo de participantes.');
    if(!contest.players.has(s.id))contest.players.set(s.id,{nick:s.nick,score:0,alive:true,order:contest.players.size+1,firstTap:Number.MAX_SAFE_INTEGER,lastTap:0});
    sendContest();return msg(res,200,{ok:true});
  }
  if(route==='/api/challenge/action'){const r=challengeAction(s,body);return msg(res,r.status,r);}
  if(route.startsWith('/api/challenge/')){const r=challengeAdmin(s,route.slice('/api/challenge/'.length),body);return msg(res,r.status,r);}
  error(res,404,'No encontrado.');
}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const route=url.pathname;
  if(req.method==='GET' && route==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');return;}
  if(req.method==='GET' && staticContents[route]){
    if(route==='/'||route==='/index.html')makeSession(req,res);
    const {data,type}=staticContents[route];
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'"});
    res.end(data);return;
  }
  const s=getSession(req);
  if(req.method==='GET'&&route==='/join'){
    if(!canJoin(s)){failPage(res);return;}
    res.writeHead(302,{'Location':validLink,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return;
  }
  if(req.method==='GET'&&route==='/api/config'){
    if(!s)return error(res,401,'Primero abre la página principal.');
    return msg(res,200,{name:NAME,button:BUTTON,chatTitle:CHAT_TITLE,welcome:CHAT_WELCOME,shout:SHOUT,link:linkStatus(s),mode:accessMode,minPlayers:MIN_PLAYERS});
  }
  if(req.method==='GET'&&route==='/api/stream'){
    if(!s)return error(res,401,'Primero abre la página principal.');
    const total=[...sessions.values()].reduce((n,x)=>n+x.clients.size,0);
    if(total>=250)return error(res,503,'Demasiadas conexiones.');
    if(s.disconnectTimer){clearTimeout(s.disconnectTimer);s.disconnectTimer=null;}
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(': conectado\n\n');
    s.connections++;s.clients.add(res);s.lastSeen=Date.now();
    send(res,'history',{messages});send(res,'session',sessionInfo(s));send(res,'link-state',linkStatus(s));send(res,'challenge-state',publicContest());
    if(isAdmin(s))send(res,'admin-roster',{users:roster(),registered:registeredCount(),minPlayers:MIN_PLAYERS});
    everyone('presence',{online:[...sessions.values()].filter(online).length});sendRoster();
    const heartbeat=setInterval(()=>{if(!res.destroyed&&!res.writableEnded)try{res.write(': ping\n\n');}catch{}},22000);
    res.on('close',()=>{
      clearInterval(heartbeat);s.clients.delete(res);s.connections=Math.max(0,s.connections-1);s.lastSeen=Date.now();
      everyone('presence',{online:[...sessions.values()].filter(online).length});sendRoster();
      if(s.connections===0){
        s.disconnectTimer=setTimeout(()=>{s.disconnectTimer=null;if(s.connections===0){removeDisconnectedPlayer(s);releaseNick(s);permissions.delete(s.id);}},6000);
      }
    });
    return;
  }
  if(req.method==='POST' && route.startsWith('/api/')){
    const origin=req.headers.origin;
    if(origin){try{if(new URL(origin).host!==(req.headers['x-forwarded-host']||req.headers.host))return error(res,403,'Origen no permitido.');}catch{return error(res,403,'Origen no permitido.');}}
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return error(res,415,'Se requiere JSON.');
    let raw='';req.on('data',chunk=>{raw+=chunk;if(Buffer.byteLength(raw)>4096){error(res,413,'Solicitud demasiado grande.');req.destroy();}});
    req.on('end',()=>{if(res.writableEnded)return;let body;try{body=JSON.parse(raw||'{}');}catch{return error(res,400,'JSON inválido.');}handlePost(req,res,s,route,body);});
    return;
  }
  error(res,404,'No encontrado.');
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Únete BB v6.4 · puerto ${PORT} · mode ${accessMode}`));
setInterval(()=>{const expire=Date.now()-86400000;for(const [id,s] of sessions){if(!online(s)&&!s.nick&&s.lastSeen<expire){sessions.delete(id);permissions.delete(id);}}},600000).unref();
