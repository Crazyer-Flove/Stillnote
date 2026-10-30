export {};
declare global {interface Window {stillnoteDesktop?: {
 getInfo:()=>Promise<{version:string;platform:string;portable:boolean;dataPath:string}>;
 createDesktopShortcut:()=>Promise<{ok:boolean;path?:string;error?:string}>;
}}}
