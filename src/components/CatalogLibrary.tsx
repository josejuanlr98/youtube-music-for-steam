import { LibraryToolbar } from './LibraryToolbar';
import { savedCatalogSort, saveCatalogSort, sortCatalog } from '../services/librarySort';
import { DialogButton, Focusable, GamepadButton } from '@decky/ui';
import { FaSearch } from 'react-icons/fa';
import { MediaRow } from './MediaRow';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CatalogList } from './CatalogList';
import { actCatalogSong, actCatalogCollection, cachedLibraryCategory, loadLibraryCategory, openCatalog, type CatalogEntry, type CatalogFilter, type CatalogResult } from '../services/catalog';
import { useI18n } from '../services/i18n';
import { resetPaginationScroll, usePaginationFocus } from '../services/pagination';
import { openSearch } from '../services/searchState';
import { savedBrowseState, useBrowseReturn } from '../services/browseState';

export function CatalogLibrary({category,onPlay,onCategoryChange,categoryFocusRequest}: {category:CatalogFilter;onPlay?:()=>void;onCategoryChange?:(value:CatalogFilter)=>void;categoryFocusRequest?:number}) {
  const {t}=useI18n();
  const viewKey='library:'+category,snapshot=savedBrowseState(viewKey);
  const [result,setResult]=useState<CatalogResult>(()=>cachedLibraryCategory(category)||{});
  const [loading,setLoading]=useState(!cachedLibraryCategory(category));
  const [fetching,setFetching]=useState(false),[attempt,setAttempt]=useState(0),[waiting,setWaiting]=useState(false);
  const [limit,setLimit]=useState<number|null>(()=>{if(snapshot?.limit!==undefined)return snapshot.limit;if(savedCatalogSort(category))return null;const cached=cachedLibraryCategory(category);return cached?cached.limit===undefined||cached.limit===0?200:cached.limit:200;});
  const [page,setPage]=useState(()=>snapshot?.page||0),[focus,setFocus]=useState(0);
  const root=useRef<HTMLDivElement>(null),requestedPage=useRef<number|null>(null);
  const requestedButton=useRef(false);
  const {topNext,topPrevious,focusTop,cancelFocus}=usePaginationFocus(root);
  const [pending,setPending]=useState<string|null>(null),[notice,setNotice]=useState('');
  const alive=useRef(true),busy=useRef(false);
  const lastAttempt=useRef(0);
  const browse=useBrowseReturn(viewKey,root,undefined,undefined,!loading,result.entries);
  const resetReader=(focusFirst=true)=>{
    if(focusFirst)setFocus(value=>value+1);
    resetPaginationScroll(root.current);
  };
  const focusPage=(direction:number,fromButton:boolean)=>{
    resetReader(!fromButton);
    if(fromButton){setFocus(0);focusTop(direction);}
    else cancelFocus();
  };
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    let active=true;
    const refresh=attempt!==lastAttempt.current;
    lastAttempt.current=attempt;
    const publish=(value:CatalogResult)=>{
      if(!active)return;
      setResult(previous=>value.error&&previous.entries?.length?{...previous,error:value.error}:value);
      setLoading(false);
      if(!value.error&&requestedPage.current!==null){
        setPage(Math.min(requestedPage.current,Math.max(0,Math.ceil((value.entries?.length||0)/40)-1)));
        requestedPage.current=null;setWaiting(false);focusPage(1,requestedButton.current);
      }
    };
    const load=async()=>{
      setFetching(true);
      try{
        if(refresh||!cachedLibraryCategory(category)){
          // Display the native first page before requesting continuations.
          const preview=await loadLibraryCategory(category,0,refresh);
          if(!active)return;
          publish(preview);
          if(preview.error||!preview.hasMore)return;
        }
        if(active)publish(await loadLibraryCategory(category,limit,false));
      }catch{publish({error:t('catalog.connectionError')});}
      finally{if(active){setLoading(false);setFetching(false);setWaiting(false);requestedPage.current=null;}}
    };
    void load();
    return()=>{active=false;};
  },[category,limit,attempt]);
  const act=async(entry:CatalogEntry,mode:'play'|'shuffle'|'next'|'append')=>{
    if(busy.current)return;
    busy.current=true;setPending(entry.id);setNotice('');
    try {
      if(entry.kind==='song')await actCatalogSong(entry,mode==='shuffle'?'play':mode);
      else await actCatalogCollection(entry,mode);
      if(alive.current)(mode==='play'||mode==='shuffle')?onPlay?.():setNotice(t('catalog.queued'));
    }catch(error){if(alive.current)setNotice(error instanceof Error?error.message:t('catalog.connectionError'));}
    finally{busy.current=false;if(alive.current)setPending(null);}
  };
  const [sort,setSort]=useState(()=>savedCatalogSort(category));
  // Re-sort only when the collection or ordering changes.
  const entries=useMemo(()=>sortCatalog(result.entries||[],sort),[result.entries,sort]);
  const lastPage=Math.max(0,Math.ceil(entries.length/40)-1),visiblePage=Math.min(page,lastPage);
  const changePage=(direction:number,fromButton=false)=>{
    if(waiting)return;
    if(direction>0&&visiblePage===lastPage&&result.hasMore){
      requestedPage.current=visiblePage+1;
      requestedButton.current=fromButton;
      setWaiting(true);
      if(fromButton)focusPage(direction,true);
      if(!fetching)setLimit(value=>value!==null&&value<5000?Math.min(5000,value+200):null);
      // Request focus after the new page arrives, never on a stale last row.
      return;
    }
    const next=Math.max(0,Math.min(lastPage,visiblePage+direction));
    if(next===visiblePage)return;
    requestedPage.current=null;setWaiting(false);setPage(next);focusPage(direction,fromButton);
  };
  const pagination=(top=false)=>(lastPage>0||result.hasMore)&&<Focusable className="ytm-playlist-pagination" flow-children="horizontal">
    <DialogButton ref={top?topPrevious:undefined} className="ytm-button" aria-disabled={visiblePage===0||waiting} disabled={!top&&(visiblePage===0||waiting)} onClick={()=>changePage(-1,true)}>{t('common.previous')}</DialogButton>
    <span>{visiblePage+1}/{lastPage+1}{result.hasMore?'+':''}</span>
    <DialogButton ref={top?topNext:undefined} className="ytm-button" aria-disabled={waiting||visiblePage===lastPage&&!result.hasMore} disabled={!top&&(waiting||visiblePage===lastPage&&!result.hasMore)} onClick={()=>changePage(1,true)}>{t('common.next')}</DialogButton>
  </Focusable>;
  return <Focusable ref={root} className="ytm-catalog-library" flow-children="vertical" onButtonDown={event=>{
    if(event.detail.is_repeat)return;
    const direction=event.detail.button===GamepadButton.TRIGGER_LEFT?-1:event.detail.button===GamepadButton.TRIGGER_RIGHT?1:0;
    if(direction&&(lastPage||result.hasMore)){event.preventDefault();event.stopPropagation();changePage(direction);}
  }}>
    <LibraryToolbar category={category} onCategoryChange={onCategoryChange} categoryFocusRequest={categoryFocusRequest} sort={sort} onSort={()=>{
      const next=(sort+1)%3;setSort(next);saveCatalogSort(category,next);
      requestedPage.current=null;setWaiting(false);setPage(0);setFocus(0);resetReader(false);
      // A global alphabetical order requires the complete collection. Keep
      // the visible preview usable while fetching the rest once, on demand.
      if(next && result.hasMore && limit!==null)setLimit(null);
    }} refreshDisabled={fetching || !!pending} onRefresh={()=>{requestedPage.current=null;setPage(0);resetReader();setAttempt(value=>value+1);}}/>
    <MediaRow focusId="search" title={t('library.search')} subtitle={t('library.searchHint')} icon={<FaSearch size={20}/>} onPlay={()=>openSearch(category,browse.capture({page:visiblePage,limit},'search'))}/>
    {(loading||fetching)&&<div className="ytm-collection-note" role="status">{t(loading?'common.loading':'catalog.loadingRest')}</div>}
    {result.error&&<div className="ytm-error" role="alert">{result.error}</div>}
    {notice&&<div className="ytm-collection-note" role="status">{notice}</div>}
    {pagination(true)}
    {!!entries.length&&<div className="ytm-catalog-results">
      <CatalogList entries={entries.slice(visiblePage*40,(visiblePage+1)*40)} pending={pending} focusRequest={focus} onOpen={entry=>openCatalog(entry,'library',browse.capture({page:visiblePage,limit},'entry:'+entry.kind+':'+entry.id))} onSong={(entry,mode)=>void act(entry,mode)} onCollection={(entry,mode)=>void act(entry,mode)}/>
    </div>}
    {!loading&&!entries.length&&!result.error&&<div className="ytm-empty">{t('catalog.empty')}</div>}
    {pagination()}

  </Focusable>;
}
