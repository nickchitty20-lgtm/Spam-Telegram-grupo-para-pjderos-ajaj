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
function safeTelegramUrl(input) {
  try {
    const url = new URL(String(input || '').trim());
    if(url.protocol !== 'https:' || !['t.me','www.t.me','telegram.me','www.telegram.me'].includes(url.hostname.toLowerCase()) || url.pathname === '/' || url.username || url.password || url.hash) return '';
    return url.toString();
  } catch { return ''; }
}
const telegramTargets = {
  group: safeTelegramUrl(process.env.TELEGRAM_GROUP_LINK || process.env.TELEGRAM_LINK),
  user: safeTelegramUrl(process.env.TELEGRAM_USER_LINK)
};
let activeTelegramType = telegramTargets.group ? 'group' : telegramTargets.user ? 'user' : 'group';
let validLink = telegramTargets[activeTelegramType];
let globalLinkEnabled = !['false','0','off','no'].includes(String(process.env.LINK_ENABLED || 'true').toLowerCase());

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
  '/app.js': ['app.js','text/javascript; charset=utf-8'],
  '/extras-client.js': ['extras-client.js','text/javascript; charset=utf-8']
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
  const s = {id, nick:'', connections:0, clients:new Set(), disconnectTimer:null, lastSeen:Date.now(), lastMessage:0, lastTap:0, typingUntil:0, lastTypingSignal:0, lastReaction:0};
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
    mode:accessMode,needsNick:!s?.nick,adminAccess:isAdmin(s),targetType:activeTelegramType,
    targetLabel:activeTelegramType==='user'?'Hablar por Telegram':'Entrar al grupo',
    ...(isAdmin(s)?{targets:telegramTargets}:{})};
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
  // El panel accede a mensajes privados, fotos y permisos: nunca se habilita sin PIN.
  if(!ADMIN_PIN) return false;
  const a=Buffer.from(String(value||'')); const b=Buffer.from(ADMIN_PIN);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function releaseNick(s) {
  if(!s.nick) return;
  if(typeof extras!=='undefined') extras.onNickReleased(s);
  if(nickOwners.get(key(s.nick))===s.id) nickOwners.delete(key(s.nick));
  if(adminOwner===s.id) adminOwner=null;
  s.typingUntil=0;sendTyping();
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
  if(fixed==='Gabriela' && (!s.nick || s.nick!=='Gabriela')) {
    if(!ADMIN_PIN) return {status:503,error:'Configura GABRIELA_PIN en Railway para activar los controles de Gabriela.'};
    if((s.pinLockedUntil||0)>Date.now()) return {status:429,error:'Demasiados intentos. Vuelve a intentar en unos minutos.'};
    if(!pinMatches(body.pin)) {
      s.pinFails=(s.pinFails||0)+1;
      if(s.pinFails>=5){s.pinLockedUntil=Date.now()+5*60000;s.pinFails=0;}
      return {status:403,error:'El PIN de Gabriela no es correcto.'};
    }
    s.pinFails=0;
  }
  if(s.nick!==fixed && s.nick) releaseNick(s);
  s.nick=fixed; nickOwners.set(key(fixed),s.id);
  if(fixed==='Gabriela') adminOwner=s.id;
  toSession(s,'session',sessionInfo(s)); sendLinkStates(); sendRoster();
  if(typeof extras!=='undefined') extras.onClaim(s);
  return {status:200,ok:true,...sessionInfo(s)};
}
function clearContestTimers() { for(const timer of contestTimers) clearTimeout(timer); contestTimers.clear(); if(stateSendTimer) clearTimeout(stateSendTimer); stateSendTimer=null; }
function later(fn,ms) { const timer=setTimeout(()=>{ contestTimers.delete(timer);fn(); },ms); contestTimers.add(timer); }
const typeNames={
  first:'⚡ El primero en tocar', taps:'🔥 Carrera de toques', knockout:'🏆 Eliminatoria',
  trivia:'🧠 Preguntas relámpago', math:'🔢 Cálculo exprés', scramble:'🔤 Palabras revueltas', riddle:'🕵️ Adivinanzas',
  romance:'💘 Código del coqueteo', emoji:'💌 Descifra los emojis', sequence:'🧩 Secuencias del amor', memory:'👀 Memoria de corazones', luck:'🍀 Suerte del amor'
};
const quizTypes=new Set(['trivia','math','scramble','riddle','romance','emoji','sequence','memory','luck']);
const MULTIPLE_CHOICE_TYPES=new Set(['trivia','romance','emoji','sequence','memory','luck']);
const MEMORY_PREVIEW_MS=5500;
const TOTAL_QUIZ_ROUNDS=3;
const QUIZ_ROUND_MS=16000;
const quizPools={
  trivia:[
    {prompt:'¿Cuál es el planeta rojo?',options:['Marte','Venus','Júpiter','Saturno'],answers:['Marte']},
    {prompt:'¿Cuántos lados tiene un hexágono?',options:['5','6','7','8'],answers:['6']},
    {prompt:'¿Qué animal es el más grande del mundo?',options:['Elefante','Ballena azul','Jirafa','Tiburón blanco'],answers:['Ballena azul']},
    {prompt:'¿Qué océano está junto a la costa de Perú?',options:['Atlántico','Índico','Ártico','Pacífico'],answers:['Pacífico']},
    {prompt:'¿Qué instrumento tiene teclas blancas y negras?',options:['Flauta','Piano','Tambor','Violín'],answers:['Piano']},
    {prompt:'¿Cuál es el resultado de 9 × 9?',options:['72','81','99','90'],answers:['81']},
    {prompt:'¿Qué gas necesitamos respirar?',options:['Oxígeno','Helio','Hidrógeno','Neón'],answers:['Oxígeno']},
    {prompt:'¿Cuál de estos animales pone huevos?',options:['Gato','Delfín','Gallina','Perro'],answers:['Gallina']},
    {prompt:'¿En qué continente se encuentra Egipto?',options:['América','Asia','África','Europa'],answers:['África']},
    {prompt:'¿Cuál es la capital de Japón?',options:['Osaka','Tokio','Kioto','Seúl'],answers:['Tokio']}
  ],
  scramble:[
    {word:'TELEGRAM'},{word:'CORAZON'},{word:'VENTANA'},{word:'ESTRELLA'},
    {word:'MARIPOSA'},{word:'AVENTURA'},{word:'CHOCOLATE'},{word:'AMISTAD'},
    {word:'SONRISA'},{word:'FANTASMA'},{word:'GIRASOL'},{word:'MISTERIO'}
  ],
  romance:[
    {prompt:'¿Qué significa hacer «ghosting»?',options:['Dejar de responder sin explicación','Mandar flores','Proponer una cita','Escribir un poema'],answers:['Dejar de responder sin explicación']},
    {prompt:'Si alguien te dice «no», ¿cuál es la respuesta correcta?',options:['Respetarlo','Insistir 10 veces','Seguir escribiendo','Pedir explicaciones'],answers:['Respetarlo']},
    {prompt:'¿Qué es un «match» en una app de citas?',options:['Interés mutuo','Un bloqueo','Un regalo','Una videollamada'],answers:['Interés mutuo']},
    {prompt:'¿Qué suele significar 💚 en un chat?',options:['Corazón verde','Mensaje borrado','Llamada perdida','Bloqueo'],answers:['Corazón verde']},
    {prompt:'Para conocer a alguien, ¿qué ayuda a conversar mejor?',options:['Preguntar y escuchar','Interrumpir siempre','Enviar spam','Ignorar respuestas'],answers:['Preguntar y escuchar']},
    {prompt:'¿Qué significa «red flag» en relaciones?',options:['Señal de alerta','Regalo sorpresa','Plan romántico','Foto de perfil'],answers:['Señal de alerta']},
    {prompt:'En una cita, ¿qué es lo más importante para cualquier interacción?',options:['Consentimiento','Presumir dinero','Responder por otros','Forzar un plan'],answers:['Consentimiento']},
    {prompt:'¿Qué es un cumplido sincero?',options:['Elogio respetuoso','Un ultimátum','Una contraseña','Una amenaza'],answers:['Elogio respetuoso']},
    {prompt:'¿Qué quiere decir «crush» en el habla de internet?',options:['Persona que te gusta','Tu contraseña','Tu ex jefe','Una cuenta falsa'],answers:['Persona que te gusta']},
    {prompt:'¿Cuál suele ser una buena señal al conversar?',options:['Interés recíproco','Presión constante','Falta de respeto','Insultos'],answers:['Interés recíproco']}
  ],
  emoji:[
    {prompt:'Descifra: 🌹 + 🍫 = ¿qué plan?',options:['Regalo romántico','Partido de fútbol','Reunión de oficina','Clase de cocina'],answers:['Regalo romántico']},
    {prompt:'Descifra: 🎬 + 🍿 + 💑',options:['Cita de cine','Paseo en bicicleta','Examen','Concierto de rock'],answers:['Cita de cine']},
    {prompt:'Descifra: ☕ + 💬 + ❤️',options:['Café y conversación','Carrera de autos','Viaje al espacio','Clase de boxeo'],answers:['Café y conversación']},
    {prompt:'Descifra: 🕺 + 💃 + 🎶',options:['Bailar juntos','Ir al dentista','Hacer compras','Pintar una pared'],answers:['Bailar juntos']},
    {prompt:'Descifra: 🌅 + 🏖️ + 💕',options:['Atardecer en la playa','Noche de videojuegos','Día de oficina','Visita al banco'],answers:['Atardecer en la playa']},
    {prompt:'Descifra: 💌 + 📱 + 😍',options:['Mensaje romántico','Actualización del teléfono','Falla de internet','Cita médica'],answers:['Mensaje romántico']},
    {prompt:'Descifra: 🍕 + 🎮 + 😂',options:['Pizza y videojuegos','Maratón de correr','Clase de piano','Reunión formal'],answers:['Pizza y videojuegos']},
    {prompt:'Descifra: 🌧️ + 🛋️ + 🎥',options:['Película en casa','Escalar una montaña','Ir a nadar','Jugar vóley'],answers:['Película en casa']}
  ],
  sequence:[
    {prompt:'¿Qué sigue? 💗 💜 💗 💜 ...',options:['💗','💜','💛','💚'],answers:['💗']},
    {prompt:'¿Qué sigue? 🌹 🌹 💌 🌹 🌹 ...',options:['💌','🌹','💗','⭐'],answers:['💌']},
    {prompt:'¿Qué sigue? 🔥 💙 🔥 💙 ...',options:['🔥','💙','🌸','🎈'],answers:['🔥']},
    {prompt:'¿Qué sigue? 💕 💕 💕 ⭐ 💕 💕 💕 ...',options:['⭐','💕','🌹','💌'],answers:['⭐']},
    {prompt:'¿Qué sigue? 💛 💚 💙 💛 💚 ...',options:['💙','💛','💚','🧡'],answers:['💙']},
    {prompt:'¿Qué sigue? 🌸 💌 🌸 💌 ...',options:['🌸','💌','🌹','💞'],answers:['🌸']},
    {prompt:'¿Qué sigue? 🎵 🎵 🎤 🎵 🎵 ...',options:['🎤','🎵','📻','💕'],answers:['🎤']},
    {prompt:'¿Qué sigue? ⭐ 🌙 ⭐ 🌙 ...',options:['⭐','🌙','☀️','🌈'],answers:['⭐']}
  ],
  riddle:[
    {prompt:'Tengo agujas y no sé coser, doy las horas sin hablar. ¿Qué soy?',answers:['reloj','un reloj'],reveal:'Reloj'},
    {prompt:'Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera. ¿Qué es?',answers:['pera','la pera'],reveal:'Pera'},
    {prompt:'Oro parece, plata no es. ¿Qué fruta es?',answers:['platano','plátano','banana','el platano','el plátano'],reveal:'Plátano'},
    {prompt:'Tiene dientes pero no come. ¿Qué es?',answers:['peine','un peine','el peine'],reveal:'Peine'},
    {prompt:'Cuanto más me quitas, más grande me hago. ¿Qué soy?',answers:['agujero','un agujero','hoyo','un hoyo'],reveal:'Agujero'},
    {prompt:'Siempre sube, nunca baja. ¿Qué es?',answers:['edad','la edad'],reveal:'Edad'},
    {prompt:'Tiene cuello pero no cabeza, y puede guardar agua. ¿Qué es?',answers:['botella','una botella','la botella'],reveal:'Botella'},
    {prompt:'Tengo hojas pero no soy árbol. ¿Qué soy?',answers:['libro','un libro','el libro','cuaderno','un cuaderno'],reveal:'Libro'},
    {prompt:'Te sigo con sol, pero desaparezco en la oscuridad. ¿Qué soy?',answers:['sombra','la sombra','una sombra'],reveal:'Sombra'},
    {prompt:'Me rompes sin tocarme si no cumples lo dicho. ¿Qué soy?',answers:['promesa','una promesa','la promesa'],reveal:'Promesa'}
  ]
};
function normalizeAnswer(input){
  return String(input??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').trim();
}
function shuffle(list){
  const arr=[...list];
  for(let i=arr.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}
  return arr;
}
function makeQuestions(type){
  if(type==='math'){
    return Array.from({length:TOTAL_QUIZ_ROUNDS},()=>{
      const op=['+','−','×'][crypto.randomInt(3)];
      let a,b,ans;
      if(op==='×'){a=crypto.randomInt(3,13);b=crypto.randomInt(2,11);ans=a*b;}
      else{a=crypto.randomInt(12,71);b=crypto.randomInt(4,34);if(op==='−'&&b>a)[a,b]=[b,a];ans=op==='+'?a+b:a-b;}
      return {prompt:`¿Cuánto es ${a} ${op} ${b}?`,options:[],answers:[String(ans)],reveal:String(ans)};
    });
  }
  if(type==='memory'){
    const symbols=['💗','💜','🌹','🍫','💌','🌸','🔥','🌙','💎','⭐','🎀','🍓'];
    return Array.from({length:TOTAL_QUIZ_ROUNDS},()=>{
      const chosen=shuffle(symbols).slice(0,5);
      const idx=crypto.randomInt(5);
      return {preview:chosen.join('   '),prompt:`¿Cuál era el emoji de la posición ${idx+1}?`,options:shuffle(chosen),answers:[chosen[idx]],reveal:chosen[idx]};
    });
  }
  if(type==='luck'){
    return Array.from({length:TOTAL_QUIZ_ROUNDS},()=>{
      const value=crypto.randomInt(1,6);
      return {prompt:'🍀 Gabriela escondió un número del 1 al 5. ¿Cuál eligió la suerte?',options:['1','2','3','4','5'],answers:[String(value)],reveal:String(value)};
    });
  }
  if(type==='scramble'){
    return shuffle(quizPools.scramble).slice(0,TOTAL_QUIZ_ROUNDS).map(({word})=>{
      let mixed=word;
      for(let i=0;i<8&&mixed===word;i++)mixed=shuffle([...word]).join('');
      if(mixed===word)mixed=word.split('').reverse().join('');
      return {prompt:`Ordena las letras: ${mixed}`,options:[],answers:[word],reveal:word};
    });
  }
  return shuffle(quizPools[type]).slice(0,TOTAL_QUIZ_ROUNDS).map(q=>({...q,options:q.options?shuffle(q.options):[],reveal:q.reveal||q.answers[0]}));
}
function typers(){return [...sessions.values()].filter(s=>online(s)&&s.nick&&s.typingUntil>Date.now()).map(s=>s.nick).sort((a,b)=>a.localeCompare(b,'es'));}
let lastTypingBroadcast='';
function sendTyping(force=false){
  const nicks=typers(),signature=JSON.stringify(nicks);
  if(force||signature!==lastTypingBroadcast){lastTypingBroadcast=signature;everyone('typing',{nicks});}
}

function publicContest() {
  if(!contest) return null;
  const isQuiz=quizTypes.has(contest.type);
  const showQuestion=isQuiz && ['preview','active','between','finished'].includes(contest.phase) && contest.question;
  return {id:contest.id,type:contest.type,title:typeNames[contest.type],phase:contest.phase,round:contest.round,
    totalRounds:isQuiz?TOTAL_QUIZ_ROUNDS:null,deadline:contest.deadline,winner:contest.winner||null,prizeGranted:!!contest.prizeGranted,
    note:contest.note||'',minPlayers:MIN_PLAYERS,
    question:showQuestion?{prompt:contest.phase==='preview'?'👀 Memoriza estos emojis: '+contest.question.preview:contest.question.prompt,options:contest.phase==='preview'?[]:contest.question.options||[],reveal:['active','preview'].includes(contest.phase)?null:contest.question.reveal}:null,
    responded:isQuiz?[...contest.players.values()].filter(p=>p.answeredRound===contest.round).length:0,
    participants:[...contest.players.values()].map(p=>({nick:p.nick,score:p.score,alive:p.alive,order:p.order,answered:isQuiz&&p.answeredRound===contest.round})).sort((a,b)=>(b.alive-a.alive)||(b.score-a.score)||(a.order-b.order))};
}
function sendContest() { everyone('challenge-state',publicContest()); }
function scheduleContest() { if(!stateSendTimer) stateSendTimer=setTimeout(()=>{stateSendTimer=null;sendContest();},120); }
function alivePlayers() { return contest ? [...contest.players.values()].filter(p=>p.alive) : []; }
function finishContest() {
  if(!contest || contest.phase==='finished') return;
  const isQuiz=quizTypes.has(contest.type);
  const alive=alivePlayers().sort((a,b)=>b.score-a.score || (isQuiz?a.totalResponseMs-b.totalResponseMs:a.firstTap-b.firstTap) || a.order-b.order);
  const champion=alive.find(p=>p.score>0)||null;
  contest.winner=champion?.nick||null;contest.winnerId=champion?.sessionId||null;contest.phase='finished';contest.deadline=0;
  contest.note=contest.winner ? `💘 ${contest.winner} es finalista de la conquista${isQuiz?` (${alive[0].score}/${TOTAL_QUIZ_ROUNDS} aciertos)`:''}. Gabriela decide si le da acceso al grupo privado.` : 'No hubo ganador esta vez. ¡Habrá revancha!';
  clearContestTimers(); sendContest();
}
function completeQuizRound(id,round){
  if(!contest||contest.id!==id||contest.round!==round||contest.phase!=='active')return;
  const answer=contest.question?.reveal||'';
  if(contest.round>=TOTAL_QUIZ_ROUNDS){
    finishContest();
    contest.note+=(answer?` · Última respuesta: ${answer}`:'');
    sendContest();return;
  }
  contest.phase='between';contest.deadline=Date.now()+3000;
  contest.note=`✅ Respuesta correcta: ${answer} · Próxima ronda en...`;
  sendContest();
  later(()=>{if(!contest||contest.id!==id||contest.phase!=='between')return;contest.round+=1;beginRound();},3000);
}
function beginRound() {
  if(!contest) return;
  contest.phase='countdown';contest.deadline=Date.now()+3500;
  contest.note=contest.round===1?'Prepárate, empieza en...':'Siguiente ronda en...';sendContest();
  const id=contest.id;
  later(()=>{
    if(!contest||contest.id!==id) return;
    contest.phase='active';
    const currentRound=contest.round;
    const quiz=quizTypes.has(contest.type);
    const time=quiz?QUIZ_ROUND_MS:(contest.type==='first'?15000:10000);
    const currentQuestion=quiz?contest.quizQuestions[contest.round-1]:null;
    if(quiz)contest.question=currentQuestion;
    if(contest.type==='memory'){
      contest.phase='preview';contest.deadline=Date.now()+MEMORY_PREVIEW_MS;
      contest.note='👀 Memoriza el orden. Todos ven la misma secuencia.';
      sendContest();
      later(()=>{
        if(!contest||contest.id!==id||contest.phase!=='preview')return;
        activateRound();
      },MEMORY_PREVIEW_MS);
    } else activateRound();
    function activateRound(){
      if(!contest||contest.id!==id)return;
      contest.phase='active';
      contest.deadline=Date.now()+time;
      contest.startedAt=Date.now();
      if(quiz){
        contest.note=`Pregunta ${contest.round} de ${TOTAL_QUIZ_ROUNDS} · una respuesta por persona`;
      } else {
        contest.note=contest.type==='first'?'¡Toca primero!': '¡Toca tantas veces como puedas!';
        for(const p of contest.players.values()) if(p.alive){p.score=0;p.firstTap=Number.MAX_SAFE_INTEGER;p.lastTap=0;}
      }
      sendContest();
      later(()=>{if(!contest||contest.id!==id||contest.phase!=='active')return;
      if(quiz){completeQuizRound(id,currentRound);return;}
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
      },time);
    }
  },3500);
}
function removeDisconnectedPlayer(s) {
  if(!contest || !contest.players.has(s.id)) return;
  if(contest.phase==='signup') contest.players.delete(s.id);
  else if(contest.phase!=='finished') contest.players.get(s.id).alive=false;
  sendContest();
  if(contest.phase==='active'&&alivePlayers().length===1) finishContest();
}
function quizAction(s,body){
  const p=contest.players.get(s.id);
  if(p.answeredRound===contest.round)return {status:409,error:'Ya respondiste esta ronda. Espera la siguiente 💗'};
  const answer=clean(body.answer,80);
  if(!answer)return {status:400,error:'Escribe o selecciona tu respuesta.'};
  if(contest.type==='trivia'&&!contest.question.options.includes(answer))return {status:400,error:'Elige una de las opciones.'};
  const now=Date.now();
  p.answeredRound=contest.round;
  const correct=contest.question.answers.some(a=>normalizeAnswer(a)===normalizeAnswer(answer));
  if(correct){p.score+=1;p.totalResponseMs+=now-contest.startedAt;}
  scheduleContest();
  if([...contest.players.values()].filter(x=>x.alive).every(x=>x.answeredRound===contest.round)){
    const id=contest.id;
    const currentRound=contest.round;
    later(()=>completeQuizRound(id,currentRound),1200);
  }
  return {status:200,ok:true,accepted:true};
}
function challengeAction(s,body) {
  if(!contest) return {status:409,error:'Ahora mismo no hay reto.'};
  const p=contest.players.get(s.id);
  if(!s.nick||!online(s)||!p||p.nick!==s.nick||!p.alive) return {status:403,error:'Debes estar inscrito y seguir en juego.'};
  if(contest.phase!=='active'||Date.now()>=contest.deadline)return {status:409,error:'El botón aún no está activo o el tiempo terminó.'};
  if(quizTypes.has(contest.type)) return quizAction(s,body);
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
    contest={id:crypto.randomUUID(),type:body.type,phase:'signup',round:1,deadline:0,winner:null,winnerId:null,prizeGranted:false,note:'Inscripciones abiertas. ¡Pulsa Participar!',players:new Map(),question:null,quizQuestions:quizTypes.has(body.type)?makeQuestions(body.type):[]};
    sendContest();return {status:200,ok:true};
  }
  if(!contest)return {status:409,error:'Aún no se ha creado un reto.'};
  if(route==='cancel'){
    clearContestTimers();contest=null;sendContest();return {status:200,ok:true};
  }
  if(route==='prize'){
    if(contest.phase!=='finished' || !contest.winner || !contest.winnerId)return {status:409,error:'Todavía no hay un finalista ganador.'};
    if(contest.prizeGranted)return {status:409,error:'Ya se habilitó al ganador de este concurso.'};
    const winner=sessions.get(contest.winnerId);
    if(!online(winner)||winner.nick!==contest.winner)return {status:409,error:'El ganador ya no está conectado con su nick. Puedes seleccionarlo manualmente cuando regrese.'};
    if(!validLink)return {status:409,error:'Configura TELEGRAM_LINK en Railway primero.'};
    globalLinkEnabled=true;accessMode='exclusive';permissions.set(winner.id,true);contest.prizeGranted=true;
    contest.note=`💌 Gabriela habilitó el acceso privado a ${winner.nick}. ¡Enhorabuena!`;
    sendLinkStates();sendRoster();sendContest();everyone('winner-prize',{nick:winner.nick});
    return {status:200,ok:true,recipient:winner.nick};
  }
  if(route==='start'){
    if(contest.phase!=='signup')return {status:409,error:'Este reto ya empezó.'};
    for(const [sid,p] of contest.players){const user=sessions.get(sid);if(!online(user)||user.nick!==p.nick)contest.players.delete(sid);}
    if(contest.players.size<MIN_PLAYERS)return {status:409,error:`Necesitas ${MIN_PLAYERS} participantes inscritos. Hay ${contest.players.size}.`};
    beginRound();return {status:200,ok:true};
  }
  return {status:404,error:'Acción desconocida.'};
}
const extras = require('./extras')({ sessions, isAdmin, online, everyone, toSession, send, msg, error, clean, key });
function failPage(res) {res.writeHead(403,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#1c1024;color:white;text-align:center;padding:60px 16px"><h1>🔒 Invitación bloqueada</h1><p>Este botón no está habilitado para tu nick ahora mismo.</p><a style="color:#ff9ac8" href="/">Volver al chat</a></body></html>');}
function handlePost(req,res,s,route,body){
  if(!s) return error(res,401,'Abre primero la página principal.');
  s.lastSeen=Date.now();
  if(extras.handlePost(req,res,s,route,body)) return;
  if(route==='/api/nick'){
    if(!online(s))return error(res,409,'Conectando al chat. Intenta nuevamente.');
    const out=claim(s,body);return msg(res,out.status,out);
  }
  if(route==='/api/nick/release'){releaseNick(s);return msg(res,200,{ok:true});}
  if(route==='/api/typing'){
    if(!online(s)||!s.nick)return error(res,403,'Registra tu nick para participar en el chat.');
    if(extras.isMuted(s))return error(res,403,'Tu nick está silenciado temporalmente.');
    if(typeof body.typing!=='boolean')return error(res,400,'Estado inválido.');
    const now=Date.now();
    if(body.typing&&now-s.lastTypingSignal<600)return msg(res,200,{ok:true});
    s.lastTypingSignal=now;
    s.typingUntil=body.typing?now+4000:0;
    sendTyping();return msg(res,200,{ok:true});
  }
  if(route==='/api/messages'){
    if(!online(s)||!s.nick)return error(res,403,'Primero registra tu nick para escribir.');
    if(extras.isMuted(s))return error(res,403,'Gabriela silenció tu nick temporalmente.');
    const text=clean(body.text,240);
    if(!text)return error(res,400,'Escribe un mensaje.');
    if(Date.now()-s.lastMessage<3000)return error(res,429,'Espera unos segundos antes de enviar otro mensaje.');
    s.lastMessage=Date.now();
    s.typingUntil=0;sendTyping();
    const m={id:crypto.randomUUID(),nick:s.nick,text,at:new Date().toISOString()};
    messages.push(m);if(messages.length>100)messages.shift();everyone('message-new',m);return msg(res,201,{ok:true});
  }
  if(route==='/api/reaction'){
    if(!online(s))return error(res,403,'Conéctate a la página para reaccionar.');
    const emoji=String(body.emoji||'');
    if(!['💗','🔥','😍','👏'].includes(emoji))return error(res,400,'Reacción inválida.');
    if(Date.now()-s.lastReaction<1400)return error(res,429,'Espera un momento entre reacciones.');
    s.lastReaction=Date.now();everyone('live-reaction',{emoji,nick:s.nick||'Visitante'});
    return msg(res,200,{ok:true});
  }
  if(route==='/api/epic'){
    if(!isAdmin(s))return error(res,403,'Solo Gabriela puede activar la animación.');
    if(Date.now()-epicAt<12000)return error(res,429,'Espera 12 segundos entre animaciones.');
    epicAt=Date.now();everyone('gabriela-epic',{shout:SHOUT});return msg(res,200,{ok:true});
  }
  if(route==='/api/link/target'){
    if(!isAdmin(s))return error(res,403,'Solo Gabriela puede cambiar el enlace de Telegram.');
    const type=String(body.type||'');
    if(!['group','user'].includes(type))return error(res,400,'Elige grupo o usuario.');
    const newLink=safeTelegramUrl(body.link);
    if(!newLink)return error(res,400,'Usa una URL segura y válida de https://t.me/...');
    telegramTargets[type]=newLink;
    activeTelegramType=type;
    validLink=telegramTargets[type];
    // El enlace recién configurado queda disponible sujeto al modo y a los permisos existentes.
    globalLinkEnabled=true;
    sendLinkStates();sendRoster();
    return msg(res,200,{ok:true,link:linkStatus(s)});
  }
  if(route==='/api/link/switch'){
    if(!isAdmin(s))return error(res,403,'Solo Gabriela puede cambiar el destino.');
    const type=String(body.type||'');
    if(!['group','user'].includes(type)||!telegramTargets[type])return error(res,409,'Configura primero el enlace de ese destino.');
    activeTelegramType=type;validLink=telegramTargets[type];
    sendLinkStates();sendRoster();return msg(res,200,{ok:true,link:linkStatus(s)});
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
    if(!validLink)return error(res,409,'Configura un enlace de grupo o usuario de Telegram antes de habilitarlo.');
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
      if(!validLink)return error(res,409,'Configura un enlace de grupo o usuario de Telegram antes de habilitarlo.');
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
    if(!contest.players.has(s.id))contest.players.set(s.id,{sessionId:s.id,nick:s.nick,score:0,alive:true,order:contest.players.size+1,firstTap:Number.MAX_SAFE_INTEGER,lastTap:0,answeredRound:0,totalResponseMs:0});
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
  if(req.method==='GET'&&extras.handleGet(req,res,s,route))return;
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
    send(res,'history',{messages});send(res,'typing',{nicks:typers()});send(res,'session',sessionInfo(s));send(res,'link-state',linkStatus(s));send(res,'challenge-state',publicContest());
    if(isAdmin(s))send(res,'admin-roster',{users:roster(),registered:registeredCount(),minPlayers:MIN_PLAYERS});
    extras.onStream(s,res);
    everyone('presence',{online:[...sessions.values()].filter(online).length});sendRoster();
    const heartbeat=setInterval(()=>{if(!res.destroyed&&!res.writableEnded)try{res.write(': ping\n\n');}catch{}},22000);
    res.on('close',()=>{
      clearInterval(heartbeat);s.clients.delete(res);s.connections=Math.max(0,s.connections-1);s.lastSeen=Date.now();
      everyone('presence',{online:[...sessions.values()].filter(online).length});sendRoster();
      if(s.connections===0){
        s.typingUntil=0;sendTyping();
        s.disconnectTimer=setTimeout(()=>{s.disconnectTimer=null;if(s.connections===0){removeDisconnectedPlayer(s);releaseNick(s);permissions.delete(s.id);}},6000);
      }
    });
    return;
  }
  if(req.method==='POST' && route==='/api/media/send')return extras.mediaPost(req,res,s,url);
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
server.listen(PORT,'0.0.0.0',()=>{console.log(`Únete BB v7.0 · puerto ${PORT} · mode ${accessMode}`);if(!ADMIN_PIN) console.warn('⚠️ Define GABRIELA_PIN en Railway para habilitar el panel privado.');});
setInterval(()=>sendTyping(),950).unref();
setInterval(()=>{const expire=Date.now()-86400000;for(const [id,s] of sessions){if(!online(s)&&!s.nick&&s.lastSeen<expire){sessions.delete(id);permissions.delete(id);}}},600000).unref();
