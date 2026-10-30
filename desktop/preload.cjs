const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stillnoteDesktop',Object.freeze({
 getInfo:()=>ipcRenderer.invoke('stillnote:info'),
 createDesktopShortcut:()=>ipcRenderer.invoke('stillnote:shortcut'),
 pickFolder:id=>ipcRenderer.invoke('stillnote:folder-pick',id),
 getFolder:id=>ipcRenderer.invoke('stillnote:folder-info',id),
 folderOperation:(id,parts,operation,data)=>ipcRenderer.invoke('stillnote:folder-op',id,parts,operation,data),
}));
