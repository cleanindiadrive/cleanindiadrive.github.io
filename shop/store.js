import {firebaseConfig, ADMIN_EMAILS} from './firebase-config.js';
import {MAX_CART_ITEMS,normalizeProduct, cartLines, subtotal,validateCustomer} from './commerce.js';
import {normalizeSettings} from './store-settings.js';
import {normalizeContent,validateContent} from './store-content.js';

let sdkPromise, sdk;
const privateImages = new Map();
let privateImageOwner;
function clearPrivateImageCache() {
  for (const url of privateImages.values()) if (url) URL.revokeObjectURL(url);
  privateImages.clear();
}
export async function backend() {
  if (!sdkPromise) sdkPromise = Promise.all([
    import('https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js'),
  ]).then(([appAPI,authAPI,dbAPI,storageAPI]) => {
    const app = appAPI.getApps().length ? appAPI.getApp() : appAPI.initializeApp(firebaseConfig);
    sdk = {app,auth:authAPI.getAuth(app),db:dbAPI.getFirestore(app),storage:storageAPI.getStorage(app),a:authAPI,f:dbAPI,s:storageAPI};
    return sdk;
  }).catch(error => {sdkPromise = null; throw error;});
  return sdkPromise;
}
export async function observeAuth(callback) {
  const {a,auth} = await backend();
  return a.onAuthStateChanged(auth, async user => {
    if (privateImageOwner !== user?.uid) {clearPrivateImageCache();privateImageOwner=user?.uid;}
    let admin = false;
    if (user && !user.isAnonymous) {
      try { const {claims} = await user.getIdTokenResult(); admin = claims.admin === true || (user.emailVerified && ADMIN_EMAILS.includes((user.email || '').toLowerCase())); } catch {}
    }
    callback(user,admin);
  });
}
export async function signIn() {const {a,auth} = await backend(); return a.signInWithPopup(auth,new a.GoogleAuthProvider());}
export async function signOut() {
  const {a,auth} = await backend();await a.signOut(auth);clearPrivateImageCache();
}
export async function observeSettings(onData,onError) {
  const {f,db}=await backend();
  return f.onSnapshot(f.doc(db,'settings','storefront'),snap=>onData(normalizeSettings(snap.data())),onError);
}
export async function saveSettings(value) {
  const data=normalizeSettings(value);
  const {f,db}=await backend();await f.setDoc(f.doc(db,'settings','storefront'),data);
}
export async function observeContent(onData,onError) {
  const {f,db}=await backend();
  return f.onSnapshot(f.collection(db,'storeContent'),{includeMetadataChanges:true},snap=>{if(!snap.metadata.hasPendingWrites)onData(normalizeContent(Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]))));},onError);
}
export async function saveContent(value) {
  const invalid=validateContent(value);if(invalid)throw new Error(invalid);
  const {f,db}=await backend(),batch=f.writeBatch(db);
  for(const [section,data] of Object.entries(normalizeContent(value)))batch.set(f.doc(db,'storeContent',section),data);
  await batch.commit();
}
export async function observeProducts(admin,onData,onError) {
  const {f,db} = await backend();
  const source = admin ? f.collection(db,'products') : f.query(f.collection(db,'products'),f.where('visible','==',true));
  return f.onSnapshot(source, snap => onData(snap.docs.map(d => normalizeProduct({...d.data(),id:d.id}))), onError);
}
export async function saveProduct(product,id) {
  const {f,db} = await backend();
  const reference = id ? f.doc(db,'products',id) : f.doc(f.collection(db,'products'));
  const payload = {...product,updatedAt:f.serverTimestamp()};
  if (!id || product.createdAt) payload.createdAt = f.serverTimestamp();
  await f.setDoc(reference,payload,{merge:true}); return reference.id;
}
export async function archiveProduct(id) {
  const {f,db} = await backend(); await f.updateDoc(f.doc(db,'products',id),{visible:false,archived:true,updatedAt:f.serverTimestamp()});
}
export async function uploadImage(file,productId) {
  const blob=await imageBlob(file);
  const {s,storage} = await backend();
  const reference = s.ref(storage,`products/${productId}/${crypto.randomUUID()}.jpg`);
  await s.uploadBytes(reference,blob,{contentType:'image/jpeg'});
  return s.getDownloadURL(reference);
}
async function imageBlob(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use JPG, PNG or WebP images.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Each image must be smaller than 6 MB.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1,1600 / Math.max(bitmap.width,bitmap.height));
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d'); context.fillStyle = '#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.87));
  if (!blob) throw new Error('This image could not be processed.');
  return blob;
}
export async function saveCheckout(id,customer,cart,displayedProducts,customizations=[]) {
  const invalid=validateCustomer(customer);if(invalid)throw new Error(invalid);
  const {a,auth,f,db} = await backend();
  await auth.authStateReady();
  const user = auth.currentUser || (await a.signInAnonymously(auth)).user;
  const reference = f.doc(db,'checkoutRequests',id);
  // A stable ID makes retries safe if acknowledgement was lost after a write.
  const snapshot = await f.getDocsFromServer(f.query(f.collection(db,'products'),f.where('visible','==',true)));
  const fresh = snapshot.docs.map(d => normalizeProduct({...d.data(),id:d.id}));
  const lines = cartLines(cart,fresh);checkCart(cart,lines,displayedProducts);
  const order = makeRequest(id,user.uid,customer,lines,f.serverTimestamp());
  const {id:requestId,...payload} = order;
  const extras=await prepareCustomizations(id,user.uid,customizations);
  const batch=f.writeBatch(db);batch.set(reference,payload);
  for(const extra of extras)batch.set(f.doc(db,'checkoutRequests',id,'customizations',extra.productId),extra);
  try { await batch.commit(); }
  catch (error) {
    // A retry may hit create-only rules after the first write already succeeded.
    try { const existing = await f.getDocFromServer(reference); if (existing.exists() && existing.data().uid === user.uid) return {...existing.data(),id}; } catch {}
    throw error;
  }
  return {...payload,id:requestId};
}
async function prepareCustomizations(requestId,uid,customizations) {
  const result=[];
  for(const entry of customizations){
    if(entry.files.length>3||entry.note.length>1000)throw new Error('Use up to 3 reference images and 1,000 characters per product.');
    const images=[];
    for(const item of entry.files){
      const path=`references/${uid}/${requestId}/${entry.productId}/${item.id}.jpg`;
      if(!privateImages.has(path)){
        const blob=await imageBlob(item.file);
        {const {s,storage}=await backend();await s.uploadBytes(s.ref(storage,path),blob,{contentType:'image/jpeg'});privateImages.set(path,null);}
      }
      images.push(path);
    }
    result.push({uid,productId:entry.productId,note:entry.note.trim(),images});
  }
  return result;
}
export async function loadCustomizations(id) {
  const {f,db}=await backend();const snap=await f.getDocs(f.collection(db,'checkoutRequests',id,'customizations'));return snap.docs.map(d=>d.data());
}
export async function referenceImageURL(path) {
  if(privateImages.get(path))return privateImages.get(path);
  const {s,storage,auth}=await backend();const owner=auth.currentUser?.uid;
  const blob=await s.getBlob(s.ref(storage,path),6*1024*1024);
  if (!owner || auth.currentUser?.uid !== owner) throw new Error('Sign in again to view this reference.');
  const url=URL.createObjectURL(blob);privateImages.set(path,url);return url;
}
function checkCart(cart,lines,displayedProducts) {
  if (!cart.length || cart.length > MAX_CART_ITEMS || lines.length !== cart.length || lines.some(l => cart.find(c=>c.id===l.product.id)?.quantity !== l.quantity)) throw new Error('An item is no longer available in that quantity. Please review your cart.');
  if (lines.some(l => displayedProducts.find(p=>p.id===l.product.id)?.price !== l.product.price)) throw new Error('A price has changed. Please refresh the store and review your cart before continuing.');
}
function makeRequest(id,uid,customer,lines,createdAt) {
  return {id,uid,customer,items:lines.map(({product,quantity}) => ({productId:product.id,title:product.title,category:product.category,quantity,unitPrice:product.price})),estimatedSubtotal:subtotal(lines),currency:'INR',status:'details_received',paymentStatus:'not_started',createdAt};
}
export async function loadRequests() {
  const {f,db} = await backend();
  const snap = await f.getDocs(f.query(f.collection(db,'checkoutRequests'),f.orderBy('createdAt','desc'),f.limit(100)));
  return snap.docs.map(d=>({...d.data(),id:d.id}));
}
export async function updateRequest(id,status) {
  if (!['details_received','reviewed','contacted','closed'].includes(status)) throw new Error('Invalid status');
  const {f,db} = await backend();await f.updateDoc(f.doc(db,'checkoutRequests',id),{status,updatedAt:f.serverTimestamp()});
}
export async function loadCustomerRequests(cursor=null) {
  const {auth,f,db}=await backend();await auth.authStateReady();
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sign in to view your requests.');
  const constraints=[f.where('uid','==',auth.currentUser.uid),f.orderBy('createdAt','desc')];
  if (cursor) constraints.push(f.startAfter(cursor));
  constraints.push(f.limit(20));
  const snapshot=await f.getDocs(f.query(f.collection(db,'checkoutRequests'),...constraints));
  return {requests:snapshot.docs.map(d=>({...d.data(),id:d.id})),cursor:snapshot.docs.at(-1)||null,hasMore:snapshot.size===20};
}
export async function loadProfile() {
  const {auth,f,db}=await backend();await auth.authStateReady();
  if (!auth.currentUser || auth.currentUser.isAnonymous) return {};
  const snap=await f.getDoc(f.doc(db,'customers',auth.currentUser.uid));return snap.data()||{};
}
export async function saveProfile(profile) {
  const {auth,f,db}=await backend();
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sign in to save your details.');
  await f.setDoc(f.doc(db,'customers',auth.currentUser.uid),{...profile,updatedAt:f.serverTimestamp()});
}
export async function loadLabel(id) {
  const {f,db}=await backend();const snap=await f.getDoc(f.doc(db,'checkoutRequests',id,'labels','print'));
  return snap.data()?.text||{};
}
export async function saveLabel(id,text) {
  const {f,db}=await backend();
  await f.setDoc(f.doc(db,'checkoutRequests',id,'labels','print'),{text,updatedAt:f.serverTimestamp()});
}
export function friendlyError(error) {
  const code = String(error.code || '');
  if (code.includes('permission-denied') || code.includes('unauthorized')) return 'This information is not available to your account. Please sign in again or contact the studio.';
  if (code.includes('failed-precondition')) return 'Request history is being prepared. Please try again shortly.';
  if (code.includes('operation-not-allowed') || code.includes('configuration-not-found')) return 'Sign-in is not enabled yet. Enable Google and Anonymous authentication in Firebase.';
  if (code.includes('popup-closed')) return 'Sign-in was cancelled. You can try again.';
  if (code.includes('unavailable') || !navigator.onLine) return 'Could not reach the store. Check your connection and try again; your cart is still here.';
  return error.message || 'Something went wrong. Please try again.';
}
