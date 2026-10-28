// Servidor local: sirve la web y simula el Apps Script con la hoja falsa
const http=require('http'),fs=require('fs'),path=require('path');const {load}=require('./fake.js');
const B=load();global.__B=B;
const web=path.join(__dirname,'../docs');
module.exports=(port=8770)=>http.createServer((q,r)=>{
 if(q.url.startsWith('/api')){let b='';q.on('data',c=>b+=c);q.on('end',()=>{r.setHeader('content-type','application/json');r.end(JSON.stringify(B.post(JSON.parse(b))))});return;}
 let f=q.url.split('?')[0];if(f==='/')f='/index.html';
 const fp=path.join(web,f);if(!fs.existsSync(fp)){r.statusCode=404;return r.end('no');}
 let t=fs.readFileSync(fp);if(f==='/index.html')t=t.toString().replace(/window.ABS_API = "[^"]*"/,'window.ABS_API = "/api"');
 const T={'.css':'text/css','.js':'text/javascript','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.html':'text/html'};
 r.setHeader('content-type',T[path.extname(f)]||'application/octet-stream');r.end(t);
}).listen(port);
