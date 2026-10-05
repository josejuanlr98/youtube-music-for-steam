/** Fullscreen reading motion, deliberately independent of song timing. */
export function startLyricsScroll(element: HTMLElement, initialPauseMs = 2000) {
  const doc=element.ownerDocument,view=doc.defaultView;
  let pausedUntil = Date.now() + initialPauseMs;
  let playing = true;
  let previous = Date.now();
  let position = element.scrollTop;
  let restartAt = 0;
  let manualPause = false;
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
    if(disposed || doc.visibilityState!=='visible' || !playing)return;
    const now=Date.now();
    const wakeAt=Math.max(now+idleMs,pausedUntil,restartAt);
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
    if(!playing || doc.visibilityState!=='visible' || now<pausedUntil){
      position=element.scrollTop;schedule();return;
    }
    const end=element.scrollHeight-element.clientHeight;
    // Translations can introduce overflow later without recreating the reader.
    if(end<=1){schedule(250);return;}
    if(manualPause){
      manualPause=false;
      // Continue from the settled manual position. Returning to a saved anchor
      // would fight controller/wheel motion; only timed lyrics follow a cue.
      position=Math.max(0,Math.min(end,element.scrollTop));
      // Manual browsing to the end has already waited the five-second delay.
      if(position>=end)restartAt=now;
    }
    if(restartAt){
      if(now<restartAt){schedule();return;}
      element.scrollTop=0;position=0;restartAt=0;
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
      const wasFollowing=!manualPause;
      manualPause=true;
      restartAt=0;pausedUntil=Date.now()+5000;schedule();
      return wasFollowing;
    },
    setPlaying(value:boolean){playing=value;previous=Date.now();position=element.scrollTop;schedule();},
    dispose(){disposed=true;cancelScheduled();doc.removeEventListener('visibilitychange',onVisibility);},
  };
}
