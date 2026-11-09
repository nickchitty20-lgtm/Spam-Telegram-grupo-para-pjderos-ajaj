'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const app=window.bbApp;
  const create=(tag,klass,value)=>{const x=document.createElement(tag);if(klass)x.className=klass;if(value!==undefined)x.textContent=value;return x;};
  let poll=null;
  let settings={open:false,mediaOpen:false};
  let privates=[];
  let announcedId='';
  let announcedTimer=null;
  let mediaTimer=null;
  let currentMediaId='';
  let currentLink=app.getLink();
  function msg(t,ok=false){app.tell(t,ok);if(!ok)app.popToast(t);}
  async function act(endpoint,body={},success='') {
    try {const response=await app.api(endpoint,body);if(success)msg(success,true);return response;}
    catch(e){msg(e.message);return null;}
  }
  function getNick(){return app.getNick();}
  function who(){return app.getSelectedNick();}
  function requireSelected(){const name=who();if(!name){msg('Primero selecciona un nick de la lista.');return '';}return name;}
  function drawPoll(){
    $('pollPanel').hidden=!poll;
    $('pollHint').hidden=!!poll;
    $('pollBadge').textContent=poll ? (poll.open?'Votando':'Cerrada') : 'En espera';
    if(!poll)return;
    $('pollQuestion').textContent=poll.question;
    const remaining=Math.max(0,Math.ceil((poll.endsAt-Date.now())/1000));
    $('pollTime').textContent=(poll.open?`⏳ Termina en ${remaining}s`:'✅ Votación finalizada')+` · ${poll.total} voto(s)`;
    const box=$('pollOptions');box.replaceChildren();
    poll.options.forEach((opt,i)=>{
      const n=Number(poll.counts[i]||0),pct=poll.total?Math.round(n*100/poll.total):0;
      const button=create('button','poll-option'+(poll.myVote===i?' selected':''));button.type='button';
      button.disabled=!poll.open||poll.myVote!==null||!getNick();
      button.title=!getNick()?'Registra un nick antes de votar':'';
      const bar=create('div','poll-bar');bar.style.width=pct+'%';
      button.append(bar,create('span','',opt),create('span','poll-count',n+' · '+pct+'%'));
      button.addEventListener('click',async()=>{
        const result=await act('/api/extras/poll/vote',{option:i},'🗳️ ¡Tu voto fue registrado!');
        if(result){poll.myVote=i;drawPoll();}
      });
      box.append(button);
    });
    $('pollFeedback').textContent=poll.myVote!==null?'💗 Tu voto ya está contado':poll.open?(getNick()?'Selecciona una opción; solo puedes votar una vez.':'Registra tu nick para votar.'):'Resultados finales de esta votación.';
  }
  function repaintIdentity(){
    const nick=getNick();
    $('privateRoom').hidden=!(settings.open&&nick&&!app.isAdmin());
    $('privateMediaRow').hidden=!(settings.open&&settings.mediaOpen&&nick&&!app.isAdmin());
    drawPoll();
  }
  function drawDmSettings(){
    $('dmToggle').checked=!!settings.open;
    $('dmMediaToggle').checked=!!settings.mediaOpen;
    repaintIdentity();
  }
  function drawPrivate(){
    for(const [id,filter] of [['adminPrivateMessages',()=>true],['myPrivateMessages',m=>m.from===getNick()||m.to===getNick()]]){
      const parent=$(id);parent.replaceChildren();
      let messages=privates.filter(filter);
      if(!messages.length)parent.append(create('div','hint',id==='adminPrivateMessages'?'Aún no hay mensajes privados.':'Este chat privado empieza aquí 💕'));
      for(const m of messages.slice(-50)){
        const card=create('div','private-message'+(m.from===getNick()?' mine':''));
        const top=create('div','pm-header');top.append(create('strong','',m.from+' → '+m.to),create('small','',new Date(m.at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})));
        card.append(top);
        if(m.text)card.append(create('p','',m.text));
        if(m.mediaId){
          const isImage=m.mediaType&&m.mediaType.startsWith('image/');
          const media=create(isImage?'img':'video','private-attachment');
          media.src='/api/media/'+encodeURIComponent(m.mediaId);
          media.controls=!isImage;
          if(!isImage){media.setAttribute('controlsList','nodownload noplaybackrate');media.disablePictureInPicture=true;}
          media.draggable=false;media.oncontextmenu=e=>e.preventDefault();
          media.addEventListener('error',()=>{const unavailable=create('p','', '⏳ Archivo caducado o no disponible.');media.replaceWith(unavailable);});
          card.append(media);
        }
        parent.append(card);
      }
      parent.scrollTop=parent.scrollHeight;
    }
  }
  function showAnnouncement(data){
    if(!data||!data.text||data.expiresAt<=Date.now())return;
    const box=$('announcementOverlay');announcedId=data.id;
    $('announcementText').textContent=data.text;box.hidden=false;
    if(announcedTimer)clearInterval(announcedTimer);
    const started=Date.now(),duration=Math.max(1000,data.expiresAt-started);
    announcedTimer=setInterval(()=>{
      const remain=data.expiresAt-Date.now();
      $('announcementProgress').style.width=Math.min(100,Math.max(0,remain/duration*100))+'%';
      if(remain<=0){box.hidden=true;clearInterval(announcedTimer);announcedTimer=null;}
    },100);
  }
  function stopSpotlight(){
    $('spotlightOverlay').hidden=true;
    $('spotlightImg').removeAttribute('src');
    const video=$('spotlightVideo');video.pause();video.removeAttribute('src');video.load();
    currentMediaId='';if(mediaTimer)clearInterval(mediaTimer);mediaTimer=null;
  }
  function showSpotlight(data){
    if(!data||!data.id||data.expiresAt<=Date.now())return;
    stopSpotlight();
    currentMediaId=data.id;
    const isImage=String(data.mediaType).startsWith('image/');
    $('spotlightImg').hidden=!isImage;$('spotlightVideo').hidden=isImage;
    const element=isImage?$('spotlightImg'):$('spotlightVideo');
    element.src='/api/media/'+encodeURIComponent(data.id);
    element.oncontextmenu=e=>e.preventDefault();
    $('spotlightOverlay').hidden=false;
    mediaTimer=setInterval(()=>{
      if(!currentMediaId)return;
      const remaining=data.expiresAt-Date.now();
      $('mediaCountdown').textContent=Math.max(0,Math.ceil(remaining/1000))+'s';
      if(remaining<=0)stopSpotlight();
    },150);
  }
  function renderTelegramTarget(link){
    currentLink={...currentLink,...link};
    const active=currentLink.targetType||'group';
    $('activeTargetLabel').textContent='✈️ Destino actual: '+(active==='user'?'usuario personal':'grupo / canal');
    $('switchGroup').disabled=active==='group';$('switchUser').disabled=active==='user';
    if(currentLink.targets){
      $('telegramTargetUrl').value=currentLink.targets[$('telegramTargetType').value]||'';
    }
  }
  window.bbExtras={onEvent(type,data){
    if(type==='poll-state'){poll=data;drawPoll();}
    if(type==='private-settings'){settings=data;drawDmSettings();}
    if(type==='private-history'){privates=Array.isArray(data.messages)?data.messages:[];drawPrivate();}
    if(type==='private-message'){if(!privates.some(m=>m.id===data.id))privates.push(data);if(privates.length>120)privates.shift();drawPrivate();if(app.isAdmin())app.popToast('💌 Llegó un mensaje privado para Gabriela');}
    if(type==='spotlight')showSpotlight(data);
    if(type==='media-expired'&&data.id===currentMediaId)stopSpotlight();
    if(type==='announcement')showAnnouncement(data);
    if(type==='pinned'){$('pinnedBanner').hidden=!data.text;$('pinnedText').textContent=data.text||'';}
    if(type==='raffle-result')app.popToast('🎲 ¡El ganador del sorteo es '+data.nick+'!');
    if(type==='mute-state'&&data.until>Date.now())app.popToast('🔇 Gabriela silenció tu chat temporalmente.');
  }};
  for(const entry of window.bbExtraQueue||[])window.bbExtras.onEvent(...entry);
  window.bbExtraQueue=[];

  async function sendFile(file,kind,target,seconds){
    if(!file){msg('Primero selecciona una foto o video.');return null;}
    if(!/^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm))$/.test(file.type)){msg('Formato no permitido. Usa JPG, PNG, GIF, WebP, MP4 o WebM.');return null;}
    const max=file.type.startsWith('image/')?8:16;
    if(file.size>max*1024*1024){msg('Este archivo supera el límite de '+max+' MB.');return null;}
    const query=new URLSearchParams({kind,to:target||'',seconds:String(seconds||30)});
    try {
      const r=await fetch('/api/media/send?'+query.toString(),{method:'POST',body:file,headers:{'Content-Type':file.type}});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'No se pudo enviar el archivo.');
      msg('💌 Archivo enviado de forma privada.',true);return data;
    }catch(e){msg(e.message);return null;}
  }

  $('closeAnnouncement').addEventListener('click',()=>{$('announcementOverlay').hidden=true;});
  $('closeSpotlight').addEventListener('click',stopSpotlight);
  $('telegramTargetType').addEventListener('change',()=>renderTelegramTarget(currentLink));
  $('saveTelegramTarget').addEventListener('click',async()=>{
    const result=await act('/api/link/target',{type:$('telegramTargetType').value,link:$('telegramTargetUrl').value},'✈️ Nuevo destino de Telegram guardado.');
    if(result?.link)renderTelegramTarget(result.link);
  });
  for(const [id,type] of [['switchGroup','group'],['switchUser','user']])$(id).addEventListener('click',async()=>{
    const result=await act('/api/link/switch',{type},'Destino cambiado a '+(type==='group'?'grupo':'usuario personal'));
    if(result?.link)renderTelegramTarget(result.link);
  });
  $('sendAnnouncement').addEventListener('click',async()=>{
    await act('/api/extras/announce',{text:$('announcementInput').value,seconds:Number($('announceDuration').value),pin:$('announcePin').checked},'📣 Anuncio enviado a todos.');
  });
  $('savePinned').addEventListener('click',async()=>{
    await act('/api/extras/pin',{text:$('pinnedInput').value},'📌 Mensaje fijado actualizado.');
  });
  $('createPoll').addEventListener('click',async()=>{
    const choices=$('pollCreateOptions').value.split(/\n/).map(x=>x.trim()).filter(Boolean);
    await act('/api/extras/poll/create',{question:$('pollCreateQuestion').value,options:choices,duration:Number($('pollDuration').value)},'🗳️ Votación abierta para todos los nicks.');
  });
  $('closePoll').addEventListener('click',async()=>{await act('/api/extras/poll/close',{},'Votación cerrada.');});
  $('spotlight10').addEventListener('click',()=>{$('spotlightSeconds').value=10;});
  $('spotlight30').addEventListener('click',()=>{$('spotlightSeconds').value=30;});
  $('sendSpotlight').addEventListener('click',async()=>{
    const target=requireSelected();if(!target)return;
    const seconds=Number($('spotlightSeconds').value);
    if(!Number.isInteger(seconds)||seconds<5||seconds>120){msg('Especifica un tiempo entre 5 y 120 segundos.');return;}
    $('sendSpotlight').disabled=true;
    await sendFile($('spotlightFile').files[0],'spotlight',target,seconds);
    $('sendSpotlight').disabled=false;
  });
  $('saveDmSettings').addEventListener('click',async()=>{
    await act('/api/extras/dm/toggle',{open:$('dmToggle').checked,mediaOpen:$('dmMediaToggle').checked},'💬 Buzón actualizado.');
  });
  $('myPrivateForm').addEventListener('submit',async e=>{
    e.preventDefault();const text=$('myPrivateInput').value.trim();if(!text)return;
    const r=await act('/api/extras/dm/message',{text},'💌 Mensaje entregado a Gabriela.');
    if(r)$('myPrivateInput').value='';
  });
  $('myPrivateMediaSend').addEventListener('click',async()=>{
    const r=await sendFile($('myPrivateFile').files[0],'inbox','',30);
    if(r)$('myPrivateFile').value='';
  });
  $('adminPrivateSend').addEventListener('click',async()=>{
    const target=requireSelected();if(!target)return;
    const text=$('adminPrivateInput').value.trim();if(!text){msg('Escribe una respuesta.');return;}
    const r=await act('/api/extras/dm/message',{text,to:target},'💬 Respuesta privada enviada a '+target);
    if(r)$('adminPrivateInput').value='';
  });
  $('adminReplyMedia').addEventListener('click',async()=>{
    const target=requireSelected();if(!target)return;
    const r=await sendFile($('adminReplyFile').files[0],'reply',target,30);
    if(r)$('adminReplyFile').value='';
  });
  $('muteNick').addEventListener('click',async()=>{
    const target=requireSelected();if(target)await act('/api/extras/mute',{nick:target,seconds:300},'🔇 Silenciado: '+target);
  });
  $('unmuteNick').addEventListener('click',async()=>{
    const target=requireSelected();if(target)await act('/api/extras/mute',{nick:target,seconds:0},'🔊 Silencio retirado: '+target);
  });
  $('raffleNow').addEventListener('click',async()=>{await act('/api/extras/raffle',{},'🎲 Sorteo realizado entre los nicks conectados.');});
  document.addEventListener('bb:identity',()=>{repaintIdentity();drawPrivate();});
  document.addEventListener('bb:link',e=>{renderTelegramTarget(e.detail);});
  setInterval(()=>{if(poll && poll.open && poll.endsAt<=Date.now()){poll.open=false;drawPoll();}else if(poll) $('pollTime').textContent=(poll.open?'⏳ Termina en '+Math.max(0,Math.ceil((poll.endsAt-Date.now())/1000))+'s':'✅ Votación finalizada')+' · '+poll.total+' voto(s)';},400);
  repaintIdentity();
})();
