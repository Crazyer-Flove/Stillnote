import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {assetPath,trusted}=require('../desktop/security.cjs');
test('desktop protocol confines file access to the application assets',()=>{
 const root=path.resolve('dist');assert.equal(assetPath('app://stillnote/',root),path.join(root,'index.html'));
 assert.equal(assetPath('app://stillnote/assets/main.js',root),path.join(root,'assets','main.js'));
 for(const url of ['app://stillnote/..%2f..%2fprivate','app://evil/index.html','file:///etc/passwd','app://stillnote/%5c..%5cprivate','app://stillnote/%00','app://user:pass@stillnote/','app://stillnote:99/'])assert.equal(assetPath(url,root),null,url);
});
test('desktop privileged IPC admits only the application origin',()=>{
 assert.ok(trusted('app://stillnote/'));
 for(const url of ['https://stillnote/','app://evil/','app://stillnote.evil/','data:text/html,test','app://user@stillnote/','app://stillnote:80/'])assert.equal(trusted(url),false,url);
});
