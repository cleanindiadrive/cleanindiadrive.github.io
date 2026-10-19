import {readFile} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {ref,uploadBytes,getBytes} from 'firebase/storage';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-silly-shop',storage:{host:'127.0.0.1',port:9199,rules:await readFile('storage.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
const content=new Uint8Array([255,216,255,217]);
test('requested admin addresses can upload public studio assets with verified email',async()=>{
 for(const email of ['Supritachat.25@gmail.com','abhishekredddy500@gmail.com']){
  const storage=env.authenticatedContext(email,{email,email_verified:true}).storage();
  await assertSucceeds(uploadBytes(ref(storage,'products/store-content/'+email+'.jpg'),content,{contentType:'image/jpeg'}));
 }
});
test('reference images are private to their owner and verified admins',async()=>{
  const path='references/buyer/request/product/reference.jpg';
  const buyer=env.authenticatedContext('buyer').storage();
  await assertSucceeds(uploadBytes(ref(buyer,path),content,{contentType:'image/jpeg'}));
  await assertSucceeds(getBytes(ref(buyer,path)));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('admin',{email:'vishnudeviprasadshetty@gmail.com',email_verified:true}).storage(),path)));
  await assertFails(getBytes(ref(env.authenticatedContext('other').storage(),path)));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(),path)));
});
test('customers cannot upload for another owner or publish product images',async()=>{
  const buyer=env.authenticatedContext('buyer').storage();
  await assertFails(uploadBytes(ref(buyer,'references/other/request/product/spoof.jpg'),content,{contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(buyer,'products/product/photo.jpg'),content,{contentType:'image/jpeg'}));
  await assertFails(uploadBytes(ref(buyer,'references/buyer/request/product/html.jpg'),content,{contentType:'text/html'}));
});
