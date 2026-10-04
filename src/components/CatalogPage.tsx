import { setBrowseDepth, returnBrowseToPlayer } from '../services/browseNavigation';
import { DialogButton, Focusable, GamepadButton, Navigation, QuickAccessTab, useParams } from '@decky/ui';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FaArrowLeft, FaMusic } from 'react-icons/fa';
import { MdPlayArrow, MdPlaylistAdd, MdPlaylistPlay } from 'react-icons/md';
import { IoShuffleOutline } from 'react-icons/io5';
import { CatalogFilters, CatalogList } from './CatalogList';
import { ThemeScope } from './ThemeScope';
import { OverflowText, OverflowTextGroup } from './OverflowText';
import { actCatalogSong, actCatalogCollection, cachedCatalog, detailKey, loadCatalogDetail, openCatalog, selectedCatalog, type CatalogEntry, type CatalogFilter, type CatalogResult } from '../services/catalog';
import { requestLibraryTabReturn } from '../services/playlistNavigation';
import { type PlaylistAction } from '../services/playlistActions';
import { useArtworkAccent } from '../services/artworkPalette';
import { useI18n } from '../services/i18n';
import { resetPaginationScroll, usePaginationFocus } from '../services/pagination';
import { savedBrowseState, useBrowseReturn, requestBrowseReturn } from '../services/browseState';

const PAGE_SIZE=40;
export function CatalogPage(){
  const {key}=useParams<{key:string}>();
  // A new selection owns its filter, page and focus, including nested artists.
  return <CatalogDetail key={key} selection={selectedCatalog(key)} selectionKey={key}/>;
}
function CatalogDetail({selection,selectionKey:key}:{selection:ReturnType<typeof selectedCatalog>;selectionKey:string}){
  const entry=selection?.entry;
  const {t}=useI18n();
  const root=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null);
  const play=useRef<HTMLDivElement>(null),viewKey='catalog:'+key;
  const snapshot=savedBrowseState(viewKey);
  const {topNext,topPrevious,focusTop,cancelFocus}=usePaginationFocus(list);
  const [filter,setFilter]=useState<CatalogFilter>(()=>snapshot?.filter||'songs');
  const [result,setResult]=useState<CatalogResult>(()=>entry?cachedCatalog(detailKey(entry.kind,entry.id,snapshot?.filter||'songs'))||{}:{});
  const [loading,setLoading]=useState(!result.entries),[pending,setPending]=useState<string|null>(null);
  const [notice,setNotice]=useState(''),[page,setPage]=useState(()=>snapshot?.page||0),[focus,setFocus]=useState(0),[attempt,setAttempt]=useState(0);
  const browse=useBrowseReturn(viewKey,root,list,play,!loading,result.entries);
  const alive=useRef(true),busy=useRef(false),leaving=useRef(false);
  // Artist detail artwork may be a wide banner. Preserve the thumbnail the
  // user opened rather than replacing it with a differently cropped image.
  const image=entry?.kind==='artist'?entry.image||result.image:result.image||entry?.image;
  const accent=useArtworkAccent(image,root);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    let active=true;
    leaving.current=false;
    setNotice('');setPending(null);
    if(!entry){setLoading(false);return;}
    const cached=cachedCatalog(detailKey(entry.kind,entry.id,filter));
    setResult(cached||{});setLoading(!cached);
    void loadCatalogDetail(entry.kind,entry.id,filter).then(value=>{if(active)setResult(value);})
      .catch(()=>{if(active)setResult({error:t('catalog.connectionError')});})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[key,entry?.id,entry?.kind,filter,attempt]);
  const back=()=>{
    if(leaving.current)return;leaving.current=true;
    requestBrowseReturn(selection?.parentView);
    setBrowseDepth((selection?.returnDepth ?? 1) - 1);
    Navigation.NavigateBack();
    if(selection?.origin==='library')setTimeout(()=>{
      requestLibraryTabReturn();
      Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky);
    },180);
  };
  const cancel=(event:{preventDefault:()=>void;stopPropagation:()=>void})=>{event.preventDefault();event.stopPropagation();back();};
  useEffect(() => { setBrowseDepth(selection?.returnDepth ?? 1); }, [selection]);
  const returnToPlayer = () => {
    if (leaving.current) return;
    leaving.current = true;
    returnBrowseToPlayer(selection?.returnDepth ?? 1);
  };
  const act=async(item:CatalogEntry,mode:'play'|'next'|'append')=>{
    if(busy.current)return;busy.current=true;setPending(item.id);setNotice('');
    try{await actCatalogSong(item,mode);if(alive.current)mode==='play'?returnToPlayer():setNotice(t('catalog.queued'));}
    catch(cause){if(alive.current)setNotice(cause instanceof Error?cause.message:t('catalog.connectionError'));}
    finally{busy.current=false;if(alive.current)setPending(null);}
  };
  const actCollection=async(item:CatalogEntry,mode:PlaylistAction)=>{
    if(busy.current)return;
    busy.current=true;setPending(item.id);setNotice('');
    try{
      const action=await actCatalogCollection(item,mode);
      if(alive.current)action.started?returnToPlayer():setNotice(t('catalog.queued'));
    }catch(cause){if(alive.current)setNotice(cause instanceof Error?cause.message:t('catalog.connectionError'));}
    finally{busy.current=false;if(alive.current)setPending(null);}
  };
  const entries=result.entries||[],lastPage=Math.max(0,Math.ceil(entries.length/PAGE_SIZE)-1),visiblePage=Math.min(page,lastPage);
  const changePage=(direction:number,fromButton=false)=>{
    const next=Math.max(0,Math.min(lastPage,visiblePage+direction));
    if(next===visiblePage)return;
    setPage(next);
    if(fromButton){setFocus(0);focusTop(direction);}
    else {cancelFocus();setFocus(value=>value+1);}
    resetPaginationScroll(list.current);
  };
  const pagination=(top=false)=>lastPage>0&&<Focusable flow-children="horizontal" className="ytm-playlist-pagination">
    <DialogButton ref={top?topPrevious:undefined} className="ytm-button" aria-disabled={visiblePage===0} disabled={!top&&visiblePage===0} onClick={()=>changePage(-1,true)}>{t('common.previous')}</DialogButton>
    <span>{visiblePage+1}/{lastPage+1}</span>
    <DialogButton ref={top?topNext:undefined} className="ytm-button" aria-disabled={visiblePage===lastPage} disabled={!top&&visiblePage===lastPage} onClick={()=>changePage(1,true)}>{t('common.next')}</DialogButton>
  </Focusable>;
  return <Focusable ref={root} flow-children="vertical" className="ytm-ui ytm-playlist-page" onCancel={cancel} onCancelButton={cancel} onCancelActionDescription={t('common.back')}
    onButtonDown={event=>{
      if(event.detail.is_repeat)return;
      const direction=event.detail.button===GamepadButton.TRIGGER_LEFT?-1:event.detail.button===GamepadButton.TRIGGER_RIGHT?1:0;
      if(direction&&lastPage){event.preventDefault();event.stopPropagation();changePage(direction);}
    }}>
    <ThemeScope/>
    <Focusable flow-children="vertical" className="ytm-playlist-shell">
      <div className="ytm-playlist-top"><span className="ytm-eyebrow">{t('catalog.browse')}</span><DialogButton className="ytm-button" onClick={back}><FaArrowLeft/> {t('common.back')}</DialogButton></div>
      {entry&&<Focusable flow-children="horizontal" className="ytm-playlist-hero" style={{'--ytm-playlist-accent':accent} as CSSProperties}>
        <div className={'ytm-playlist-cover'+(entry.kind==='artist'?' ytm-artist-cover':'')}>{image?<img src={image} alt=""/>:<FaMusic size={36}/>}</div>
        <div className="ytm-playlist-details"><div className="ytm-eyebrow">{t('catalog.'+entry.kind)}</div>
          <OverflowTextGroup textKey={entry.id}><h2><OverflowText text={result.title||entry.title}/></h2></OverflowTextGroup><p>{entry.subtitle}</p></div>
        <Focusable flow-children="horizontal" className="ytm-playlist-actions">
          {(['play','shuffle','next','append'] as PlaylistAction[]).map((mode,index)=>{
            const label=t(['playlist.playAll','playlist.shuffle','playlist.playNext','playlist.addAll'][index]);
            return <DialogButton key={mode} ref={mode==='play'?play:undefined} data-ytm-focus-id={'hero:'+mode} preferredFocus={mode==='play'&&!browse.returning} className="ytm-button" disabled={!!pending} aria-label={label} onOKActionDescription={label} onClick={()=>void actCollection({...entry,playlistId:result.playlistId||entry.playlistId},mode)}>
              <span className="ytm-playlist-action-icon">{[<MdPlayArrow/>,<IoShuffleOutline/>,<MdPlaylistPlay/>,<MdPlaylistAdd/>][index]}</span></DialogButton>;
          })}
        </Focusable>
      </Focusable>}
      {entry?.kind==='artist'&&<CatalogFilters artist value={filter} onChange={value=>{cancelFocus();setFilter(value);setPage(0);setFocus(0);if(list.current)list.current.scrollTop=0;}}/>}
      {result.error&&<div className="ytm-error" role="alert">{result.error} <DialogButton className="ytm-button" onClick={()=>setAttempt(value=>value+1)}>{t('common.retry')}</DialogButton></div>}
      {notice&&<div role="status" className="ytm-collection-note">{notice}</div>}
      {loading&&<div role="status" className="ytm-empty">{t('common.loading')}</div>}
      {!loading&&!entries.length&&!result.error&&<div className="ytm-empty">{t('catalog.empty')}</div>}
      {pagination(true)}
      <div ref={list} className="ytm-playlist-tracks">
        <CatalogList entries={entries.slice(visiblePage*PAGE_SIZE,(visiblePage+1)*PAGE_SIZE)} pending={pending} focusRequest={focus}
          onOpen={item=>openCatalog(item,'route',browse.capture({filter,page:visiblePage},'entry:'+item.kind+':'+item.id))} onSong={(item,mode)=>void act(item,mode)} onCollection={(item,mode)=>void actCollection(item,mode)}/>
        {pagination()}
      </div>
    </Focusable>
  </Focusable>;
}
