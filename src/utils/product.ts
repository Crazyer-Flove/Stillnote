import type { AppSettings, Note, NoteHistory } from '../types';
export function normalizePreferences<T extends Partial<AppSettings>>(settings: T): T {
  return { ...settings, codeBlockTheme: 'light-mac', tableTheme: 'border-light', fontFamily: settings.fontFamily === 'serif' ? 'serif' : 'sans', showStatsCard: false };
}
export function sessionHistory(note: Note, content: string, session: string, now = Date.now()): NoteHistory[] {
  const history = note.history || [];
  if (content === note.content || history[0]?.id === session) return history;
  return [{ id: session, content: note.content, timestamp: now }, ...history].slice(0, 50);
}
export function compareLines(before: string, after: string) {
  const a = before.split('\n'), b = after.split('\n');
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length-1-end] === b[b.length-1-end]) end++;
  return { removed: a.slice(start, a.length-end).join('\n'), added: b.slice(start, b.length-end).join('\n') };
}
export const NOTE_TEMPLATES = [
 { name: '日记', content: '# 今日记录\n\n## 今天发生了什么\n\n## 一个值得记住的瞬间\n\n## 明天的一件事' },
 { name: '会议记录', content: '# 会议记录\n\n日期：\n参与人：\n\n## 讨论要点\n\n## 决定\n\n## 行动项\n- [ ] 负责人 / 事项 / 截止时间' },
 { name: '读书摘录', content: '# 读书摘录\n\n书名：\n作者：\n页码：\n\n> 摘录原文\n\n## 我的思考' },
];

export function applyBatchChange(notes: Note[], ids: string[], source: string, action: 'move'|'tag'|'trash', value: string | undefined, workspaces: string[], now=Date.now()): Note[] {
  const selected=new Set(ids);let tag=(value||'').trim().replace(/^#/, '');
  if (!['move','tag','trash'].includes(action)) throw new Error('批量操作无效');
  if (action==='move' && !workspaces.includes(value||'')) throw new Error('请选择有效的目标工作区');
  if (action==='tag' && !/^[\p{L}\p{N}_/-]+$/u.test(tag)) throw new Error('标签仅支持文字、数字、下划线、短线和层级斜线');
  if (action==='move' && value===source) return notes;
  return notes.map(note=>{
    if(!selected.has(note.id)||note.deletedAt||(note.workspaceId||'default')!==source)return note;
    if(action==='move')return {...note,workspaceId:value,updatedAt:now};
    if(action==='trash')return {...note,deletedAt:now};
    if(note.tags.includes(tag))return note;
    const content=note.content+'\n\n#'+tag;
    return {...note,content,tags:[...note.tags,tag],updatedAt:now,history:sessionHistory(note,content,'batch-'+now,now)};
  });
}
