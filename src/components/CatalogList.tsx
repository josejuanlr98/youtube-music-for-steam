import { DialogButton, Focusable } from '@decky/ui';
import { MdChevronRight, MdPlaylistAdd, MdPlaylistPlay, MdPlayArrow } from 'react-icons/md';
import { IoShuffleOutline } from 'react-icons/io5';
import { MediaRow, RowAction } from './MediaRow';
import { useI18n } from '../services/i18n';
import type { CatalogEntry, CatalogFilter } from '../services/catalog';
import { useEffect, useRef, useState } from 'react';
import { focusLyricsReader } from '../services/focus';

export function CatalogFilters({value,onChange,compact=false,artist=false,library=false,focusRequest=0}: {
  value:CatalogFilter; onChange:(value:CatalogFilter)=>void; compact?:boolean; artist?:boolean; library?:boolean; focusRequest?:number;
}) {
  const {t}=useI18n();
  const [expanded,setExpanded]=useState(false);
  const [returnFocus,setReturnFocus]=useState(0);
  const selector=useRef<HTMLDivElement>(null);
  useEffect(()=>!expanded && (focusRequest || returnFocus) ? focusLyricsReader(selector.current) : undefined,[expanded,focusRequest,returnFocus]);
  const options:CatalogFilter[]=artist?['songs','albums','singles','artists']:library?['playlists','albums','artists','songs']:['songs','albums','artists','playlists'];
  const label=(option:CatalogFilter)=>t(artist&&option==='artists'?'catalog.relatedArtists':'catalog.'+option);
  return compact ? <Focusable className="ytm-catalog-select" flow-children="vertical">
    <DialogButton ref={selector} data-ytm-focus-id="category" className="ytm-button" aria-label={t('catalog.filter')} aria-expanded={expanded} onClick={()=>setExpanded(current=>!current)}>
      <span>{label(value)}</span><span aria-hidden="true">{expanded?'▴':'▾'}</span>
    </DialogButton>
    {expanded&&<Focusable flow-children="vertical" className="ytm-catalog-options">
      {options.map(option=><DialogButton className="ytm-button" key={option} aria-pressed={value===option} onClick={()=>{setExpanded(false);setReturnFocus(current=>current+1);onChange(option);}}>{label(option)}</DialogButton>)}
    </Focusable>}
  </Focusable> : <Focusable className="ytm-catalog-filters" flow-children="horizontal">
    {options.map(option=><DialogButton ref={value===option?selector:undefined} data-ytm-focus-id={'filter:'+option} key={option} className="ytm-button" aria-pressed={value===option} onClick={()=>onChange(option)}>{label(option)}</DialogButton>)}
  </Focusable>;
}

export function CatalogList({entries,pending,onOpen,onSong,onCollection,focusRequest=0}: {
  entries:CatalogEntry[]; pending?:string|null; onOpen:(entry:CatalogEntry)=>void;
  onSong:(entry:CatalogEntry,mode:'play'|'next'|'append')=>void; focusRequest?:number;
  onCollection:(entry:CatalogEntry,mode:'play'|'shuffle')=>void;
}) {
  const {t}=useI18n();
  return <>{entries.map((entry,index)=><MediaRow key={entry.kind+entry.id+index} image={entry.image} imageFit={entry.kind==='artist'?'contain':'cover'}
    focusId={'entry:'+entry.kind+':'+entry.id} title={pending===entry.id?t('common.loading'):entry.title}
    subtitle={[entry.subtitle,t('catalog.'+entry.kind)].filter(Boolean).join(' · ')}
    disabled={!!pending} focusRequest={index===0?focusRequest:undefined}
    playDescription={entry.kind==='song'?t('catalog.playSong'):t('catalog.open')}
    onPlay={()=>entry.kind==='song'?onSong(entry,'play'):onOpen(entry)}
    endIcon={entry.kind==='song'?undefined:<MdChevronRight size={20}/>}
    actions={entry.kind==='song'?<>
      {!!entry.track?.duration&&<span className="ytm-track-duration">{Math.floor(entry.track.duration/60)}:{String(Math.floor(entry.track.duration%60)).padStart(2,'0')}</span>}
      <RowAction label={t('playlist.playNext')} disabled={!!pending} onClick={()=>onSong(entry,'next')}><MdPlaylistPlay size={21}/></RowAction>
      <RowAction label={t('playlist.addQueue')} disabled={!!pending} onClick={()=>onSong(entry,'append')}><MdPlaylistAdd size={21}/></RowAction>
    </>:<>
      <RowAction label={t('playlist.playAll')} disabled={!!pending} onClick={()=>onCollection(entry,'play')}><MdPlayArrow size={21}/></RowAction>
      <RowAction label={t('playlist.shuffle')} disabled={!!pending} onClick={()=>onCollection(entry,'shuffle')}><IoShuffleOutline size={21}/></RowAction>
    </>}/>)}</>;
}
