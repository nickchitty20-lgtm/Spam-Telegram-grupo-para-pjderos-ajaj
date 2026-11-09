'use strict';
// Extras temporales. Sin base de datos: contenido privado en RAM, nunca en carpeta public/.
const crypto = require('node:crypto');

module.exports = function createExtras({sessions, isAdmin, online, everyone, toSession, send, msg, error, clean, key}) {
  const now = () => Date.now();
  let currentPoll = null;
  let pinned = '';
  let lastAnnouncement = null;
  let dmOpen = false;
  let dmMediaOpen = false;
  let lastRaffleAt = 0;
  const mutes = new Map(); // session ID => hasta
  const privateMsgs = []; // hasta 100 mensajes y referencias efímeras a medios
  const mediaFiles = new Map(); // id => {Buffer, mime, ownerId, viewerId, expiresAt}
  const MAX_MEDIA_BYTES = 48 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
  const FILE_LIFETIME_MS = 20 * 60 * 1000;
  let lastAdminAnnouncement = 0;

  function status() { return {open:dmOpen, mediaOpen:dmOpen && dmMediaOpen}; }
  function isMuted(s) { return (mutes.get(s?.id) || 0) > now(); }
  function getPerson(nick) {
    const wanted = key(clean(nick, 22));
    return [...sessions.values()].find(s => online(s) && s.nick && key(s.nick)===wanted) || null;
  }
  function adminSession(){ return [...sessions.values()].find(s=>isAdmin(s)) || null; }
  function notifyPrivate(message) {
    // No enviar a everyone: solo el emisor, el destinatario y Gabriela reciben los metadatos.
    const sender = sessions.get(message.fromId);
    const target = sessions.get(message.toId);
    const gabriela = adminSession();
    const ids = new Set([sender?.id, target?.id, gabriela?.id].filter(Boolean));
    for (const sid of ids) toSession(sessions.get(sid),'private-message',publicPrivate(message));
  }
  function publicPrivate(m) {return {id:m.id,from:m.from,to:m.to,text:m.text,at:m.at,mediaId:m.mediaId||null,mediaType:m.mediaType||null};}
  function publicPoll(s){
    if(!currentPoll) return null;
    const p=currentPoll;
    if(p.open && p.endsAt<=now()) p.open=false;
    return {id:p.id,question:p.question,options:p.options,open:p.open,endsAt:p.endsAt,
      total:p.votes.size,counts:p.options.map((_,i)=>[...p.votes.values()].filter(x=>x===i).length),
      myVote:p.votes.has(s.id)?p.votes.get(s.id):null};
  }
  function sendPoll(){for(const s of sessions.values())toSession(s,'poll-state',publicPoll(s));}
  function emitAdminHistory(s){
    if(isAdmin(s))toSession(s,'private-history',{messages:privateMsgs.map(publicPrivate)});
    else if(s.nick)toSession(s,'private-history',{messages:privateMsgs.filter(m=>m.fromId===s.id||m.toId===s.id).map(publicPrivate)});
  }
  function onStream(s,res){
    send(res,'poll-state',publicPoll(s));
    send(res,'pinned',{text:pinned});
    send(res,'private-settings',status());
    send(res,'mute-state',{until:mutes.get(s.id)||0});
    if(lastAnnouncement && lastAnnouncement.expiresAt>now())send(res,'announcement',lastAnnouncement);
    const ownHistory=isAdmin(s)?privateMsgs:privateMsgs.filter(m=>m.fromId===s.id||m.toId===s.id);
    send(res,'private-history',{messages:ownHistory.map(publicPrivate)});
    for(const [id,m] of mediaFiles){
      if(m.spotlight && m.viewerId===s.id && m.expiresAt>now())send(res,'spotlight',{id,expiresAt:m.expiresAt,mediaType:m.mime,nick:m.by,seconds:Math.ceil((m.expiresAt-now())/1000)});
    }
  }
  function onClaim(s) { emitAdminHistory(s); toSession(s,'poll-state',publicPoll(s)); }
  function onNickReleased(s) {
    mutes.delete(s.id);
    // Evita que otro nick que reutilice esta sesión herede conversaciones o archivos del anterior.
    for(let i=privateMsgs.length-1;i>=0;i--){if(privateMsgs[i].fromId===s.id||privateMsgs[i].toId===s.id)privateMsgs.splice(i,1);}
    for(const [id,m] of mediaFiles){if(m.ownerId===s.id||m.viewerId===s.id){mediaFiles.delete(id);if(m.spotlight)toSession(s,'media-expired',{id});}}
    toSession(s,'private-history',{messages:[]});
  }
  function asResult(res,status,body){msg(res,status,body);return true;}
  function checkAdmin(res,s){if(!isAdmin(s)){error(res,403,'Solo Gabriela puede usar este control.');return false;}return true;}
  function handlePost(req,res,s,route,body){
    if(!route.startsWith('/api/extras/'))return false;
    if(!s || !online(s)){error(res,403,'Conéctate primero al chat.');return true;}
    s.lastSeen=now();
    if(route==='/api/extras/poll/create'){
      if(!checkAdmin(res,s))return true;
      const question=clean(body.question,160);
      const options=Array.isArray(body.options)?body.options.map(o=>clean(o,65)).filter(Boolean):[];
      const duration=Number(body.duration)||60;
      if(question.length<5||options.length<2||options.length>5||new Set(options.map(o=>key(o))).size!==options.length || ![30,60,120,300].includes(duration)){
        error(res,400,'Escribe una pregunta y entre 2 y 5 respuestas diferentes; duración 30, 60, 120 o 300 segundos.');return true;
      }
      currentPoll={id:crypto.randomUUID(),question,options,votes:new Map(),open:true,endsAt:now()+duration*1000};
      sendPoll();setTimeout(()=>{if(currentPoll?.id && currentPoll.endsAt<=now() && currentPoll.open){currentPoll.open=false;sendPoll();}},duration*1000+60).unref();
      return asResult(res,201,{ok:true});
    }
    if(route==='/api/extras/poll/vote'){
      if(!s.nick) return asResult(res,403,{error:'Primero registra tu nick para votar.'});
      if(!currentPoll||!currentPoll.open||currentPoll.endsAt<=now())return asResult(res,409,{error:'La votación está cerrada.'});
      if(currentPoll.votes.has(s.id))return asResult(res,409,{error:'Ya votaste. Solo se permite una elección por sesión.'});
      const option=Number(body.option);
      if(!Number.isInteger(option)||option<0||option>=currentPoll.options.length)return asResult(res,400,{error:'Opción inválida.'});
      currentPoll.votes.set(s.id,option);sendPoll();return asResult(res,200,{ok:true});
    }
    if(route==='/api/extras/poll/close'){
      if(!checkAdmin(res,s))return true;
      if(currentPoll)currentPoll.open=false;
      sendPoll();return asResult(res,200,{ok:true});
    }
    if(route==='/api/extras/announce'){
      if(!checkAdmin(res,s))return true;
      const text=clean(body.text,360);
      const seconds=Math.floor(Number(body.seconds));
      if(text.length<2||!Number.isInteger(seconds)||seconds<5||seconds>90)return asResult(res,400,{error:'Escribe un anuncio y usa una duración de 5 a 90 segundos.'});
      if(now()-lastAdminAnnouncement<3000)return asResult(res,429,{error:'Espera unos segundos entre anuncios.'});
      lastAdminAnnouncement=now();
      lastAnnouncement={id:crypto.randomUUID(),text,expiresAt:now()+seconds*1000};
      everyone('announcement',lastAnnouncement);
      if(body.pin===true){pinned=text;everyone('pinned',{text:pinned});}
      return asResult(res,200,{ok:true});
    }
    if(route==='/api/extras/pin'){
      if(!checkAdmin(res,s))return true;
      pinned=clean(body.text,260);
      everyone('pinned',{text:pinned});return asResult(res,200,{ok:true});
    }
    if(route==='/api/extras/raffle'){
      if(!checkAdmin(res,s))return true;
      if(now()-lastRaffleAt<15000)return asResult(res,429,{error:'Espera 15 segundos antes de otro sorteo.'});
      const players=[...sessions.values()].filter(x=>online(x)&&x.nick&&!isAdmin(x));
      if(players.length<2)return asResult(res,409,{error:'Se necesitan al menos dos nicks conectados para sortear.'});
      lastRaffleAt=now();
      const chosen=players[crypto.randomInt(players.length)];
      everyone('raffle-result',{nick:chosen.nick,at:new Date().toISOString()});
      return asResult(res,200,{ok:true,nick:chosen.nick});
    }
    if(route==='/api/extras/mute'){
      if(!checkAdmin(res,s))return true;
      const target=getPerson(body.nick);
      if(!target)return asResult(res,404,{error:'Ese nick no está conectado.'});
      if(isAdmin(target))return asResult(res,403,{error:'No puedes silenciar a Gabriela.'});
      const seconds=Number(body.seconds);
      if(![0,60,300,600].includes(seconds))return asResult(res,400,{error:'Duración de silencio inválida.'});
      if(seconds)mutes.set(target.id,now()+seconds*1000);else mutes.delete(target.id);
      toSession(target,'mute-state',{until:mutes.get(target.id)||0});
      return asResult(res,200,{ok:true});
    }
    if(route==='/api/extras/dm/toggle'){
      if(!checkAdmin(res,s))return true;
      if(typeof body.open!=='boolean'||typeof body.mediaOpen!=='boolean')return asResult(res,400,{error:'Opciones inválidas.'});
      dmOpen=body.open;dmMediaOpen=body.open&&body.mediaOpen;
      everyone('private-settings',status());return asResult(res,200,{ok:true});
    }
    if(route==='/api/extras/dm/message'){
      if(!s.nick)return asResult(res,403,{error:'Registra un nick antes de escribir en privado.'});
      const admin=isAdmin(s);
      if(!admin&&!dmOpen)return asResult(res,403,{error:'Gabriela todavía no habilitó los mensajes privados.'});
      if(isMuted(s))return asResult(res,403,{error:'Tu nick está silenciado temporalmente.'});
      const target=admin?getPerson(body.to):adminSession();
      if(!target || target.id===s.id)return asResult(res,409,{error:'El destinatario no está disponible.'});
      const text=clean(body.text,700);
      if(!text)return asResult(res,400,{error:'Escribe un mensaje.'});
      if(now()-(s.lastPrivateAt||0)<2200)return asResult(res,429,{error:'Espera unos segundos antes de enviar otro mensaje privado.'});
      s.lastPrivateAt=now();
      const pm={id:crypto.randomUUID(),from:s.nick,to:target.nick,fromId:s.id,toId:target.id,text,at:new Date().toISOString()};
      privateMsgs.push(pm);if(privateMsgs.length>100)privateMsgs.shift();notifyPrivate(pm);
      return asResult(res,201,{ok:true});
    }
    return asResult(res,404,{error:'Acción no encontrada.'});
  }

  function headerSameOrigin(req){
    const origin=req.headers.origin;
    if(!origin)return true;
    try{return new URL(origin).host===(req.headers['x-forwarded-host']||req.headers.host);}catch{return false;}
  }
  function sniffMime(bytes){
    if(bytes.length>8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
    if(bytes.length>3 && bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
    if(bytes.length>6 && ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString('ascii')))return 'image/gif';
    if(bytes.length>12 && bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return 'image/webp';
    if(bytes.length>12 && bytes.subarray(4,8).toString('ascii')==='ftyp')return 'video/mp4';
    if(bytes.length>4 && bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return 'video/webm';
    return '';
  }
  function mediaPost(req,res,s,url) {
    if(!s||!online(s)||!s.nick)return asResult(res,403,{error:'Necesitas estar conectado con nick.'});
    if(!headerSameOrigin(req))return asResult(res,403,{error:'Origen no permitido.'});
    const kind=url.searchParams.get('kind');
    if(!['spotlight','inbox','reply'].includes(kind))return asResult(res,400,{error:'Tipo de envío desconocido.'});
    const admin=isAdmin(s);
    if(kind==='spotlight'&&!admin)return asResult(res,403,{error:'Solo Gabriela puede enviar contenido efímero.'});
    if(kind==='reply'&&!admin)return asResult(res,403,{error:'Solo Gabriela puede enviar respuestas privadas.'});
    if(kind==='inbox'&&(!dmOpen||!dmMediaOpen))return asResult(res,403,{error:'Gabriela no habilitó los archivos privados.'});
    if(isMuted(s))return asResult(res,403,{error:'Nick silenciado.'});
    const target=kind==='inbox'?adminSession():getPerson(url.searchParams.get('to'));
    if(!target||target.id===s.id)return asResult(res,404,{error:'El destinatario no está conectado.'});
    const seconds=Math.floor(Number(url.searchParams.get('seconds')||30));
    if(kind==='spotlight' && (seconds<5||seconds>120))return asResult(res,400,{error:'La duración debe ser de 5 a 120 segundos.'});
    if(now()-(s.lastFileAt||0)<9000)return asResult(res,429,{error:'Espera 9 segundos entre archivos.'});
    const size=Number(req.headers['content-length']);
    if(Number.isFinite(size)&&size>MAX_VIDEO_BYTES)return asResult(res,413,{error:'Archivo demasiado grande (máximo 16 MB).'});
    const chunks=[];let n=0;let aborted=false;
    req.on('data',c=>{
      if(aborted)return;n+=c.length;
      if(n>MAX_VIDEO_BYTES){aborted=true;error(res,413,'Máximo 16 MB de video o 8 MB de imagen.');req.destroy();return;}
      chunks.push(c);
    });
    req.on('end',()=>{
      if(aborted||res.writableEnded)return;
      const bytes=Buffer.concat(chunks);
      const mime=sniffMime(bytes);
      if(!mime || (mime.startsWith('image/')&&bytes.length>MAX_IMAGE_BYTES))return error(res,415,'Solo imágenes JPG, PNG, GIF, WebP (8 MB) y videos MP4/WebM (16 MB).');
      // Revalidar permisos y destinatario después de leer el archivo.
      if(!online(s)||!s.nick||!online(target)||!target.nick || (kind!=='inbox'&&!isAdmin(s)) || (kind==='inbox'&&(!dmOpen||!dmMediaOpen)))return error(res,403,'La sesión o el permiso cambió durante la subida.');
      let used=0;for(const m of mediaFiles.values())used+=m.bytes.length;
      if(used+bytes.length>MAX_MEDIA_BYTES)return error(res,503,'Galería temporal llena. Prueba más tarde.');
      s.lastFileAt=now();
      const id=crypto.randomUUID();
      const expiresAt=now()+(kind==='spotlight'?seconds*1000:FILE_LIFETIME_MS);
      mediaFiles.set(id,{id,bytes,mime,ownerId:s.id,viewerId:target.id,ownerNick:s.nick,viewerNick:target.nick,spotlight:kind==='spotlight',expiresAt,by:s.nick});
      if(kind==='spotlight'){
        toSession(target,'spotlight',{id,expiresAt,mediaType:mime,nick:s.nick,seconds});
      }else{
        const pm={id:crypto.randomUUID(),from:s.nick,to:target.nick,fromId:s.id,toId:target.id,text:'',mediaId:id,mediaType:mime,at:new Date().toISOString()};
        privateMsgs.push(pm);if(privateMsgs.length>100)privateMsgs.shift();notifyPrivate(pm);
      }
      msg(res,201,{ok:true,id,expiresAt});
    });
    return true;
  }
  function mediaGet(req,res,s,id){
    const m=mediaFiles.get(id);
    if(!m)return asResult(res,404,{error:'Archivo no disponible.'});
    if(m.expiresAt<=now()){mediaFiles.delete(id);return asResult(res,410,{error:'Archivo caducado.'});}
    if(!s || !online(s) || !s.nick || !((s.id===m.ownerId&&s.nick===m.ownerNick)||(s.id===m.viewerId&&s.nick===m.viewerNick)))return asResult(res,403,{error:'Este archivo solo está destinado a su destinatario.'});
    res.writeHead(200,{'Content-Type':m.mime,'Content-Length':m.bytes.length,'Cache-Control':'private, no-store, no-cache, must-revalidate','Pragma':'no-cache','Expires':'0','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Accept-Ranges':'none'});
    res.end(m.bytes);return true;
  }
  function handleGet(req,res,s,route){
    if(!route.startsWith('/api/media/'))return false;
    const id=route.split('/').pop();
    if(!/^[a-f0-9-]{36}$/.test(id))return asResult(res,404,{error:'Archivo no encontrado.'});
    return mediaGet(req,res,s,id);
  }
  setInterval(()=>{
    const t=now();for(const [id,m] of mediaFiles)if(m.expiresAt<=t){mediaFiles.delete(id);if(m.spotlight)toSession(sessions.get(m.viewerId),'media-expired',{id});}
    for(const [sid,until] of mutes)if(until<=t)mutes.delete(sid);
    if(currentPoll&&currentPoll.open&&currentPoll.endsAt<=t){currentPoll.open=false;sendPoll();}
  },1000).unref();
  return {handlePost,mediaPost,handleGet,onStream,onClaim,onNickReleased,isMuted};
};
