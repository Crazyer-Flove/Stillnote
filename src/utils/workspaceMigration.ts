import type { AppSettings, Note } from '../types';
export function simplifyWorkspaces(notes:Note[],settings:AppSettings){
 const old=settings.workspaces||[];
 const removed=new Set(old.filter(w=>(w.id==='work'&&w.name==='工作与项目')||(w.id==='study'&&w.name==='研习与灵感')).map(w=>w.id));
 const workspaces=old.filter(w=>!removed.has(w.id));
 if(!workspaces.some(w=>w.id==='default'))workspaces.unshift({id:'default',name:'默认工作区',path:'',createdAt:Date.now()});
 return {notes:notes.map(n=>removed.has(n.workspaceId||'default')?{...n,workspaceId:'default'}:n),settings:{...settings,workspaces,activeWorkspaceId:workspaces.some(w=>w.id===settings.activeWorkspaceId)?settings.activeWorkspaceId:'default',workspaceMigration:2}};
}
