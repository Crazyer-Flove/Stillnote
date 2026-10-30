import type { FilterState } from '../types';
export interface SavedFilter { name: string; filter: FilterState }
export function cleanFilter(value: unknown): FilterState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as FilterState;
  if (!['all','pinned','favorites','trash'].includes(v.category) || !['newest','oldest'].includes(v.sortBy) || typeof v.searchKeyword !== 'string') return null;
  const result: FilterState = {category:v.category,sortBy:v.sortBy,searchKeyword:v.searchKeyword.slice(0,300),selectedTag:null};
  for (const key of ['dateFilter','weekFilter','monthFilter'] as const) if (typeof v[key]==='string' && ({dateFilter:/^\d{4}-\d{2}-\d{2}$/,weekFilter:/^\d{4}-W\d{2}$/,monthFilter:/^\d{4}-\d{2}$/}[key]).test(v[key]!)) result[key]=v[key];
  return result;
}
export function readSearches(workspace: string): { recent: string[]; saved: SavedFilter[] } {
  try { const data=JSON.parse(localStorage.getItem('stillnote_search_'+workspace)||'{}'); return {
    recent:Array.isArray(data.recent)?data.recent.filter((v:unknown)=>typeof v==='string').slice(0,10):[],
    saved:Array.isArray(data.saved)?data.saved.flatMap((v:SavedFilter)=>{const filter=cleanFilter(v?.filter);return filter&&typeof v.name==='string'?[{name:v.name.slice(0,60),filter}]:[];}).slice(0,8):[]
  }; } catch { return {recent:[],saved:[]}; }
}
export function writeSearches(workspace:string, data:ReturnType<typeof readSearches>) {
  localStorage.setItem('stillnote_search_'+workspace,JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('stillnote-search-preferences', {detail:workspace}));
}
export function rememberSearch(workspace:string,query:string) {
  query=query.trim().slice(0,300);if(!query)return;
  const data=readSearches(workspace);data.recent=[query,...data.recent.filter(v=>v!==query)].slice(0,10);writeSearches(workspace,data);
}
