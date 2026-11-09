'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag,cls,text) => { const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
  let nick = '';
  let admin = false;
  let link = {enabled:false,configured:false,globalEnabled:false,mode:'exclusive',needsNick:true,adminAccess:false};
  let challenge = null;
  let online = false;
  let registered = 0;
  let roster = [];
  let shout = 'entra bb 💕';
  let buttonText = 'Únete, bb 💗';
  let lastEpicTimeout = null;
  const seen = new Set();

  async function api(route, body) {
    const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let data={};try{data=await r.json();}catch{}
    if(!r.ok)throw new Error(data.error||'No se pudo completar la acción.');
    return data;
  }
  function tell(text, positive=false){$('feedback').textContent=text;$('feedback').style.color=positive?'#8bf3bd':'#ffb2c2';}
  function updateLink(obj){
    link={...link,...obj};
    const enabled=!!link.enabled;
    const btn=$('telegramButton');
    btn.setAttribute('aria-disabled',String(!enabled));
    if(enabled){btn.href='/join';btn.target='_blank';btn.rel='noopener noreferrer';btn.removeAttribute('tabindex');}
    else{btn.removeAttribute('href');btn.setAttribute('tabindex','-1');}
    $('ctaLabel').textContent=!link.configured?'Enlace pendiente 💌':enabled?buttonText:link.needsNick?'💬 Registra tu nick para entrar':'🔒 Enlace deshabilitado';
    $('linkStatus').textContent=!link.configured?'⚠️ TELEGRAM_LINK no está configurado':!link.globalEnabled?'🔒 Enlace apagado para todos':link.needsNick?'💬 Primero entra al chat con tu nick para activar el botón':enabled?'🟢 Invitación habilitada para ti':link.mode==='exclusive'?'🎯 Gabriela debe autorizar tu nick':'🔒 Gabriela bloqueó el acceso para tu nick';
    $('linkStatus').classList.toggle('off',!enabled);
    $('noticeJoin').hidden=!enabled;
    const modeLabel=!link.configured?'⚠️ Falta configurar TELEGRAM_LINK':!link.globalEnabled?'🔒 APAGADO PARA TODOS':link.mode==='public'?'🟢 HABILITADO PARA TODOS LOS NICKS':'🎯 SOLO NICKS AUTORIZADOS';
    $('globalLinkLabel').textContent=modeLabel;
    $('linkModeLabel').textContent=link.mode==='exclusive'?'Modo exclusivo: Gabriela y los nicks que autorice pueden entrar.':'Modo público: todos los visitantes con nick registrado pueden entrar, salvo los bloqueados.';
    $('enableAll').disabled=!!link.globalEnabled&&link.mode==='public';
    $('disableAll').disabled=!link.globalEnabled;
    $('exclusiveMode').disabled=!!link.globalEnabled&&link.mode==='exclusive';
  }
  function showIdentity(){
    const valid=nick.length>=2;
    $('nickForm').hidden=valid;
    $('messageForm').hidden=!valid;
    $('myNick').textContent=nick;
    $('adminPanel').hidden=!(valid&&admin);
    if(!valid)$('nickInput').value=$('nickInput').value||nick;
    drawChallenge();
  }
  async function claim(value, auto=false){
    const fixed=value.replace(/\s+/g,' ').trim();
    if(fixed.length<2||fixed.length>22){tell('El nick debe tener entre 2 y 22 caracteres.');return;}
    $('nickButton').disabled=true;
    try {
      const result=await api('/api/nick',{nick:fixed,pin:$('adminPin').value});
      nick=result.nick;admin=!!result.isGabriela;
      try{localStorage.setItem('bb_chat_nick',nick);}catch{}
      $('adminPin').value='';
      tell(admin?'Hola, Gabriela 💗 Tienes los controles especiales.':'¡Bienvenido al chat, bb! 💕',true);
      showIdentity();$('messageInput').focus();
    } catch(e) {
      if(auto){nick='';admin=false;showIdentity();$('nickInput').value=fixed;$('pinRow').hidden=fixed.toLocaleLowerCase('es')!=='gabriela';}
      tell(e.message);
    } finally {$('nickButton').disabled=false;}
  }
  function showRoster(data){
    roster=data.users||[];
    registered=data.registered||0;
    $('registeredLabel').textContent=`Nicks conectados: ${registered}/7 mínimos`;
    const select=$('targetNick'), old=select.value;
    select.replaceChildren(el('option','', 'Selecciona un nick...'));
    select.firstElementChild.value='';
    for(const u of roster){const opt=el('option','',`${u.nick} · ${u.access?'habilitado':'bloqueado'}`);opt.value=u.nick;select.appendChild(opt);}
    if(roster.some(u=>u.nick===old))select.value=old;
    document.querySelectorAll('[data-challenge]').forEach(b=>b.disabled=registered<7);
  }
  function appendMessage(m){
    if(!m||!m.id||seen.has(m.id))return;
    seen.add(m.id);if(seen.size>140)seen.delete(seen.values().next().value);
    const area=$('messages'),closeToEnd=area.scrollHeight-area.scrollTop-area.clientHeight<70;
    const wrapper=el('div','msg');
    wrapper.appendChild(el('div','avatar',m.nick.slice(0,1).toLocaleUpperCase('es')));
    const body=el('div','msg-body'),meta=el('div','msg-meta');
    meta.appendChild(el('b','',m.nick));
    const time=el('time','',new Date(m.at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}));time.dateTime=m.at;
    meta.appendChild(time);body.appendChild(meta);body.appendChild(el('div','msg-text',m.text));
    wrapper.appendChild(body);area.appendChild(wrapper);$('empty').hidden=true;
    while(area.querySelectorAll('.msg').length>100)area.querySelector('.msg').remove();
    if(closeToEnd)area.scrollTop=area.scrollHeight;
  }
  function updateClock(){
    if(!challenge||!challenge.deadline){$('challengeTimer').textContent='—';return;}
    const sec=Math.max(0,(challenge.deadline-Date.now())/1000);
    $('challengeTimer').textContent=sec.toFixed(1)+'s';
  }
  function drawChallenge(){
    $('challengeLive').hidden=!challenge;
    $('challengeIntro').hidden=!!challenge;
    $('challengeBadge').textContent=challenge?({signup:'Inscripciones',countdown:'Preparados',active:'Jugando',between:'Eliminando',finished:'Finalizado'}[challenge.phase]||'Reto'):'En espera';
    const start=$('startChallenge'),cancel=$('cancelChallenge');
    start.disabled=!(admin&&challenge&&challenge.phase==='signup'&&challenge.participants.length>=7);
    cancel.disabled=!(admin&&challenge);
    if(!challenge)return;
    $('challengeTitle').textContent=challenge.title;
    $('challengePhase').textContent=challenge.phase==='signup'?'Inscripción abierta':challenge.phase==='countdown'?`Ronda ${challenge.round} · Preparándose`:challenge.phase==='active'?`Ronda ${challenge.round} · ¡En acción!`:challenge.phase==='between'?`Ronda ${challenge.round} finalizada`:challenge.phase==='finished'?'🏁 Resultado final':'...';
    $('challengeNote').textContent=challenge.note||'';
    const participant=challenge.participants.find(p=>p.nick===nick);
    $('joinChallenge').hidden=challenge.phase!=='signup'||!nick||!!participant;
    $('playChallenge').hidden=challenge.phase!=='active'||!participant||!participant.alive;
    $('playChallenge').textContent=challenge.type==='first'?'⚡ ¡SOY EL PRIMERO!':'🔥 ¡TOCA, TOCA, TOCA!';
    $('participationLabel').textContent=!nick?'Registra tu nick para participar.':challenge.phase==='signup'&&participant?'✅ Estás inscrito. Gabriela decidirá cuándo empezar.':participant&&!participant.alive?'❌ Has quedado eliminado. Ahora puedes espectar.':challenge.phase==='finished'&&challenge.winner?`🎉 Ganador: ${challenge.winner}`:challenge.phase==='active'&&!participant?'👀 Estás espectando el reto.':challenge.phase==='countdown'&&participant?'⏳ Prepárate para pulsar el botón.':'';
    $('scoreCount').textContent=`${challenge.participants.length} participantes`;
    const sb=$('scoreboard');sb.replaceChildren();
    const sorted=challenge.participants;
    sorted.forEach((p,i)=>{
      const item=el('div','score'+(!p.alive?' lost':'')+(challenge.phase==='finished'&&challenge.winner===p.nick?' winner':''));
      item.appendChild(el('span','',`${i+1}.`));item.appendChild(el('b','',p.nick));
      item.appendChild(el('span','points',p.alive?`${p.score} ${p.score===1?'toque':'toques'}`:'ELIMINADO'));
      sb.appendChild(item);
    });
    updateClock();
  }
  function doEpic(){
    $('overlay').hidden=false;
    $('overlayShout').textContent=shout;
    $('hero').classList.remove('pop');$('telegramButton').classList.remove('beat');
    void $('hero').offsetWidth;$('hero').classList.add('pop');$('telegramButton').classList.add('beat');
    if(lastEpicTimeout)clearTimeout(lastEpicTimeout);
    lastEpicTimeout=setTimeout(()=>{$('overlay').hidden=true;$('telegramButton').classList.remove('beat');},6500);
  }
  async function action(route,body={},success){
    try{const result=await api(route,body);if(result.link)updateLink(result.link);if(success)tell(success,true);return result;}
    catch(e){tell(e.message);return null;}
  }
  async function boot(){
    try{
      const config=await (await fetch('/api/config')).json();
      if(config.error)throw new Error(config.error);
      $('communityName').textContent=config.name;
      document.title=`${config.name} | Únete, bb 💗`;
      $('chatTitle').textContent=config.chatTitle;
      $('chatWelcome').textContent=config.welcome;
      buttonText=config.button;shout=config.shout;
      updateLink(config.link);
    }catch{tell('No se pudo cargar la configuración del sitio.');}
    const stream=new EventSource('/api/stream');
    stream.addEventListener('open',async()=>{
      online=true;
      let stored='';try{stored=(localStorage.getItem('bb_chat_nick')||'').trim();}catch{}
      if(stored && !nick)await claim(stored,true);
    });
    stream.addEventListener('error',()=>{online=false;$('onlineNum').textContent='—';$('presence').style.opacity='.5';});
    stream.addEventListener('history',e=>{try{JSON.parse(e.data).messages.forEach(appendMessage);}catch{}});
    stream.addEventListener('message-new',e=>{try{appendMessage(JSON.parse(e.data));}catch{}});
    stream.addEventListener('presence',e=>{try{$('onlineNum').textContent=String(JSON.parse(e.data).online);$('presence').style.opacity='1';}catch{}});
    stream.addEventListener('registered-count',e=>{try{registered=JSON.parse(e.data).registered;}catch{}});
    stream.addEventListener('session',e=>{try{const d=JSON.parse(e.data);if(d.nick){nick=d.nick;admin=d.isGabriela;showIdentity();}else if(nick){nick='';admin=false;showIdentity();}}catch{}});
    stream.addEventListener('link-state',e=>{try{updateLink(JSON.parse(e.data));}catch{}});
    stream.addEventListener('admin-roster',e=>{try{showRoster(JSON.parse(e.data));}catch{}});
    stream.addEventListener('challenge-state',e=>{try{challenge=JSON.parse(e.data);drawChallenge();}catch{}});
    stream.addEventListener('gabriela-epic',()=>doEpic());
  }

  $('nickInput').addEventListener('input',()=>{$('pinRow').hidden=$('nickInput').value.trim().toLocaleLowerCase('es')!=='gabriela';});
  $('nickForm').addEventListener('submit',async e=>{e.preventDefault();await claim($('nickInput').value);});
  $('changeNick').addEventListener('click',async()=>{
    const released=await action('/api/nick/release');
    if(!released)return;
    try{localStorage.removeItem('bb_chat_nick');}catch{}
    const old=nick;nick='';admin=false;showIdentity();$('nickInput').value=old;$('pinRow').hidden=old.toLowerCase()!=='gabriela';tell('Puedes elegir otro nick 💗',true);
  });
  $('messageForm').addEventListener('submit',async e=>{
    e.preventDefault();const text=$('messageInput').value.trim();if(!text)return;
    $('sendButton').disabled=true;
    const result=await action('/api/messages',{text});
    if(result){$('messageInput').value='';$('messageInput').focus();}
    $('sendButton').disabled=false;
  });
  $('epicButton').addEventListener('click',async()=>{await action('/api/epic',{},'Animación enviada a todos ✨');});
  $('closeOverlay').addEventListener('click',()=>{$('overlay').hidden=true;});
  $('enableAll').addEventListener('click',async()=>{
    await action('/api/link/global',{enabled:true},'🔓 Enlace activado para todos los nicks registrados 💗');
  });
  $('disableAll').addEventListener('click',async()=>{
    await action('/api/link/global',{enabled:false},'🔒 Enlace deshabilitado para todos.');
  });
  $('exclusiveMode').addEventListener('click',async()=>{
    await action('/api/link/exclusive',{},'🎯 Ahora solo entran los nicks autorizados por Gabriela.');
  });
  async function permission(enabled){
    const target=$('targetNick').value;if(!target){tell('Primero elige un nick conectado.');return;}
    await action('/api/link/person',{nick:target,enabled},enabled?`🔓 Acceso habilitado para ${target} en modo exclusivo`:`🔒 Acceso deshabilitado para ${target}`);
  }
  $('allowNick').addEventListener('click',()=>permission(true));
  $('denyNick').addEventListener('click',()=>permission(false));
  document.querySelectorAll('[data-challenge]').forEach(b=>b.addEventListener('click',async()=>{
    await action('/api/challenge/open',{type:b.dataset.challenge},'Reto abierto: invita a todos a participar 🎮');
  }));
  $('startChallenge').addEventListener('click',async()=>{await action('/api/challenge/start',{},'¡Reto comenzando! 🔥');});
  $('cancelChallenge').addEventListener('click',async()=>{await action('/api/challenge/cancel',{},'Reto cancelado.');});
  $('joinChallenge').addEventListener('click',async()=>{await action('/api/challenge/join',{},'¡Inscrito! A preparar los dedos 💗');});
  let actionBusy=false;
  $('playChallenge').addEventListener('click',async()=>{
    if(actionBusy||!challenge||challenge.phase!=='active'||challenge.deadline<=Date.now())return;
    actionBusy=true;
    try{await api('/api/challenge/action',{});}catch(e){tell(e.message);}
    finally{actionBusy=false;}
  });
  setInterval(updateClock,100);
  showIdentity();boot();
})();
