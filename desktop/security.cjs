const path=require('node:path');
function assetPath(raw,root) {
 try {const u=new URL(raw);if(u.protocol!=='app:'||u.hostname!=='stillnote'||u.username||u.password||u.port)return null;
 const decoded=decodeURIComponent(u.pathname);if(decoded.includes('\\')||decoded.includes('\0'))return null;
 const candidate=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
 const relative=path.relative(root,candidate);return relative.startsWith('..')||path.isAbsolute(relative)?null:candidate;
 } catch {return null;}
}
function trusted(url){try{const u=new URL(url);return u.protocol==='app:'&&u.hostname==='stillnote'&&!u.username&&!u.password&&!u.port;}catch{return false;}}
module.exports={assetPath,trusted};
