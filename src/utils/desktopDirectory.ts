type Folder = {id:string;name:string;path:string};
export function desktopDirectory(folder:Folder) {
 const api=window.stillnoteDesktop!;
 const operation=async(parts:string[],op:string,data?:string|Uint8Array)=>{try{return await api.folderOperation(folder.id,parts,op,data);}catch(error){if(String(error).includes('NotFound'))throw Object.assign(new Error('NotFound'),{name:'NotFoundError'});throw error;}};
 const handle=(parts:string[],kind:'directory'|'file'):any=>({
  kind,name:parts.at(-1)||folder.name,nativePath:folder.path,
  queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',
  getDirectoryHandle:async(name:string,options?:{create?:boolean})=>{const child=[...parts,name];try{const stat=await operation(child,'stat');if(stat.kind!=='directory')throw new Error('不是目录');}catch(error){if(!options?.create||(error as Error).name!=='NotFoundError')throw error;await operation(child,'mkdir');}return handle(child,'directory');},
  getFileHandle:async(name:string,options?:{create?:boolean})=>{const child=[...parts,name];if(options?.create)await operation(child,'create');else{const stat=await operation(child,'stat');if(stat.kind!=='file')throw new Error('不是文件');}return handle(child,'file');},
  getFile:async()=>new File([await operation(parts,'read')],parts.at(-1)||'file'),
  createWritable:async()=>{let content:string|Uint8Array='';return {write:async(value:string|Blob)=>{content=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value;},close:async()=>operation(parts,'write',content)};},
  async *entries(){for(const entry of await operation(parts,'list'))yield [entry.name,handle([...parts,entry.name],entry.kind)];},
  async *values(){for await(const [,value] of this.entries())yield value;},
 });
 return handle([],'directory');
}
