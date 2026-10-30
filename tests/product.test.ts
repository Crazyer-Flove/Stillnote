import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, sessionHistory, applyBatchChange, compareLines } from '../src/utils/product';
import { cleanFilter } from '../src/utils/searchPreferences';
import type { Note } from '../src/types';
const note: Note = {id:'a',content:'原文',tags:[],createdAt:1,updatedAt:1,isPinned:false,isFavorite:false};
test('legacy visual preferences map to supported styles without changing workspace or save preferences',()=>{
 const result=normalizePreferences({fontFamily:'mono',codeBlockTheme:'dracula',tableTheme:'amber-warm',activeWorkspaceId:'work',autoSaveEnabled:false} as const);
 assert.equal(result.fontFamily,'sans');assert.equal(result.codeBlockTheme,'light-mac');assert.equal(result.tableTheme,'border-light');assert.equal(result.activeWorkspaceId,'work');assert.equal(result.autoSaveEnabled,false);
 assert.equal(normalizePreferences({fontFamily:'serif'}).fontFamily,'serif');
});
test('repeated autosaves in a session preserve the initial version; reopening creates a new boundary',()=>{
 let current=note;
 for(let i=0;i<100;i++){const content='修改'+i;current={...current,content,history:sessionHistory(current,content,'session-one',i+1)};}
 assert.equal(current.history?.length,1);assert.equal(current.history?.[0].content,'原文');
 const next=sessionHistory(current,'新会话','session-two',102);assert.equal(next.length,2);assert.equal(next[0].content,'修改99');
 assert.deepEqual(sessionHistory(current,current.content,'other'),current.history);
});
test('batch changes exclude other workspaces and trash, validate targets, and leave input immutable',()=>{
 const original=[note,{...note,id:'b',workspaceId:'other'},{...note,id:'c',deletedAt:2}];
 const result=applyBatchChange(original,['a','b','c'],'default','move','work',['default','work'],5);
 assert.equal(applyBatchChange(original,['a'],'default','move','default',['default']),original);
 assert.equal(result[0].workspaceId,'work');assert.equal(result[1],original[1]);assert.equal(result[2],original[2]);assert.equal(original[0].workspaceId,undefined);
 assert.throws(()=>applyBatchChange(original,['a'],'default','move','missing',['default']));
 assert.throws(()=>applyBatchChange(original,['a'],'default','tag','two tags',['default']));
 const tagged=applyBatchChange(original,['a'],'default','tag','开发/前端',['default'],10);assert.deepEqual(tagged[0].tags,['开发/前端']);assert.equal(tagged[0].history?.[0].content,note.content);
 assert.equal(applyBatchChange(tagged,['a'],'default','tag','开发/前端',['default'])[0],tagged[0]);
 const trashed=applyBatchChange(original,['a'],'default','trash',undefined,['default'],42);assert.equal(trashed[0].deletedAt,42);assert.equal(trashed[0].content,note.content);
});
test('history comparison isolates changed lines including insertion and deletion',()=>{
 assert.deepEqual(compareLines('a\nb\nc','a\nx\nc'),{removed:'b',added:'x'});
 assert.deepEqual(compareLines('a','a\nb'),{removed:'',added:'b'});
 assert.deepEqual(compareLines('a\nb','a'),{removed:'b',added:''});
});
test('saved filters are allowlisted and malformed values cannot become actions or settings',()=>{
 assert.equal(cleanFilter({category:'delete',sortBy:'newest',searchKeyword:''}),null);
 const clean=cleanFilter({category:'all',sortBy:'newest',searchKeyword:'test',selectedTag:'工作',apiKey:'secret',weekFilter:'2026-W43'});
 assert.ok(clean);assert.equal(clean.weekFilter,'2026-W43');assert.ok(!('apiKey' in clean));assert.equal(cleanFilter(null),null);
});
