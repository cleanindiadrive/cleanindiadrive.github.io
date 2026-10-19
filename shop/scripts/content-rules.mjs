import {readFile,writeFile} from 'node:fs/promises';
import {CONTENT_SCHEMA} from '../store-content.js';
const block=Object.entries(CONTENT_SCHEMA).map(([section,group])=>{
 const keys=Object.keys(group.fields).map(key=>`'${key}'`).join(',');
 const checks=Object.entries(group.fields).map(([key,f])=>f.kind==='checkbox'?`d.${key} is bool`:`text(d.${key},${f.max})`+(f.kind==='image'?` && contentImage(d.${key})`:f.kind==='link'?` && contentLink(d.${key})`:''));
 return `    match /storeContent/${section} {\n      function valid(d) {return d.keys().hasOnly([${keys}]) &&\n        ${checks.join(' &&\n        ')};}\n      allow create, update: if admin() && valid(request.resource.data);\n    }`;
}).join('\n');
let rules=await readFile('firestore.rules','utf8');
const start='    // BEGIN STOREFRONT CONTENT',end='    // END STOREFRONT CONTENT';
const generated=`${start}
    function contentImage(v) {return v.matches('^https://[^<>" ]+$') || v.matches('^assets/[a-zA-Z0-9._/-]+$');}
    function contentLink(v) {return storeLink(v) || v.matches('^mailto:[^<>" ]+@[^<>" ]+$') || v.matches('^tel:[+0-9 -]+$');}
    match /storeContent/{section} {allow read: if true;}
${block}
${end}`;
if(rules.includes(start))rules=rules.slice(0,rules.indexOf(start))+generated+rules.slice(rules.indexOf(end)+end.length);
else rules=rules.replace('    match /{document=**}',()=>generated+'\n    match /{document=**}');
await writeFile('firestore.rules',rules);
