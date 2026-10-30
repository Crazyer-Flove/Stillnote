import express from 'express';
import path from 'node:path';
import 'dotenv/config';
const app=express();
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535');
app.get('/api/health',(_request,response)=>response.json({status:'ok',app:'Stillnote'}));
async function start(){
 if(process.env.NODE_ENV!=='production'){
  const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
 }else{
  const dist=path.join(process.cwd(),'dist');app.use(express.static(dist));app.get('*',(_request,response)=>response.sendFile(path.join(dist,'index.html')));
 }
 app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Stillnote: http://localhost:${port}`));
}
start().catch(error=>{console.error(error);process.exitCode=1;});
