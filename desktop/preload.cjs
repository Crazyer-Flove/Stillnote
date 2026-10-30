const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stillnoteDesktop',Object.freeze({
 getInfo:()=>ipcRenderer.invoke('stillnote:info'),
 createDesktopShortcut:()=>ipcRenderer.invoke('stillnote:shortcut'),
}));
