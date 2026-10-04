import { useEffect, useRef, useState, type RefObject } from 'react';
import { focusLyricsReader } from './focus';
import type { CatalogFilter } from './catalog';

type BrowseState = { filter?:CatalogFilter; page?:number; limit?:number|null; focusId?:string; scrollTop?:number; returning?:boolean };
const states = new Map<string, BrowseState>();
const RETURN_EVENT = 'ytm-browse-return';
let generation = 0;
export function savedBrowseState(key:string) { return states.get(key); }
export function clearBrowseState() { generation++; states.clear(); }
function save(key:string, state:BrowseState) {
  states.delete(key); states.set(key, state);
  if (states.size > 48) states.delete(states.keys().next().value!);
}
export function requestBrowseReturn(key?:string) {
  if (!key || !states.has(key)) return;
  save(key, {...states.get(key), returning:true});
  const epoch = generation;
  // A remounted parent sees the intent immediately; a retained route receives
  // this event after Steam finishes revealing its previous navigation tree.
  setTimeout(() => { if (epoch === generation) window.dispatchEvent(new CustomEvent(RETURN_EVENT,{detail:key})); }, 180);
}
function scroller(root:HTMLElement|null, list?:HTMLElement|null) {
  let element = list || root;
  const view = element?.ownerDocument.defaultView;
  if (view?.getComputedStyle) for (let node = element; node; node = node.parentElement) {
    if (/^(auto|scroll|overlay)$/.test(view.getComputedStyle(node).overflowY)) return node;
  }
  return element;
}

/** Remember only deliberate child navigation, not unrelated remounts or tabs. */
export function useBrowseReturn(key:string, root:RefObject<HTMLElement|null>, list?:RefObject<HTMLElement|null>, play?:RefObject<HTMLDivElement|null>, ready=true, revision?:unknown) {
  const [request,setRequest] = useState(0);
  const initialFocused = useRef(false);
  useEffect(() => {
    const returned = (event:Event) => { if ((event as CustomEvent).detail === key) setRequest(value=>value+1); };
    window.addEventListener(RETURN_EVENT,returned);
    return () => window.removeEventListener(RETURN_EVENT,returned);
  },[key]);
  useEffect(() => {
    const snapshot = states.get(key);
    if (!snapshot?.returning) {
      if (!initialFocused.current && play?.current) return focusLyricsReader(play.current,()=>{initialFocused.current=true;});
      return;
    }
    if (!ready || !root.current) return;
    initialFocused.current=true;
    const element=root.current, view=element.ownerDocument.defaultView;
    if (!view) return;
    let frame=0, attempts=0, cancelFocus:undefined|(()=>void), cancelled=false;
    const restore=()=>{
      if(cancelled||!element.isConnected)return;
      const target=Array.from(element.querySelectorAll<HTMLElement>('[data-ytm-focus-id]')).find(node=>node.dataset.ytmFocusId===snapshot.focusId);
      // MediaRow hides an unresolved palette briefly. Do not focus a hidden row.
      if(target&&view.getComputedStyle(target).visibility!=='hidden') {
        const scroll=scroller(element,list?.current);
        if(scroll)scroll.scrollTop=snapshot.scrollTop||0;
        cancelFocus=focusLyricsReader(target,()=>{
          if(scroll)scroll.scrollTop=snapshot.scrollTop||0;
          if(states.get(key)===snapshot)save(key,{...snapshot,returning:false});
        });
      }else if(++attempts<120)frame=view.requestAnimationFrame(restore);
      // A first-page preview might not contain the remembered row yet. Keep
      // the intent; a later collection revision can complete the handoff.
    };
    frame=view.requestAnimationFrame(restore);
    return()=>{cancelled=true;view.cancelAnimationFrame(frame);cancelFocus?.();};
  },[key,ready,request,revision]);
  return {
    returning:!!states.get(key)?.returning,
    capture(state:BrowseState={},fallbackFocusId?:string) {
      const element=root.current;
      const active=element?.ownerDocument.activeElement?.closest<HTMLElement>('[data-ytm-focus-id]');
      const focused=active&&element?.contains(active)?active:element?.querySelector<HTMLElement>('.gpfocus[data-ytm-focus-id]');
      save(key,{...state,focusId:focused?.dataset.ytmFocusId||fallbackFocusId,scrollTop:scroller(element||null,list?.current)?.scrollTop||0,returning:false});
      return key;
    },
  };
}
