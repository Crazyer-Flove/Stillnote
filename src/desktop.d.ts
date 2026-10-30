export {};
declare global {interface Window {stillnoteDesktop?: {
 getInfo:()=>Promise<{version:string;platform:string;portable:boolean;dataPath:string}>;
 createDesktopShortcut:()=>Promise<{ok:boolean;path?:string;error?:string}>;
 pickFolder:(id:string)=>Promise<{id:string;name:string;path:string}|null>;
 getFolder:(id:string)=>Promise<{id:string;name:string;path:string}|null>;
 folderOperation:(id:string,parts:string[],operation:string,data?:string|Uint8Array)=>Promise<any>;
}}}
