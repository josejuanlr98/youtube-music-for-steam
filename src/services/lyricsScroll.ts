/** Fullscreen reading motion, deliberately independent of song timing. */
export function startLyricsScroll(element: HTMLElement, initialPauseMs = 2000, move?: (top:number,instant:boolean)=>void) {
  const doc=element.ownerDocument,view=doc.defaultView;
  let pausedUntil = Date.now() + initialPauseMs;
  let playing = true;
  let previous = Date.now();
  let position = element.scrollTop;
  let restartAt = 0;
  let resumePosition: number | undefined;
  let frame=0,disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
  const cancelScheduled=()=>{
    if(frame)view?.cancelAnimationFrame(frame);
    frame=0;
    if(timer!==undefined)clearTimeout(timer);
    timer=undefined;
  };
  // RAF only while moving. Idle deadlines use one timeout; a hidden document
  // or paused playback needs no recurring animation callbacks.
  const schedule=(idleMs=0)=>{
    cancelScheduled();
    if(disposed || doc.visibilityState!=='visible' || (!playing && resumePosition===undefined))return;
    const now=Date.now();
    const wakeAt=Math.max(now+idleMs,resumePosition!==undefined?pausedUntil:Math.max(pausedUntil,restartAt));
    if(wakeAt>now || !view){
      timer=setTimeout(()=>{timer=undefined;previous=Date.now();tick();},Math.max(view?0:32,wakeAt-now));
    }else frame=view.requestAnimationFrame(tick);
  };
  const tick=()=>{
    frame=0;
    if(disposed)return;
    const now=Date.now();
    const elapsed=Math.min(100,Math.max(0,now-previous));
    previous=now;
    if(resumePosition!==undefined && now>=pausedUntil && doc.visibilityState==='visible'){
      const top=Math.min(resumePosition,Math.max(0,element.scrollHeight-element.clientHeight));
      resumePosition=undefined;
      if(move)move(top,false);
      else if(element.scrollTo)element.scrollTo({top,behavior:'smooth'});
      else element.scrollTop=top;
      position=top;
      pausedUntil=now+500;
    }
    if(!playing || doc.visibilityState!=='visible' || now<pausedUntil){
      position=element.scrollTop;schedule();return;
    }
    const end=element.scrollHeight-element.clientHeight;
    // Translations can introduce overflow later without recreating the reader.
    if(end<=1){schedule(250);return;}
    if(restartAt){
      if(now<restartAt){schedule();return;}
      element.scrollTop=0;position=0;restartAt=0;pausedUntil=now+2000;
      schedule();return;
    }
    position=Math.min(end,position+elapsed*.018);
    element.scrollTop=position;
    if(position>=end)restartAt=now+5000;
    schedule();
  };
  const onVisibility=()=>{previous=Date.now();schedule();};
  doc.addEventListener('visibilitychange',onVisibility);
  schedule();
  return {
    pause(){
      const wasFollowing=resumePosition===undefined;
      if(wasFollowing)resumePosition=position;
      restartAt=0;pausedUntil=Date.now()+5000;schedule();
      return wasFollowing;
    },
    setPlaying(value:boolean){playing=value;previous=Date.now();position=element.scrollTop;schedule();},
    dispose(){disposed=true;cancelScheduled();doc.removeEventListener('visibilitychange',onVisibility);},
  };
}
