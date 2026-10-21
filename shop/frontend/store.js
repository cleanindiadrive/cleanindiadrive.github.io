import {backendURL} from './backend-config.js';
import {firebaseConfig, ADMIN_EMAILS,APP_CHECK_SITE_KEY} from './firebase-config.js';
import {normalizeProduct,validateCustomer} from './commerce.js';
import {normalizeSettings} from './store-settings.js';
import {normalizeContent,validateContent} from './store-content.js';
import {encodeImage,isInlineImage} from './image-data.js';

let sdkPromise, sdk,realtimePromise;
const productListeners=new Set();
let adminProducts=[];
export async function backend(){
 if(!sdkPromise)sdkPromise=Promise.all([import('https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js')]).then(([appAPI,a])=>{const app=appAPI.getApps().length?appAPI.getApp():appAPI.initializeApp(firebaseConfig);sdk={app,auth:a.getAuth(app),a};return sdk;}).catch(error=>{sdkPromise=null;throw error;});return sdkPromise;
}
async function realtimeBackend(){
 if(!realtimePromise)realtimePromise=(async()=>{const {app}=await backend();const r=await import('https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js');let url=firebaseConfig.databaseURL;
 if(!url){const response=await fetch(backendURL()+'/config',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('The backend database configuration is unavailable.');const config=await response.json();if(config.projectId!==firebaseConfig.projectId)throw new Error('Frontend and backend Firebase projects do not match.');url=config.databaseURL;}
 if(!url)throw new Error('Set FIREBASE_DB_URL on the backend.');return {r,db:r.getDatabase(app,url)};})().catch(error=>{realtimePromise=null;throw error;});return realtimePromise;
}
function cachedPublic(path,onData){const key='silly-public-v2:'+path;try{const cache=JSON.parse(localStorage.getItem(key));if(cache&&Date.now()-cache.time<86400000)onData(cache.value);}catch{}return value=>{try{localStorage.setItem(key,JSON.stringify({time:Date.now(),value}));}catch{}onData(value);};}
async function observePublic(path,onData,onError){const publish=cachedPublic(path,onData);const {r,db}=await realtimeBackend();return r.onValue(r.ref(db,'publicStore/'+path),snapshot=>publish(snapshot.val()||{}),onError);}
export async function observeAuth(callback) {
  const {a,auth} = await backend();
  let version=0;
  return a.onAuthStateChanged(auth, async user => {
    const current=++version;
    let admin = false;
    if (user && !user.isAnonymous) {
      try { const {claims} = await user.getIdTokenResult(); admin = claims.admin === true || (user.emailVerified && ADMIN_EMAILS.includes((user.email || '').toLowerCase())); } catch {}
    }
    if(user&&!user.isAnonymous){try{admin=(await callBackend('currentUser')).admin;}catch{}}
    if(current===version&&auth.currentUser?.uid===user?.uid)callback(user,admin);
  });
}
export async function signIn() {
  const {a,auth}=await backend(),provider=new a.GoogleAuthProvider();
  if(auth.currentUser?.isAnonymous){
    try{return await a.linkWithPopup(auth.currentUser,provider);}
    catch(error){if(error.code!=='auth/credential-already-in-use')throw error;
      const guestToken=await auth.currentUser.getIdToken(),credential=a.GoogleAuthProvider.credentialFromError(error);
      const result=await a.signInWithCredential(auth,credential);
      try{await callBackend('claimGuestRequests',{guestToken});}catch{throw new Error('Signed in. Your earlier guest request is still private; the studio can help recover it after the backend is connected.');}
      return result;
    }
  }
  return a.signInWithPopup(auth,provider);
}
export async function signOut() {
  const {a,auth} = await backend();await a.signOut(auth);
}
export async function observeSettings(onData,onError){return observePublic('settings',v=>onData(normalizeSettings(v)),onError);}
export async function saveSettings(value){return callBackend('saveStoreData',{kind:'settings',value:normalizeSettings(value)});}
export async function observeContent(onData,onError){return observePublic('content',v=>onData(normalizeContent(v)),onError);}
export async function saveContent(value){const error=validateContent(value);if(error)throw new Error(error);return callBackend('saveStoreData',{kind:'content',value:normalizeContent(value)});}
export async function observeProducts(admin,onData,onError){
 if(!admin)return observePublic('products',value=>onData(Object.entries(value).map(([id,p])=>normalizeProduct({...p,id}))),onError);
 let active=true;const refresh=async()=>{try{const rows=await callBackend('listProducts');if(active){adminProducts=rows;onData(rows);};}catch(error){if(active)onError(error);}};productListeners.add(refresh);await refresh();const timer=setInterval(refresh,30000);return ()=>{active=false;clearInterval(timer);productListeners.delete(refresh);};
}
export async function saveProduct(product,id){const result=await callBackend('saveProduct',{product,id:id||null,expectedUpdatedAt:id?adminProducts.find(p=>p.id===id)?.updatedAt:null});for(const refresh of productListeners)refresh();return result.id;}
export async function archiveProduct(id){await callBackend('archiveProduct',{id});for(const refresh of productListeners)refresh();}
export async function uploadImage(file){return encodeImage(file);}
export async function saveCheckout(id,customer,cart,displayedProducts,customizations=[],payAtCheckout=false){
 const invalid=validateCustomer(customer);if(invalid)throw new Error(invalid);const {auth}=await backend();await auth.authStateReady();if(!auth.currentUser||auth.currentUser.isAnonymous)throw new Error('Sign in before checkout.');
 const extras=await prepareCustomizations(id,auth.currentUser.uid,customizations);
 return callBackend('createRequest',{requestId:id,customer,cart:cart.map(item=>({id:item.id,quantity:item.quantity,unitPrice:displayedProducts.find(p=>p.id===item.id)?.price})),customizations:extras,payAtCheckout});
}
async function prepareCustomizations(requestId,uid,customizations) {
  const result=[];
  for(const entry of customizations){
    if(entry.files.length>3||entry.note.length>1000)throw new Error('Use up to 3 reference images and 1,000 characters per product.');
    const images=[];
    for(const item of entry.files){
      images.push(await encodeImage(item.file));
    }
    result.push({uid,productId:entry.productId,note:entry.note.trim(),images});
  }
  return result;
}
export async function loadCustomizations(id){return callBackend('loadCustomizations',{requestId:id});}
export async function referenceImageURL(value){if(!isInlineImage(value))throw new Error('This older image needs migration by the studio.');return value;}
export async function loadRequests(){return callBackend('loadRequests');}
export async function updateRequest(id,status){return callBackend('updateOrderStatus',{requestId:id,status});}
export async function loadCustomerRequests(cursor=null){return callBackend('loadCustomerRequests',{cursor});}
export async function loadProfile(){return callBackend('getProfile');}
export async function saveProfile(profile){return callBackend('saveProfile',{profile});}
export async function loadLabel(){return callBackend('getLabels');}
export async function saveLabel(text){return callBackend('saveStoreData',{kind:'labels',value:text});}
export async function loadSales(){return callBackend('loadSales');}
export async function cancelRequest(id,reason){return callBackend('cancelRequest',{requestId:id,reason});}
export async function callBackend(name,data={}){
 const {auth,app}=await backend();await auth.authStateReady();if(!auth.currentUser)throw new Error('Sign in to continue.');
 const url=backendURL()+'/api/'+encodeURIComponent(name);
 for(let attempt=0;attempt<2;attempt++){
 const headers={'Content-Type':'application/json','X-Firebase-Project':firebaseConfig.projectId,Authorization:'Bearer '+await auth.currentUser.getIdToken(attempt===1)};
 if(APP_CHECK_SITE_KEY){const check=await import('https://www.gstatic.com/firebasejs/12.3.0/firebase-app-check.js');let instance;try{instance=check.getAppCheck(app);}catch{instance=check.initializeAppCheck(app,{provider:new check.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),isTokenAutoRefreshEnabled:true});}headers['X-Firebase-AppCheck']=(await check.getToken(instance)).token;}
 let response;try{response=await fetch(url,{method:'POST',headers,body:JSON.stringify(data),signal:AbortSignal.timeout(name==='currentUser'?8000:60000)});}catch{throw new Error('The studio service could not be reached. Refresh your requests before retrying.');}
 const result=await response.json();if(response.status===401&&attempt===0)continue;
 if(!response.ok){const error=new Error(result.error?.message||'The studio service could not complete this operation.');error.code=result.error?.code;throw error;}return result.data;
 }
}
export function friendlyError(error){if(error.code==='permission-denied')return error.message||'Your account does not have access to this action.';return error.message||'Something went wrong. Please retry.';}
