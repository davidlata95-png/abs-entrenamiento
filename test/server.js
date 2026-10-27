// Servidor local: sirve la web y simula el Apps Script con la hoja falsa
const http=require('http'),fs=require('fs'),path=require('path');const {load}=require('./fake.js');
const B=load();global.__B=B;
const web=path.join(__dirname,'../docs');
module.exports=(port=8770)=>http.createServer((q,r)=>{
 if(q.url.startsWith('/api')){let b='';q.on('data',c=>b+=c);q.on('end',()=>{r.setHeader('content-type','application/json');r.end(JSON.stringify(B.post(JSON.parse(b))))});return;}
 let f=q.url.split('?')[0];if(f==='/')f='/index.html';
 let t=fs.readFileSync(path.join(web,f),'utf8');if(f==='/index.html')t=t.replace(/window.ABS_API = "[^"]*"/,'window.ABS_API = "/api"');
 r.setHeader('content-type',f.endsWith('.css')?'text/css':f.endsWith('.js')?'text/javascript':'text/html');r.end(t);
}).listen(port);
