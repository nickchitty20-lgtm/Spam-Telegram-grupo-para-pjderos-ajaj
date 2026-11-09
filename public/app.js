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
  let minPlayers = 3;
  let roster = [];
  let selectedNick = ''; // se elige por el nick visible, nunca por el índice de la lista
  let shout = 'entra bb 💕';
  let buttonText = 'Únete, bb 💗';
  let lastEpicTimeout = null;
  const seen = new Set();
  const quizTypes = ['trivia','math','scramble','riddle','romance','emoji','sequence','memory','luck'];
  const choiceTypes=['trivia','romance','emoji','sequence','memory','luck'];
  let lastQuizKey = '';
  let quizBusy = false;
  let typingStopTimer = null;
  let lastTypingAt = 0;
  let toastTimer = null;
  const icePrompts = [
    '💘 ¿Cómo describirías tu cita ideal en cinco palabras?',
    '🌹 Convéncela con tu piropo más original (sin ser pesado).',
    '😎 ¿Qué canción elegirías para una primera cita?',
    '💌 Escribe una invitación graciosa que no incluya la palabra «amor».',
    '🍕 ¿Pizza, café o karaoke? Defiende tu elección.',
    '🎬 Si tu historia romántica fuera una película, ¿cómo se llamaría?',
    '😂 ¿Qué harías si Gabriela te deja en visto 10 minutos?',
    '🔥 ¿Cuál es tu mejor habilidad secreta para impresionar a alguien?',
    '💜 Cuenta tu anécdota de cita más divertida sin revelar datos personales.',
    '🎲 ¿Qué superpoder elegirías para una cita perfecta?'
  ];
  let iceIndex=0;
  function popToast(text){
    const toast=$('liveToast');toast.textContent=text;toast.hidden=false;
    if(toastTimer)clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.hidden=true,3600);
  }
  function openHowto(){
    $('howtoBackdrop').hidden=false;$('howtoDrawer').hidden=false;
    $('openHowto').setAttribute('aria-expanded','true');$('closeHowto').focus();
  }
  function closeHowto(){
    $('howtoBackdrop').hidden=true;$('howtoDrawer').hidden=true;
    $('openHowto').setAttribute('aria-expanded','false');$('openHowto').focus();
  }


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
    // El panel usa exclusivamente los nicks reales registrados en el servidor.
    // No mostramos IDs de sesiones ni números de posición como si fueran nombres.
    roster=Array.isArray(data.users) ? data.users.filter(u=>u && typeof u.nick==='string' && u.nick.trim()) : [];
    registered=Number.isFinite(data.registered) ? data.registered : roster.length;
    if(Number.isInteger(data.minPlayers) && data.minPlayers >= 2) minPlayers=data.minPlayers;
    $('registeredLabel').textContent=`Nicks conectados: ${registered}/${minPlayers} mínimos`;
    if(!roster.some(u=>u.nick===selectedNick)) selectedNick='';
    const list=$('nickList');list.replaceChildren();
    if(!roster.length) {
      list.appendChild(el('div','nick-empty','Ningún usuario ha registrado su nick todavía.'));
    } else {
      for(const user of roster){
        const selected=user.nick===selectedNick;
        const item=el('button','nick-item'+(selected?' selected':''));
        item.type='button';item.setAttribute('aria-pressed',String(selected));
        item.setAttribute('aria-label','Seleccionar nick '+user.nick);
        const person=el('span','nick-name');
        const symbol=el('span','nick-avatar','👤');
        const name=el('strong','',user.nick);
        person.append(symbol,name);
        const state=el('span','nick-access '+(user.access?'yes':'no'),user.access?'🔓 Permitido':'🔒 Bloqueado');
        item.append(person,state);
        item.addEventListener('click',()=>{ selectedNick=user.nick;showRoster({users:roster,registered}); });
        list.appendChild(item);
      }
    }
    const hasSelection=!!selectedNick;
    $('selectedNickLabel').textContent=hasSelection?'Seleccionado: '+selectedNick:'Toca un nick para seleccionarlo';
    $('allowNick').disabled=!hasSelection;
    $('denyNick').disabled=!hasSelection;
    document.querySelectorAll('[data-challenge]').forEach(b=>b.disabled=registered<minPlayers);
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
    $('quizArea').hidden=!challenge || !quizTypes.includes(challenge.type);
    if(!challenge)lastQuizKey='';
    $('winnerBanner').hidden=!challenge||challenge.phase!=='finished'||!challenge.winner;
    $('awardWinner').hidden=!(admin&&challenge&&challenge.phase==='finished'&&challenge.winner);
    $('awardWinner').disabled=!!challenge?.prizeGranted;
    $('awardWinner').textContent=challenge?.prizeGranted?'✅ Acceso concedido al finalista':'💌 Dar acceso privado al ganador';
    if(challenge?.phase==='finished'&&challenge.winner){
      $('winnerTitle').textContent=challenge.winner+' · Finalista 💘';
      $('winnerSubtitle').textContent=challenge.prizeGranted?'Gabriela le habilitó la invitación al grupo 🔓':'Gabriela decidirá si le habilita el grupo privado 💌';
    }
    $('challengeIntro').hidden=!!challenge;
    $('challengeBadge').textContent=challenge?({signup:'Inscripciones',countdown:'Preparados',preview:'Memoriza 👀',active:'Jugando',between:'Siguiente ronda',finished:'Finalizado'}[challenge.phase]||'Reto'):'En espera';
    const start=$('startChallenge'),cancel=$('cancelChallenge');
    start.disabled=!(admin&&challenge&&challenge.phase==='signup'&&challenge.participants.length>=(challenge.minPlayers||minPlayers));
    cancel.disabled=!(admin&&challenge);
    if(!challenge)return;
    $('challengeTitle').textContent=challenge.title;
    $('challengePhase').textContent=challenge.phase==='signup'?'Inscripción abierta':challenge.phase==='countdown'?`Ronda ${challenge.round} · Preparándose`:challenge.phase==='active'?`Ronda ${challenge.round}${challenge.totalRounds?' de '+challenge.totalRounds:''} · ¡En acción!`:challenge.phase==='preview'?`Ronda ${challenge.round} · ¡Memoriza los emojis!`:challenge.phase==='between'?`Ronda ${challenge.round} finalizada`:challenge.phase==='finished'?'🏁 Resultado final':'...';
    $('challengeNote').textContent=challenge.note||'';
    const participant=challenge.participants.find(p=>p.nick===nick);
    $('joinChallenge').hidden=challenge.phase!=='signup'||!nick||!!participant;
    const quiz=quizTypes.includes(challenge.type);
    $('playChallenge').hidden=quiz||challenge.phase!=='active'||!participant||!participant.alive;
    if(quiz) {
      const q=challenge.question;
      const active=challenge.phase==='active';
      const mayAnswer=active&&!!participant&&participant.alive&&!participant.answered;
      const choice=choiceTypes.includes(challenge.type);
      $('quizQuestion').textContent=q ? q.prompt+(q.reveal?' · ✅ '+q.reveal:'') : challenge.phase==='signup'?'Inscríbete para jugar tres rondas.':challenge.phase==='countdown'?'🕓 La pregunta aparecerá en unos segundos...':'¡Ronda terminada!';
      $('quizChoices').hidden=!choice||!mayAnswer;
      $('quizForm').hidden=choice||!mayAnswer;
      if(choice&&mayAnswer&&q){
        const area=$('quizChoices');area.replaceChildren();
        for(const option of q.options){
          const btn=el('button','quiz-choice',option);
          btn.type='button';btn.disabled=quizBusy;
          btn.addEventListener('click',()=>submitQuizAnswer(option));
          area.appendChild(btn);
        }
      }
      const newKey=challenge.id+':'+challenge.round;
      if(lastQuizKey!==newKey){
        lastQuizKey=newKey;$('quizInput').value='';$('quizFeedback').textContent='';quizBusy=false;
      }
      $('quizSubmit').disabled=quizBusy;
      $('quizInput').disabled=quizBusy;
      if(challenge.phase==='preview'){
        $('quizFeedback').textContent='👀 Mira bien el orden. Después tendrás que recordar una posición.';
      } else if(active){
        $('quizFeedback').textContent=participant?.answered ? `✅ Respuesta registrada · ${challenge.responded}/${challenge.participants.length} respondieron` :
          mayAnswer ? `⏳ ${challenge.responded}/${challenge.participants.length} respondieron · Tienes un intento` :
          `👀 ${challenge.responded}/${challenge.participants.length} respondieron en vivo`;
      } else if(q?.reveal){
        $('quizFeedback').textContent='✅ La respuesta era: '+q.reveal;
      } else {
        $('quizFeedback').textContent='';
      }
    }
    $('playChallenge').textContent=challenge.type==='first'?'⚡ ¡SOY EL PRIMERO!':'🔥 ¡TOCA, TOCA, TOCA!';
    $('participationLabel').textContent=!nick?'Registra tu nick para participar.':challenge.phase==='signup'&&participant?'✅ Estás inscrito. Gabriela decidirá cuándo empezar.':participant&&!participant.alive?'❌ Has quedado eliminado. Ahora puedes espectar.':challenge.phase==='finished'&&challenge.winner?`🎉 Ganador: ${challenge.winner}`:challenge.phase==='active'&&!participant?'👀 Estás espectando el reto.':challenge.phase==='countdown'&&participant?'⏳ Prepárate para pulsar el botón.':'';
    $('scoreCount').textContent=`${challenge.participants.length}/${challenge.minPlayers||minPlayers} participantes`;
    if(quiz){
      $('scoreCount').textContent+=` · Ronda ${challenge.round}/${challenge.totalRounds}`;
    }
    const sb=$('scoreboard');sb.replaceChildren();
    const sorted=challenge.participants;
    sorted.forEach((p,i)=>{
      const item=el('div','score'+(!p.alive?' lost':'')+(challenge.phase==='finished'&&challenge.winner===p.nick?' winner':''));
      item.appendChild(el('span','',`${i+1}.`));item.appendChild(el('b','',p.nick));
      const points=quiz?`${p.score} ${p.score===1?'punto':'puntos'}${p.answered&&challenge.phase==='active'?' · ✓':''}`:
        `${p.score} ${p.score===1?'toque':'toques'}`;
      item.appendChild(el('span','points',p.alive?points:'ELIMINADO'));
      sb.appendChild(item);
    });
    updateClock();
  }
  async function submitQuizAnswer(answer){
    if(quizBusy||!challenge||challenge.phase!=='active'||challenge.deadline<=Date.now())return;
    const p=challenge.participants.find(x=>x.nick===nick);
    if(!p||!p.alive||p.answered)return;
    quizBusy=true;
    $('quizSubmit').disabled=true;
    document.querySelectorAll('.quiz-choice').forEach(btn=>btn.disabled=true);
    try{
      await api('/api/challenge/action',{answer});
      $('quizFeedback').textContent='✅ Respuesta enviada. Espera la siguiente ronda 💗';
    }catch(err){
      tell(err.message);$('quizFeedback').textContent=err.message;
    }finally{quizBusy=false;}
  }
  function renderTyping(nicks){
    const list=Array.isArray(nicks)?nicks.filter(x=>typeof x==='string'&&x):[];
    const indicator=$('typingIndicator');
    if(!list.length){indicator.hidden=true;return;}
    const labels=list.map(n=>n===nick?'Tú':n);
    let label;
    if(labels.length===1) label=labels[0]+(labels[0]==='Tú'?' estás':' está')+' escribiendo…';
    else if(labels.length===2)label=labels.join(' y ')+' están escribiendo…';
    else label=labels.slice(0,2).join(', ')+' y '+(labels.length-2)+' más están escribiendo…';
    $('typingText').textContent=label;
    indicator.hidden=false;
  }
  function signalTyping(active){
    if(!nick||!online)return;
    api('/api/typing',{typing:active}).catch(()=>{});
  }
  function stoppedTyping(){
    if(typingStopTimer){clearTimeout(typingStopTimer);typingStopTimer=null;}
    lastTypingAt=0;
    signalTyping(false);
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
      document.title=`La conquista de Gabriela 💘 | ${config.name}`;
      $('chatTitle').textContent=config.chatTitle;
      $('chatWelcome').textContent=config.welcome;
      buttonText=config.button;shout=config.shout;
      if(Number.isInteger(config.minPlayers)) minPlayers=config.minPlayers;
      $('howtoMin').textContent=String(minPlayers);
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
    stream.addEventListener('registered-count',e=>{try{const data=JSON.parse(e.data); registered=data.registered; if(Number.isInteger(data.minPlayers))minPlayers=data.minPlayers; $('registeredLabel').textContent=`Nicks conectados: ${registered}/${minPlayers} mínimos`; document.querySelectorAll('[data-challenge]').forEach(b=>b.disabled=registered<minPlayers);}catch{}});
    stream.addEventListener('session',e=>{try{const d=JSON.parse(e.data);if(d.nick){nick=d.nick;admin=d.isGabriela;showIdentity();}else if(nick){nick='';admin=false;showIdentity();}}catch{}});
    stream.addEventListener('link-state',e=>{try{updateLink(JSON.parse(e.data));}catch{}});
    stream.addEventListener('admin-roster',e=>{try{showRoster(JSON.parse(e.data));}catch{}});
    stream.addEventListener('challenge-state',e=>{try{challenge=JSON.parse(e.data);drawChallenge();}catch{}});
    stream.addEventListener('gabriela-epic',()=>doEpic());
    stream.addEventListener('typing',e=>{try{renderTyping(JSON.parse(e.data).nicks);}catch{}});
    stream.addEventListener('live-reaction',e=>{try{showReaction(JSON.parse(e.data));}catch{}});
    stream.addEventListener('winner-prize',e=>{try{popToast('💌 Gabriela invitó a '+JSON.parse(e.data).nick+' al grupo privado');}catch{}});
  }

  $('openHowto').addEventListener('click',openHowto);
  $('closeHowto').addEventListener('click',closeHowto);
  $('gotItHowto').addEventListener('click',closeHowto);
  $('howtoBackdrop').addEventListener('click',closeHowto);
  document.addEventListener('keydown',e=>{
    if($('howtoDrawer').hidden)return;
    if(e.key==='Escape'){closeHowto();return;}
    if(e.key==='Tab'){
      const focusables=[$('closeHowto'),$('gotItHowto')];
      const first=focusables[0], last=focusables[focusables.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  $('iceQuestion').textContent=icePrompts[0];
  $('anotherIce').addEventListener('click',()=>{
    let next=iceIndex;
    while(next===iceIndex) next=Math.floor(Math.random()*icePrompts.length);
    iceIndex=next;$('iceQuestion').textContent=icePrompts[iceIndex];
  });
  $('useIce').addEventListener('click',()=>{
    if(!nick){tell('Primero registra tu nick para responder en el chat 💗');$('nickForm').scrollIntoView({behavior:'smooth',block:'center'});$('nickInput').focus();return;}
    $('messageInput').value=icePrompts[iceIndex]+' — ';
    $('messageForm').scrollIntoView({behavior:'smooth',block:'center'});$('messageInput').focus();
  });
  const reactionFeed=$('reactionFeed');
  function showReaction(data){
    if(!data||!['💗','🔥','😍','👏'].includes(data.emoji))return;
    const chip=el('span','reaction-chip',data.emoji+' '+(data.nick||'Visitante'));
    reactionFeed.appendChild(chip);
    while(reactionFeed.children.length>4)reactionFeed.firstElementChild.remove();
    setTimeout(()=>{chip.remove();},2900);
  }
  document.querySelectorAll('[data-reaction]').forEach(button=>button.addEventListener('click',async()=>{
    try{await api('/api/reaction',{emoji:button.dataset.reaction});}catch(e){tell(e.message);}
  }));
  $('nickInput').addEventListener('input',()=>{$('pinRow').hidden=$('nickInput').value.trim().toLocaleLowerCase('es')!=='gabriela';});
  $('nickForm').addEventListener('submit',async e=>{e.preventDefault();await claim($('nickInput').value);});
  $('changeNick').addEventListener('click',async()=>{
    stoppedTyping();
    const released=await action('/api/nick/release');
    if(!released)return;
    try{localStorage.removeItem('bb_chat_nick');}catch{}
    const old=nick;nick='';admin=false;showIdentity();$('nickInput').value=old;$('pinRow').hidden=old.toLowerCase()!=='gabriela';tell('Puedes elegir otro nick 💗',true);
  });
  $('messageInput').addEventListener('input',()=>{
    if(!nick||!online)return;
    if(typingStopTimer)clearTimeout(typingStopTimer);
    if(!$('messageInput').value.trim()){stoppedTyping();return;}
    const now=Date.now();
    if(now-lastTypingAt>=1400){lastTypingAt=now;signalTyping(true);}
    typingStopTimer=setTimeout(stoppedTyping,2000);
  });
  $('messageInput').addEventListener('blur',()=>{if(!document.activeElement||document.activeElement!==$('sendButton'))stoppedTyping();});
  $('messageForm').addEventListener('submit',async e=>{
    e.preventDefault();const text=$('messageInput').value.trim();if(!text)return;
    stoppedTyping();
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
    const target=selectedNick;if(!target){tell('Primero toca el nick de la lista.');return;}
    await action('/api/link/person',{nick:target,enabled},enabled?`🔓 Acceso habilitado para ${target} en modo exclusivo`:`🔒 Acceso deshabilitado para ${target}`);
  }
  $('allowNick').addEventListener('click',()=>permission(true));
  $('denyNick').addEventListener('click',()=>permission(false));
  document.querySelectorAll('[data-challenge]').forEach(b=>b.addEventListener('click',async()=>{
    await action('/api/challenge/open',{type:b.dataset.challenge},'Reto abierto: invita a todos a participar 🎮');
  }));
  $('awardWinner').addEventListener('click',async()=>{
    if(!challenge?.winner || !admin)return;
    if(!confirm('¿Habilitar el acceso privado a '+challenge.winner+'? Gabriela conserva el control del enlace.'))return;
    await action('/api/challenge/prize',{},'💌 Invitación privada concedida al ganador');
  });
  $('startChallenge').addEventListener('click',async()=>{await action('/api/challenge/start',{},'¡Reto comenzando! 🔥');});
  $('cancelChallenge').addEventListener('click',async()=>{await action('/api/challenge/cancel',{},'Reto cancelado.');});
  $('joinChallenge').addEventListener('click',async()=>{await action('/api/challenge/join',{},'¡Inscrito! A preparar el reto 💗');});
  $('quizForm').addEventListener('submit',e=>{e.preventDefault();const value=$('quizInput').value.trim();if(value)submitQuizAnswer(value);});
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
