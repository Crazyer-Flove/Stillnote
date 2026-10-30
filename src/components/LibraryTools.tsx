import React, { useEffect, useState } from 'react';
import type { FilterState, Note, Workspace } from '../types';
import { readSearches, writeSearches } from '../utils/searchPreferences';
import { downloadFile, exportNotesContent } from '../utils/markdownUtils';
export type BatchAction = 'move' | 'tag' | 'trash';
export function SearchTools({workspace,filter,onApply,onError}:{workspace:string;filter:FilterState;onApply:(v:Partial<FilterState>)=>void;onError:(v:string)=>void}) {
 const [data,setData]=useState(()=>readSearches(workspace)); const [name,setName]=useState('');
 useEffect(()=>{const refresh=()=>setData(readSearches(workspace));window.addEventListener('stillnote-search-preferences',refresh);return()=>window.removeEventListener('stillnote-search-preferences',refresh);},[workspace]);
 const save=(next:typeof data)=>{try{writeSearches(workspace,next);setData(next);}catch{onError('筛选偏好保存失败，请检查浏览器存储空间。');}};
 return <details className="sn-search-tools"><summary>最近搜索与常用筛选</summary><div className="sn-setting-card space-y-3">
 <div className="flex gap-2 flex-wrap">{data.recent.map(q=><button className="sn-text-button" key={q} onClick={()=>onApply({searchKeyword:q})}>{q}</button>)}{!data.recent.length&&<span className="sn-caption">输入关键词后按 Enter 或离开搜索框，即可记录。</span>}</div>
 <label className="sn-field">筛选名称<input value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label><button className="sn-text-button" disabled={!name.trim()} onClick={()=>{save({...data,saved:[{name:name.trim(),filter:{...filter}},...data.saved.filter(v=>v.name!==name.trim())].slice(0,8)});setName('');}}>保存当前组合</button>
 {data.saved.map(v=><div key={v.name} className="flex gap-3"><button className="sn-text-button" onClick={()=>onApply({dateFilter:null,weekFilter:null,monthFilter:null,...v.filter})}>{v.name}</button><button className="sn-text-button" aria-label={'移除筛选 '+v.name} onClick={()=>save({...data,saved:data.saved.filter(s=>s.name!==v.name)})}>移除</button></div>)}
 <button className="sn-text-button" onClick={()=>save({...data,recent:[]})}>清空搜索记录</button></div></details>;
}
export function BatchTools({notes,workspaces,onAction}:{notes:Note[];workspaces:Workspace[];onAction:(ids:string[],action:BatchAction,value?:string)=>boolean}) {
 const [open,setOpen]=useState(false),[ids,setIds]=useState<string[]>([]),[target,setTarget]=useState(''),[tag,setTag]=useState('');
 const selected=notes.filter(n=>!n.deletedAt&&ids.includes(n.id));
 const apply=(action:BatchAction,value?:string)=>{if(onAction(selected.map(n=>n.id),action,value))setIds([]);};
 return <div className="sn-batch-tools"><button className="sn-text-button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'结束批量选择':'批量操作'}</button>{open&&<div className="sn-setting-card space-y-3">
 <label className="sn-check-label"><input type="checkbox" checked={notes.length>0&&selected.length===notes.filter(n=>!n.deletedAt).length} onChange={e=>setIds(e.target.checked?notes.filter(n=>!n.deletedAt).map(n=>n.id):[])}/>全选当前结果 · 已选 {selected.length} 条</label>
 <div className="sn-batch-list">{notes.filter(n=>!n.deletedAt).map(n=><label key={n.id} className="sn-check-label"><input type="checkbox" checked={ids.includes(n.id)} onChange={e=>setIds(e.target.checked?[...ids,n.id]:ids.filter(id=>id!==n.id))}/>{n.content.split('\n')[0].replace(/^#+\s*/,'').slice(0,70)||'空白笔记'}</label>)}</div>
 <div className="flex gap-3 flex-wrap"><label>目标工作区<select aria-label="批量移动目标工作区" value={target} onChange={e=>setTarget(e.target.value)}><option value="">选择工作区</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><button className="sn-text-button" disabled={!selected.length||!target} onClick={()=>apply('move',target)}>移动</button></div>
 <div className="flex gap-3 flex-wrap"><input aria-label="批量添加标签" placeholder="标签名称" value={tag} onChange={e=>setTag(e.target.value)}/><button className="sn-text-button" disabled={!selected.length||!tag.trim()} onClick={()=>apply('tag',tag)}>添加标签</button></div>
 <div className="flex gap-3 flex-wrap"><button className="sn-text-button" disabled={!selected.length} onClick={()=>{const out=exportNotesContent(selected,'md');downloadFile(out.filename,out.content,out.mimeType);}}>导出所选 Markdown</button><button className="sn-text-button" disabled={!selected.length} onClick={()=>{if(window.confirm('将选中的 '+selected.length+' 条笔记移至回收站？可恢复。'))apply('trash');}}>移至回收站</button></div></div>}</div>;
}
