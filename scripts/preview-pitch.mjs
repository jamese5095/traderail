import http from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {root} from './lib/demo-profile.mjs';
const base='/traderail';const dir=join(root,'site/out');const port=Number(process.env.PREVIEW_PORT||4173);
http.createServer((req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path===base){res.writeHead(302,{Location:base+'/'});return res.end();}if(!path.startsWith(base+'/')){res.writeHead(404);return res.end();}let file=resolve(dir,'.'+path.slice(base.length));if(!file.startsWith(dir+'/')){res.writeHead(403);return res.end();}if(statSync(file).isDirectory())file=join(file,'index.html');const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}}).listen(port,'127.0.0.1',()=>console.log('Pitch preview: http://localhost:'+port+base+'/'));
