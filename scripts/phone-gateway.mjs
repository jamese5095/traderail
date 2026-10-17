// Exposes only the supplier experience. Desktop/signing APIs are never forwarded.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {directory,webPort} from './lib/demo-profile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const arg=process.argv.indexOf('--profile');const profile=arg>=0?process.argv[arg+1]:'showcase';if(!['showcase','sandbox','testnet'].includes(profile))throw Error('Unsupported profile');
const appPort=Number(process.env.PORT??(profile==='showcase'?3003:webPort(profile)));const gatewayPort=Number(process.env.PHONE_GATEWAY_PORT??(appPort===3003?3005:appPort+1));const sessionDir=profile==='showcase'?resolve(process.env.DEMO_SESSION_DIR||resolve(root,'frontend/.demo-sessions')):resolve(directory(profile),'sessions');const file=resolve(sessionDir,'phone-origin.json');mkdirSync(sessionDir,{recursive:true,mode:0o700});
const budgets=new Map();
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const read=req.method==='GET'&&(/^\/_next\/[a-zA-Z0-9_./%-]+$/.test(path)||['/supplier','/goods','/api/field','/api/environment','/api/proof','/favicon.ico'].includes(path));
 const write=req.method==='POST'&&['/api/field','/api/field/pair'].includes(path);
 if(!read&&!write){res.writeHead(403);res.end('Supplier endpoint only');return;}
 if(write){const key=req.headers['cf-connecting-ip']||req.socket.remoteAddress;const now=Date.now();let b=budgets.get(key);if(!b||now-b.at>60000){b={at:now,n:0};budgets.set(key,b);}if(++b.n>40){res.writeHead(429);res.end('Rate limit');return;}if(budgets.size>1000)for(const[k,v]of budgets)if(now-v.at>60000)budgets.delete(k);}
 const chunks=[];let size=0;req.on('data',d=>{size+=d.length;if(size>8192){res.writeHead(413);res.end();req.destroy();}else chunks.push(d);});
 req.on('end',()=>{const headers={'host':`localhost:${appPort}`,'x-traderail-remote':'supplier-gateway'};for(const k of ['content-type','cookie','origin','accept','user-agent','rsc','next-router-state-tree','next-url'])if(req.headers[k])headers[k]=req.headers[k];const upstream=http.request({hostname:'127.0.0.1',port:appPort,path:req.url,method:req.method,headers},r=>{res.writeHead(r.statusCode??502,{...r.headers,'referrer-policy':'no-referrer','cache-control':path.startsWith('/_next/')?r.headers['cache-control']||'public, max-age=3600':'no-store','x-content-type-options':'nosniff'});r.pipe(res);});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local demo unavailable');});upstream.end(Buffer.concat(chunks));});
});
server.listen(gatewayPort,'127.0.0.1',()=>console.log('Supplier-only gateway ready on 127.0.0.1:'+gatewayPort));
const tunnel=spawn('cloudflared',['tunnel','--protocol','http2','--url',`http://127.0.0.1:${gatewayPort}`,'--no-autoupdate'],{stdio:['ignore','pipe','pipe']});let connected=false;let buffer='';
const output=chunk=>{const line=chunk.toString();if(line.includes('Registered tunnel connection')) console.log('HTTPS tunnel connection registered');if(line.includes(' ERR ')) console.error('Tunnel network error: '+line.replace(/https:\/\/[^ ]+/g,'[endpoint]').slice(0,200));buffer=(buffer+chunk.toString()).slice(-12000);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!connected){connected=true;writeFileSync(file,JSON.stringify({origin:match[0]}),{mode:0o600});console.log('Supplier HTTPS entry: '+match[0]+'/supplier');console.log('Pair this phone using the QR code on the desktop.');}};
tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);
const stop=()=>{rmSync(file,{force:true});tunnel.kill('SIGTERM');server.close();};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop();process.exit(0);});tunnel.on('error',()=>{console.error('cloudflared unavailable; install it or provide a controlled HTTPS supplier proxy.');stop();});tunnel.on('exit',()=>{rmSync(file,{force:true});server.close();});
