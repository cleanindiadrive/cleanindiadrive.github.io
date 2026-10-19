import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');let relative=decodeURIComponent(url.pathname);
    if(relative==='/')relative='/index.html';
    const filename=path.resolve(root,'.'+relative);
    if(!filename.startsWith(root+path.sep)||relative.split('/').some(part=>part.startsWith('.'))){res.writeHead(403);res.end();return;}
    if(!(await stat(filename)).isFile())throw new Error('not found');
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(filename));
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Silly Sensei: http://127.0.0.1:4173/shop.html'));
