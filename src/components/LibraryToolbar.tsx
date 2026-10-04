import { Focusable } from '@decky/ui';
import { useState, type ReactNode } from 'react';
import { MdRefresh, MdSort } from 'react-icons/md';
import { CatalogFilters } from './CatalogList';
import { RowAction } from './MediaRow';
import type { CatalogFilter } from '../services/catalog';
import { useI18n } from '../services/i18n';

export function LibraryToolbar({category,onCategoryChange,categoryFocusRequest,sort,onSort,onRefresh,refreshDisabled,sortDisabled,children}: {
  category:CatalogFilter; onCategoryChange?:(category:CatalogFilter)=>void;
  categoryFocusRequest?:number; sort:number; onSort:()=>void; onRefresh:()=>void;
  refreshDisabled?:boolean; sortDisabled?:boolean; children?:ReactNode;
}) {
  const {t}=useI18n();
  const [sortFocus,setSortFocus]=useState(0);
  const order=sort===1?'A–Z':sort===2?'Z–A':t(sort===3?'library.custom':'library.defaultOrder');
  return <>
    <Focusable className="ytm-library-toolbar" flow-children="horizontal">
      <div className="ytm-library-toolbar-filter"><CatalogFilters compact library value={category} focusRequest={categoryFocusRequest} onChange={onCategoryChange||(()=>{})}/></div>
      <Focusable className="ytm-library-toolbar-actions" flow-children="horizontal">
        {children}
        <RowAction label={`${t('library.sort')}: ${order}`} disabled={sortDisabled} focusRequest={sortFocus} onClick={()=>{onSort();setSortFocus(value=>value+1);}}><MdSort size={18}/></RowAction>
        <RowAction label={t('library.refresh')} disabled={refreshDisabled} onClick={onRefresh}><MdRefresh size={18}/></RowAction>
      </Focusable>
    </Focusable>
    <div className="ytm-collection-heading"><span>{t(`library.${category}Title`)}</span><span className="ytm-muted">{sort?order:''}</span></div>
  </>;
}
