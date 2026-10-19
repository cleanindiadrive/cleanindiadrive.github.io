import {readFile} from 'node:fs/promises';
import {test,after,before} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
import {DEFAULT_CONTENT} from '../store-content.js';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-silly-shop',firestore:{host:'127.0.0.1',port:8080,rules:await readFile('firestore.rules','utf8')}});await env.clearFirestore();});
after(async()=>{await env?.cleanup();});
test('both requested admin addresses can publish, regardless of letter case',async()=>{
 for(const email of ['Supritachat.25@gmail.com','abhishekredddy500@gmail.com']){
  const db=env.authenticatedContext(email,{email,email_verified:true}).firestore();
  await assertSucceeds(setDoc(doc(db,'storeContent','brand'),DEFAULT_CONTENT.brand));
  await assertFails(setDoc(doc(env.authenticatedContext(email+'-unverified',{email,email_verified:false}).firestore(),'storeContent','brand'),DEFAULT_CONTENT.brand));
 }
});
test('storefront publishing is atomic, admin-only and schema constrained',async()=>{
 const db=env.authenticatedContext('content-admin',{admin:true}).firestore(),guest=env.unauthenticatedContext().firestore(),buyer=env.authenticatedContext('buyer').firestore();
 const batch=writeBatch(db);for(const [section,value] of Object.entries(DEFAULT_CONTENT))batch.set(doc(db,'storeContent',section),value);await assertSucceeds(batch.commit());
 await assertSucceeds(getDocs(collection(guest,'storeContent')));
 await assertFails(setDoc(doc(buyer,'storeContent','brand'),DEFAULT_CONTENT.brand));
 await assertFails(setDoc(doc(db,'storeContent','brand'),{...DEFAULT_CONTENT.brand,admin:true}));
 await assertFails(setDoc(doc(db,'storeContent','brand'),{...DEFAULT_CONTENT.brand,logo:'javascript:alert(1)'}));
 await assertFails(setDoc(doc(db,'storeContent','footer'),{...DEFAULT_CONTENT.footer,link1Url:'javascript:alert(1)'}));
 await assertFails(setDoc(doc(db,'storeContent','home'),{...DEFAULT_CONTENT.home,heading:'x'.repeat(121)}));
 await assertFails(setDoc(doc(db,'storeContent','unknown'),{}));
});
const product=()=>({title:'Test painting',description:'Sample',category:'paintings',price:1800,comparePrice:0,stock:2,sku:'TEST',material:'Canvas',dimensions:'20 cm',care:'Keep dry',visible:true,featured:true,archived:false,images:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const inlineImage='data:image/png;base64,'+'AAAA'.repeat(24994);
test('Base64 images fit all supported public documents and reject active or oversized data',async()=>{
  const db=env.authenticatedContext('image-admin',{admin:true}).firestore();
  await assertSucceeds(setDoc(doc(db,'products','eight-encoded-images'),{...product(),images:Array(8).fill(inlineImage)}));
  await assertSucceeds(setDoc(doc(db,'storeContent','brand'),{...DEFAULT_CONTENT.brand,logo:inlineImage,mascot:inlineImage}));
  await assertSucceeds(setDoc(doc(db,'storeContent','collections'),{...DEFAULT_CONTENT.collections,paintingsImage:inlineImage,clayImage:inlineImage,moldsImage:inlineImage,rocksImage:inlineImage}));
  for(const bad of ['data:image/svg+xml;base64,PHN2Zy8+','data:text/html;base64,PGgxPg==',inlineImage+'AAAA','data:image/png;base64,']){
    await assertFails(setDoc(doc(db,'products','bad-encoded-image'),{...product(),images:[bad]}));
    await assertFails(setDoc(doc(db,'storeContent','brand'),{...DEFAULT_CONTENT.brand,logo:bad}));
  }
});
const request=uid=>({uid,customer:{email:'preview@example.com',phone:'9876543210',firstName:'Demo',lastName:'Customer',address:'12 Example Lane',apartment:'',city:'Bengaluru',state:'Karnataka',postalCode:'560001',country:'India',notes:'Fictional test',consent:true,location:{latitude:12.9716,longitude:77.5946,source:'pin',accuracy:0,formattedAddress:'Bengaluru',confirmed:true}},items:[{productId:'test-art',title:'Test painting',category:'paintings',quantity:1,unitPrice:1800}],estimatedSubtotal:1800,currency:'INR',status:'details_received',paymentStatus:'not_started',createdAt:serverTimestamp()});
test('only verified administrators can publish valid products',async()=>{
  const admin=env.authenticatedContext('admin',{email:'vishnudeviprasadshetty@gmail.com',email_verified:true}).firestore();
  const ordinary=env.authenticatedContext('customer').firestore();
  const unverified=env.authenticatedContext('unverified',{email:'vishnudeviprasadshetty@gmail.com',email_verified:false}).firestore();
  await assertSucceeds(setDoc(doc(admin,'products','test-art'),product()));
  await assertFails(setDoc(doc(ordinary,'products','unauthorized'),product()));
  await assertFails(setDoc(doc(unverified,'products','unverified'),product()));
  await assertFails(setDoc(doc(admin,'products','bad-category'),{...product(),category:'unknown'}));
  await assertFails(setDoc(doc(admin,'products','bad-stock'),{...product(),stock:-1}));
});
test('public catalogue can read published products but not drafts',async()=>{
  await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'products','draft'),{...product(),visible:false});});
  const guest=env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(guest,'products','test-art')));
  await assertFails(getDoc(doc(guest,'products','draft')));
  await assertSucceeds(getDocs(query(collection(guest,'products'),where('visible','==',true))));
  await assertFails(getDocs(collection(guest,'products')));
});
test('checkout requests are private, create-only and never paid orders',async()=>{
  const customer=env.authenticatedContext('buyer').firestore();
  const other=env.authenticatedContext('other').firestore();
  const guest=env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(customer,'checkoutRequests','request-1'),request('buyer')));
  await assertSucceeds(getDoc(doc(customer,'checkoutRequests','request-1')));
  await assertFails(getDoc(doc(other,'checkoutRequests','request-1')));
  await assertFails(getDoc(doc(guest,'checkoutRequests','request-1')));
  await assertFails(getDocs(collection(customer,'checkoutRequests')));
  await assertFails(setDoc(doc(customer,'checkoutRequests','spoofed'),request('other')));
  await assertFails(setDoc(doc(customer,'checkoutRequests','paid'),{...request('buyer'),paymentStatus:'paid'}));
  await assertFails(setDoc(doc(customer,'checkoutRequests','no-consent'),{...request('buyer'),customer:{...request('buyer').customer,consent:false}}));
  await assertFails(updateDoc(doc(customer,'checkoutRequests','request-1'),{status:'closed',updatedAt:serverTimestamp()}));
});
test('request admin can update review status, not customer data or payment state',async()=>{
  const admin=env.authenticatedContext('admin',{admin:true}).firestore();
  await assertSucceeds(getDocs(collection(admin,'checkoutRequests')));
  await assertSucceeds(updateDoc(doc(admin,'checkoutRequests','request-1'),{status:'reviewed',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(admin,'checkoutRequests','request-1'),{paymentStatus:'paid',updatedAt:serverTimestamp()}));
});
test('maximum cart size remains within rules evaluation limits',async()=>{
  const customer=env.authenticatedContext('buyer').firestore();const payload=request('buyer');
  payload.items=Array.from({length:5},(_,i)=>({...payload.items[0],productId:`p-${i}`,quantity:99}));payload.estimatedSubtotal=891000;
  payload.customer.location={latitude:12.9716,longitude:77.5946,source:'pin',accuracy:0,formattedAddress:'Bengaluru',confirmed:true};
  await assertSucceeds(setDoc(doc(customer,'checkoutRequests','max-cart'),payload));
  await assertFails(setDoc(doc(customer,'checkoutRequests','bad-item'),{...payload,items:[{...payload.items[0],quantity:-1}]}));
  await assertFails(setDoc(doc(customer,'checkoutRequests','too-many'),{...payload,items:[...payload.items,payload.items[0]]}));
});
test('delivery pins must be confirmed, bounded and private',async()=>{
  const db=env.authenticatedContext('buyer').firestore();
  const payload=request('buyer');payload.customer.location={latitude:12.9716,longitude:77.5946,source:'pin',accuracy:0,formattedAddress:'Bengaluru',confirmed:true};
  await assertSucceeds(setDoc(doc(db,'checkoutRequests','with-pin'),payload));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'checkoutRequests','with-pin')));
  for(const [key,value] of [['latitude',91],['longitude',181],['confirmed',false],['accuracy',-1]]){
    await assertFails(setDoc(doc(db,'checkoutRequests',`invalid-${key}`),{...payload,customer:{...payload.customer,location:{...payload.customer.location,[key]:value}}}));
  }
});

test('a delivery pin is mandatory even when all typed address fields are valid',async()=>{
  const db=env.authenticatedContext('buyer').firestore();const payload=request('buyer');delete payload.customer.location;
  await assertFails(setDoc(doc(db,'checkoutRequests','missing-pin'),payload));
});
test('banner settings are publicly readable but only admins can edit visibility and content',async()=>{
  const admin=env.authenticatedContext('admin',{admin:true}).firestore();const guest=env.unauthenticatedContext().firestore();
  const settings={announcementVisible:false,announcementText:'Hello',announcementLink:'#shop',bannerVisible:true,bannerTitle:'New things',bannerText:'Handmade',bannerButton:'Explore',bannerLink:'#shop',bannerImage:'assets/paintings.svg',reviewsVisible:false,reviewImages:[]};
  await assertSucceeds(setDoc(doc(admin,'settings','storefront'),settings));
  await assertSucceeds(getDoc(doc(guest,'settings','storefront')));
  await assertFails(setDoc(doc(env.authenticatedContext('buyer').firestore(),'settings','storefront'),settings));
  await assertFails(setDoc(doc(admin,'settings','storefront'),{...settings,bannerLink:'javascript:alert(1)'}));
  await assertFails(setDoc(doc(admin,'settings','storefront'),{...settings,reviewsVisible:true,reviewImages:['https://example.com/review.jpg']}));
  await assertSucceeds(setDoc(doc(admin,'settings','storefront'),{...settings,reviewsVisible:true,reviewImages:Array(7).fill('https://example.com/review.jpg')}));
  await assertSucceeds(setDoc(doc(admin,'settings','storefront'),{...settings,bannerImage:inlineImage}));
});
test('customer dashboard only lists requests belonging to the signed-in customer',async()=>{
  const db=env.authenticatedContext('buyer').firestore();
  await assertSucceeds(getDocs(query(collection(db,'checkoutRequests'),where('uid','==','buyer'))));
  await assertFails(getDocs(query(collection(db,'checkoutRequests'),where('uid','==','other'))));
  await assertFails(getDocs(collection(db,'checkoutRequests')));
});
test('saved customer profiles cannot be read or changed by another customer',async()=>{
  const db=env.authenticatedContext('buyer').firestore(),other=env.authenticatedContext('other').firestore();
  const profile={firstName:'Test',lastName:'Customer',phone:'9876543210',address:'12 Test Lane',apartment:'',city:'Bengaluru',state:'Karnataka',postalCode:'560001',updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(db,'customers','buyer'),profile));
  await assertSucceeds(getDoc(doc(db,'customers','buyer')));
  await assertFails(getDoc(doc(other,'customers','buyer')));
  await assertFails(setDoc(doc(other,'customers','buyer'),profile));
  await assertFails(setDoc(doc(db,'customers','buyer'),{...profile,admin:true}));
  const anon=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore();
  await assertFails(setDoc(doc(anon,'customers','anon'),profile));
});
test('only admins can save label overrides, leaving original customer details unchanged',async()=>{
  const admin=env.authenticatedContext('admin',{admin:true}).firestore(),buyer=env.authenticatedContext('buyer').firestore();
  const text={heading:'DELIVERY',recipient:'Test Customer',address:'12 Test Lane',apartment:'Door 2',city:'Bengaluru',state:'Karnataka',postalCode:'560001',phone:'9876543210',country:'IN · INDIA',handling:'Fragile',qrHeading:'SCAN PIN',message:'Made by Silly Sensei'};
  const ref=doc(admin,'checkoutRequests','request-1','labels','print');
  await assertSucceeds(setDoc(ref,{text,updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(ref));
  await assertFails(setDoc(doc(buyer,'checkoutRequests','request-1','labels','print'),{text,updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(buyer,'checkoutRequests','request-1','labels','print')));
  await assertFails(setDoc(ref,{text:{...text,postalCode:'000000'},updatedAt:serverTimestamp()}));
  await assertFails(setDoc(ref,{text:{...text,latitude:1},updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(admin,'checkoutRequests','absent','labels','print'),{text,updatedAt:serverTimestamp()}));
  const original=await getDoc(doc(admin,'checkoutRequests','request-1'));
  if(original.data().customer.address!=='12 Example Lane')throw new Error('Original address was changed.');
});
test('product notes and reference paths are private and atomically tied to the request',async()=>{
  const db=env.authenticatedContext('buyer').firestore();
  const extra={uid:'buyer',productId:'test-art',note:'Please use green.',images:['references/buyer/custom-order/test-art/reference.jpg']};
  const batch=writeBatch(db);batch.set(doc(db,'checkoutRequests','custom-order'),request('buyer'));batch.set(doc(db,'checkoutRequests','custom-order','customizations','test-art'),extra);
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db,'checkoutRequests','custom-order','customizations','test-art')));
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),'checkoutRequests','custom-order','customizations','test-art')));
  await assertFails(setDoc(doc(db,'checkoutRequests','custom-order','customizations','not-in-cart'),{...extra,productId:'not-in-cart'}));
  const spoof=writeBatch(db);spoof.set(doc(db,'checkoutRequests','spoof-reference'),request('buyer'));spoof.set(doc(db,'checkoutRequests','spoof-reference','customizations','test-art'),{...extra,images:['references/other/spoof-reference/test-art/reference.jpg']});
  await assertFails(spoof.commit());
});
test('a full five-product checkout can include three private references per product',async()=>{
  const db=env.authenticatedContext('buyer').firestore();const payload=request('buyer');
  payload.items=Array.from({length:5},(_,i)=>({...payload.items[0],productId:`art-${i}`}));payload.estimatedSubtotal=9000;
  const batch=writeBatch(db);batch.set(doc(db,'checkoutRequests','full-custom'),payload);
  for(const item of payload.items)batch.set(doc(db,'checkoutRequests','full-custom','customizations',item.productId),{
    uid:'buyer',productId:item.productId,note:'Please use green.',
    images:Array.from({length:3},(_,i)=>`references/buyer/full-custom/${item.productId}/image-${i}.jpg`)
  });
  await assertSucceeds(batch.commit());
});
test('Base64 reference images remain private and fit a full checkout batch',async()=>{
  const db=env.authenticatedContext('buyer').firestore(),payload=request('buyer');
  payload.items=Array.from({length:5},(_,i)=>({...payload.items[0],productId:`inline-${i}`}));payload.estimatedSubtotal=9000;
  const batch=writeBatch(db);batch.set(doc(db,'checkoutRequests','inline-private'),payload);
  for(const item of payload.items)batch.set(doc(db,'checkoutRequests','inline-private','customizations',item.productId),{uid:'buyer',productId:item.productId,note:'Private image',images:Array(3).fill(inlineImage)});
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db,'checkoutRequests','inline-private','customizations','inline-0')));
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),'checkoutRequests','inline-private','customizations','inline-0')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'checkoutRequests','inline-private','customizations','inline-0')));
});
