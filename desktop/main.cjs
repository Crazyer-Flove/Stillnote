const {app,BrowserWindow,protocol,net,ipcMain,shell,Menu}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {assetPath,trusted}=require('./security.cjs');
app.setName('Stillnote');
app.setAppUserModelId('io.github.crazyer-flove.stillnote');
const smokeArg=process.argv.find(v=>v.startsWith('--self-test-dir='));
const smokeDir=smokeArg?path.resolve(smokeArg.slice('--self-test-dir='.length)):null;
const dataDirectory=smokeDir?path.join(smokeDir,'profile'):path.join(app.getPath('appData'),'Stillnote');
require('node:fs').mkdirSync(dataDirectory,{recursive:true});
app.setPath('userData',dataDirectory);
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const executable=()=>process.env.PORTABLE_EXECUTABLE_FILE||process.execPath;
function shortcut(destination){
 const ok=shell.writeShortcutLink(destination,'create',{target:executable(),cwd:path.dirname(executable()),description:'Stillnote · 留住一闪而过的想法',appUserModelId:'io.github.crazyer-flove.stillnote'});
 if(!ok)throw new Error('创建快捷方式失败，请确认桌面目录可写。');
 return destination;
}
function checkSender(event){if(!event.senderFrame||event.senderFrame!==event.sender.mainFrame||!trusted(event.senderFrame.url))throw new Error('此页面无权调用桌面接口');}
let window;
async function createWindow(){
 const root=path.join(app.isPackaged?app.getAppPath():path.resolve(__dirname,'..'),'dist');
 protocol.handle('app',async request=>{
  const target=assetPath(request.url,root);if(!target)return new Response('Forbidden',{status:403});
  try {await fs.access(target);const result=await net.fetch(pathToFileURL(target).toString());const headers=new Headers(result.headers);
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'}[path.extname(target)];if(mime)headers.set('Content-Type',mime);
   headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; font-src 'self' data:; connect-src 'self' https: http:; frame-src https: http:; object-src 'none'; base-uri 'self'");
   return new Response(result.body,{status:result.status,headers});
  }catch{return new Response('Not found',{status:404});}
 });
 ipcMain.handle('stillnote:info',event=>{checkSender(event);return {version:app.getVersion(),platform:process.platform,portable:!!process.env.PORTABLE_EXECUTABLE_FILE,dataPath:app.getPath('userData')};});
 ipcMain.handle('stillnote:shortcut',event=>{checkSender(event);try{return {ok:true,path:shortcut(path.join(app.getPath('desktop'),'Stillnote.lnk'))};}catch(error){return {ok:false,error:error.message};}});
 window=new BrowserWindow({width:1280,height:900,minWidth:760,minHeight:600,show:!smokeDir,title:'Stillnote',backgroundColor:'#faf9f6',icon:path.join(__dirname,'icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 Menu.setApplicationMenu(null);
 window.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(['https:','http:'].includes(u.protocol))shell.openExternal(u.toString());}catch{}return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!trusted(url))event.preventDefault();});
 window.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(trusted(contents.getURL())&&['clipboard-sanitized-write','clipboard-write'].includes(permission)));
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 if(smokeDir){
  await fs.mkdir(smokeDir,{recursive:true});
  const errors=[];window.webContents.on('console-message',(_event,details)=>{if(details.level==='error')errors.push(details.message);});
  const timer=setTimeout(()=>{fs.writeFile(path.join(smokeDir,'result.json'),JSON.stringify({ok:false,error:'Renderer timeout'})).finally(()=>app.exit(1));},45000);
  window.webContents.once('did-finish-load',async()=>{
   try{
    // Built-in release diagnostics: no note contents are recorded and no user desktop shortcut is created.
    let report;
    for(let i=0;i<100;i++){
     report=await window.webContents.executeJavaScript(`({title:document.title,ready:!!document.querySelector('.sn-journal'),bridge:typeof window.stillnoteDesktop?.createDesktopShortcut==='function',filePicker:typeof window.showDirectoryPicker==='function',secure:window.isSecureContext})`);
     if(report.ready)break;await new Promise(resolve=>setTimeout(resolve,100));
    }
    const link=shortcut(path.join(smokeDir,'Stillnote-test.lnk'));const target=shell.readShortcutLink(link).target;
    const ok=report.ready&&report.bridge&&report.secure&&target.toLowerCase()===executable().toLowerCase()&&!errors.length;
    await fs.writeFile(path.join(smokeDir,'result.json'),JSON.stringify({...report,ok,version:app.getVersion(),executable:executable(),shortcutTarget:target,errors},null,2));
    clearTimeout(timer);app.exit(ok?0:1);
   }catch(error){clearTimeout(timer);await fs.writeFile(path.join(smokeDir,'result.json'),JSON.stringify({ok:false,error:error.stack}));app.exit(1);}
  });
 }
 await window.loadURL('app://stillnote/');
}
const lock=smokeDir||app.requestSingleInstanceLock();
if(!lock)app.quit();else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.whenReady().then(createWindow).catch(error=>{console.error(error);app.exit(1);});
 app.on('window-all-closed',()=>app.quit());
}
