import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const pkg=JSON.parse(await readFile('package.json','utf8'));
await mkdir('.desktop-app',{recursive:true});
await cp('dist','.desktop-app/dist',{recursive:true,filter:source=>!source.endsWith('server.cjs')&&!source.endsWith('server.cjs.map')});
await cp('desktop','.desktop-app/desktop',{recursive:true});
await writeFile('.desktop-app/package.json',JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,author:pkg.author,license:pkg.license,main:'desktop/main.cjs'},null,2));
