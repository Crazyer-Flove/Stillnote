const fs=require('node:fs/promises');
const path=require('node:path');
// Only paths below a directory explicitly selected in the native dialog are exposed.
async function resolveChild(root,parts){
 if(!Array.isArray(parts)||parts.length>12||parts.some(p=>typeof p!=='string'||!p||/[<>:"/\\|?*\x00-\x1f]/.test(p)||p==='.'||p==='..'))throw new Error('无效文件名');
 const base=await fs.realpath(root);let target=base;
 for(const part of parts){target=path.join(target,part);try{const stat=await fs.lstat(target);if(stat.isSymbolicLink())throw new Error('不能访问链接目录');const real=await fs.realpath(target);if(!real.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw new Error('目录越界');}catch(e){if(e.code!=='ENOENT')throw e;}}
 return target;
}
function registerFolders({app,ipcMain,dialog,window,checkSender}){
 const config=path.join(app.getPath('userData'),'folders.json');
 const roots=new Map();
 const key=id=>{if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))throw new Error('工作区无效');return id;};
 async function load(){try{for(const [id,root] of Object.entries(JSON.parse(await fs.readFile(config,'utf8'))))if(typeof root==='string')roots.set(id,root);}catch(e){if(e.code!=='ENOENT')console.error('Folder configuration unavailable');}}
 const ready=load();
 const info=async id=>{await ready;const root=roots.get(key(id));if(!root)return null;try{await fs.access(root);return {id,path:root,name:path.basename(root)};}catch{return null;}};
 ipcMain.handle('stillnote:folder-info',async(event,id)=>{checkSender(event);return info(id);});
 ipcMain.handle('stillnote:folder-pick',async(event,id)=>{checkSender(event);await ready;key(id);const result=await dialog.showOpenDialog(window(),{title:'选择 Stillnote 存储根目录',defaultPath:roots.get(id),properties:['openDirectory','createDirectory']});if(result.canceled)return null;const root=await fs.realpath(result.filePaths[0]);roots.set(id,root);await fs.writeFile(config,JSON.stringify(Object.fromEntries(roots),null,2));return info(id);});
 ipcMain.handle('stillnote:folder-op',async(event,id,parts,operation,data)=>{
  checkSender(event);await ready;const root=roots.get(key(id));if(!root)throw new Error('请先选择存储文件夹');
  const target=await resolveChild(root,parts);
  try{
   if(operation==='stat'){const s=await fs.stat(target);return {kind:s.isDirectory()?'directory':'file',modified:s.mtimeMs};}
   if(operation==='list')return (await fs.readdir(target,{withFileTypes:true})).filter(e=>!e.isSymbolicLink()).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
   if(operation==='read')return new Uint8Array(await fs.readFile(target));
   if(operation==='mkdir'){await fs.mkdir(target);return;}
   if(operation==='create'){const handle=await fs.open(target,'a');await handle.close();return;}
   if(operation==='write'){if(!parts.length||!(typeof data==='string'||data instanceof Uint8Array))throw new Error('写入数据无效');await fs.writeFile(target,data);return;}
   throw new Error('操作无效');
  }catch(e){if(e.code==='ENOENT'){const error=new Error('NotFound');error.name='NotFoundError';throw error;}throw e;}
 });
}
module.exports={registerFolders,resolveChild};
