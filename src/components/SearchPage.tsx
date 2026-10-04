import { setBrowseDepth, returnBrowseToPlayer, returnBrowseToLibrary } from '../services/browseNavigation';
import { DialogButton, TextField, Focusable, GamepadButton } from '@decky/ui';
import { useEffect, useRef, useState } from 'react';
import { FaSearch, FaArrowLeft } from 'react-icons/fa';
import { ThemeScope } from './ThemeScope';
import { CatalogFilters, CatalogList } from './CatalogList';
import { actCatalogSong, actCatalogCollection, searchCatalog, openCatalog, type CatalogEntry, type CatalogFilter } from '../services/catalog';
import { useI18n } from '../services/i18n';
import { resetPaginationScroll, usePaginationFocus } from '../services/pagination';
import { getSearchState, saveSearchState } from '../services/searchState';
import { useBrowseReturn, requestBrowseReturn } from '../services/browseState';
export { clearSearchState } from '../services/searchState';

export const SearchPage=()=>{
  const {t}=useI18n();
  const snapshot=getSearchState();
  const [query,setQuery]=useState(snapshot.query),[filter,setFilter]=useState(snapshot.filter);
  const [entries,setEntries]=useState(snapshot.entries),[hasSearched,setHasSearched]=useState(snapshot.searched);
  const [searching,setSearching]=useState(false),[pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [page,setPage]=useState(snapshot.page),[focus,setFocus]=useState(0);
  const list=useRef<HTMLDivElement>(null);
  const root=useRef<HTMLDivElement>(null);
  const {topNext,topPrevious,focusTop,cancelFocus}=usePaginationFocus(list);
  const busy=useRef(false),request=useRef(0),alive=useRef(true),leaving=useRef(false);
  const browse=useBrowseReturn('search',root,list,undefined,!searching,entries);
  const back=()=>{if(leaving.current)return;leaving.current=true;requestBrowseReturn(snapshot.parentView);returnBrowseToLibrary(1);};
  const cancel=(event:{preventDefault:()=>void;stopPropagation:()=>void})=>{event.preventDefault();event.stopPropagation();back();};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
  useEffect(()=>{saveSearchState({query,filter,entries,searched:hasSearched,page,parentView:snapshot.parentView});},[query,filter,entries,hasSearched,page]);
  useEffect(() => { setBrowseDepth(1); }, []);
  const search=async(value:CatalogFilter=filter)=>{
    if(!query.trim())return;
    const id=++request.current;
    setSearching(true);setError('');setNotice('');setHasSearched(true);
    // Do not show a previous category under the newly selected filter.
    setEntries([]);setPage(0);setFocus(0);
    try{
      const result=await searchCatalog(query.trim(),value);
      if(!alive.current||id!==request.current)return;
      setEntries(result.entries||[]);setError(result.error||'');
    }catch{if(alive.current&&id===request.current)setError(t('catalog.connectionError'));}
    finally{if(alive.current&&id===request.current)setSearching(false);}
  };
  const act=async(entry:CatalogEntry,mode:'play'|'shuffle'|'next'|'append')=>{
    if(busy.current)return;
    busy.current=true;setPending(entry.id);setError('');setNotice('');
    try{
      if(entry.kind==='song')await actCatalogSong(entry,mode==='shuffle'?'play':mode);
      else await actCatalogCollection(entry,mode);
      if(!alive.current)return;
      if(mode==='play'||mode==='shuffle'){
        returnBrowseToPlayer(1);
      }else setNotice(t('catalog.queued'));
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:t('catalog.connectionError'));}
    finally{busy.current=false;if(alive.current)setPending(null);}
  };
  const lastPage=Math.max(0,Math.ceil(entries.length/40)-1),visiblePage=Math.min(page,lastPage);
  const changePage=(direction:number,fromButton=false)=>{
    const next=Math.max(0,Math.min(lastPage,visiblePage+direction));
    if(next===visiblePage)return;
    setPage(next);
    resetPaginationScroll(list.current);
    if(fromButton){setFocus(0);focusTop(direction);}
    else {cancelFocus();setFocus(value=>value+1);}
  };
  const pagination=(top=false)=>lastPage>0&&<Focusable className="ytm-playlist-pagination" flow-children="horizontal">
    <DialogButton ref={top?topPrevious:undefined} className="ytm-button" aria-disabled={visiblePage===0} disabled={!top&&visiblePage===0} onClick={()=>changePage(-1,true)}>{t('common.previous')}</DialogButton>
    <span>{visiblePage+1}/{lastPage+1}</span>
    <DialogButton ref={top?topNext:undefined} className="ytm-button" aria-disabled={visiblePage===lastPage} disabled={!top&&visiblePage===lastPage} onClick={()=>changePage(1,true)}>{t('common.next')}</DialogButton>
  </Focusable>;
  return <Focusable ref={root} flow-children="vertical" className="ytm-ui ytm-search-page" onCancel={cancel} onCancelButton={cancel} onCancelActionDescription={t('common.back')} onButtonDown={event=>{
    if(event.detail.is_repeat)return;
    const direction=event.detail.button===GamepadButton.TRIGGER_LEFT?-1:event.detail.button===GamepadButton.TRIGGER_RIGHT?1:0;
    if(direction&&lastPage){event.preventDefault();event.stopPropagation();changePage(direction);}
  }}>
    <ThemeScope/>
    <Focusable flow-children="vertical" className="ytm-search-content">
      <div className="ytm-search-header"><div><div className="ytm-eyebrow">{t('search.eyebrow')}</div><h2>{t('search.title')}</h2></div>
        <DialogButton className="ytm-button" onClick={back}><FaArrowLeft/> {t('common.back')}</DialogButton></div>
      <Focusable flow-children="horizontal" className="ytm-search-form">
        <div className="ytm-search-input"><TextField focusOnMount={!browse.returning} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void search();}}}/></div>
        <DialogButton className="ytm-button" disabled={searching||!query.trim()} onClick={()=>void search()}><FaSearch/> {searching?t('common.loading'):t('search.button')}</DialogButton>
      </Focusable>
      <CatalogFilters value={filter} onChange={value=>{cancelFocus();setFilter(value);setPage(0);if(query.trim())void search(value);}}/>
      {error&&<div role="alert" className="ytm-error">{error}</div>}
      {notice&&<div role="status" className="ytm-collection-note">{notice}</div>}
      {pagination(true)}
      <div ref={list} className="ytm-search-results">
        {!hasSearched&&<div className="ytm-empty">{t('catalog.searchHint')}</div>}
        {searching&&<div role="status" className="ytm-empty">{t('common.loading')}</div>}
        {hasSearched&&!searching&&!entries.length&&!error&&<div className="ytm-empty">{t('catalog.empty')}</div>}
        <CatalogList entries={entries.slice(visiblePage*40,(visiblePage+1)*40)} pending={pending} focusRequest={focus} onOpen={entry=>openCatalog(entry,'route',browse.capture({filter,page:visiblePage},'entry:'+entry.kind+':'+entry.id))} onSong={(entry,mode)=>void act(entry,mode)} onCollection={(entry,mode)=>void act(entry,mode)}/>
        {pagination()}
      </div>
    </Focusable>
  </Focusable>;
};
