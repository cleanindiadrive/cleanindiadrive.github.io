import {MAX_CART_ITEMS,CATEGORIES,categoryOf,money,escapeHTML as e,safeImage,cartLines,subtotal,filterProducts,validateCustomer} from './commerce.js';
import * as store from './store.js';
import {mapPanel,mountDeliveryMap} from './delivery-location.js';
import {validLocation,locationLink} from './location-utils.js';
import {openLabel} from './labels.js';
import {decorateCartButtons,animateCart,beginCheckoutAnimation,truckContent,reviewSection,mountReviews} from './shop-effects.js';
import {accountMarkup} from './customer-dashboard.js';
import {normalizeProfile,validateProfile} from './profile.js';
import {logoutMarkup,mountLogout,animateLogout} from './logout.js';
import {DEFAULT_SETTINGS,normalizeSettings,safeStoreLink,bannerMarkup,settingsForm} from './store-settings.js';
import {DEFAULT_CONTENT,normalizeContent,contentCategories,applyStoreContent,footerMarkup} from './store-content.js';
import {homeMarkup,storyMarkup,infoMarkup,productCardMarkup} from './storefront-view.js';
import {mountContentEditor} from './content-editor.js';
import {customizationFields,setProductNote,addReferences,removeReference,refreshReferencePreviews,clearCustomization,checkoutCustomizations,clearCustomizations} from './customization.js';
let storeSettings={...DEFAULT_SETTINGS};
let siteContent=normalizeContent(DEFAULT_CONTENT),contentDraft=null,contentEditor=null,contentReady=false,contentError='';
let requestedAdminPage=location.hash.startsWith('#admin/')?location.hash.slice(1):'admin';
let deliveryMap,stopReviews=()=>{};

const $ = id => document.getElementById(id);
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('main').focus();$('main').scrollIntoView({behavior:'instant'});});
const cartKey = 'silly-shop-cart-v1';
let products = [], cart = [], user = null, isAdmin = false, catalogReady = false, catalogError = '', unsubscribeProducts, catalogGeneration = 0;
let filter = {sort:'featured',available:false}, adminTab = 'products', adminSearch = '', adminCategory = '';
let requestList = [], requestsLoaded = false, requestsError = '', editingId = null, editingImages = [];
let checkoutDraft = {}, checkoutId = crypto.randomUUID(), completedRequest = null, submitting = false;
let toastTimer, orderNote = '';
let authLoading=true,authError='',accountState={requests:[],profile:{},loaded:false,loading:false};
try {const saved = JSON.parse(localStorage.getItem(cartKey)); if (Array.isArray(saved)) cart = saved.filter(c=>c && typeof c.id==='string' && Number.isInteger(c.quantity) && c.quantity>0).slice(0,MAX_CART_ITEMS);} catch {}
const visible = () => products.filter(p=>p.visible && !p.archived);
const imageOf = p => safeImage(p.images?.[0],categoryOf(p.category)?.image);
const route = () => {const parts=location.hash.slice(1).split('/');return {page:parts[0] || 'home',id:parts.slice(1).join('/')};};
let categoryLinks = CATEGORIES.map(c=>`<a href="#collection/${c.id}">${e(c.name)}</a>`).join('');
$('collection-menu').innerHTML=categoryLinks;
$('mobile-menu').innerHTML=`<a href="#home">Home</a><a href="#shop">Art store</a>${CATEGORIES.map(c=>`<a class="mobile-category" href="#collection/${c.id}">${e(c.name)}</a>`).join('')}<a href="#about">Our story</a><a href="#account">My account</a>`;
$('footer').innerHTML=`<div class="container"><div class="footer-top"><div><a href="#home" class="brand"><img class="brand-logo" src="assets/brand-logo.png" alt="Silly Sensei" width="110" height="72"></a><p>A home for things made slowly, thoughtfully, and with a little bit of silliness.</p></div><div class="footer-links"><h3>Find your little thing</h3>${categoryLinks}</div><div class="footer-links"><h3>Around the studio</h3><a href="#about">Our story</a><a href="#info/shipping">Shipping & returns</a><a href="#info/contact">Get in touch</a><a href="#account">My account</a></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Silly Sensei. Made with a little heart.</span><div><a href="#info/privacy">Privacy</a><a href="#info/terms">Terms</a><span>India · INR ₹</span></div></div></div>`;

function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function persistCart(){try{localStorage.setItem(cartKey,JSON.stringify(cart));}catch{toast('Your browser could not save the cart. Keep this tab open.');}updateCartBadge();}
function lines(){return cartLines(cart,visible());}
function updateCartBadge(){const count=cart.reduce((n,c)=>n+c.quantity,0);$('cart-count').textContent=count;$('cart-count').hidden=!count;}
function reconcileCart(){
  if(!catalogReady)return;
  const next=lines().map(l=>({id:l.product.id,quantity:l.quantity}));
  if(JSON.stringify(next)!==JSON.stringify(cart)){cart=next;persistCart();toast('Your cart was updated to match current availability.');}
}
function openDialog(id){if(!$(id).open)$(id).showModal();}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function quantityControl(id,value,max,context='cart'){return `<div class="quantity"><button type="button" data-action="quantity" data-id="${e(id)}" data-context="${context}" data-delta="-1" aria-label="Decrease quantity" ${value<=1?'disabled':''}>−</button><input type="number" aria-label="${context==='product'?'Quantity':`Quantity for ${products.find(p=>p.id===id)?.title || 'item'}`}" value="${value}" min="1" max="${Math.min(99,max)}" data-quantity="${e(id)}" data-context="${context}"><button type="button" data-action="quantity" data-id="${e(id)}" data-context="${context}" data-delta="1" aria-label="Increase quantity" ${value>=Math.min(99,max)?'disabled':''}>+</button></div>`;}
function addToCart(id,quantity=1,open=true){
  const product=visible().find(p=>p.id===id);if(!product || product.stock<1)return toast('This item is sold out.');
  const current=cart.find(c=>c.id===id);const next=(current?.quantity||0)+quantity;
  if(next>Math.min(99,product.stock))return toast(`Only ${product.stock} available. Your cart already has ${current?.quantity||0}.`);
  if(!current && cart.length>=MAX_CART_ITEMS)return toast(`You can add up to ${MAX_CART_ITEMS} different items.`);
  if(current)current.quantity=next;else cart.push({id,quantity});
  completedRequest=null;checkoutId=crypto.randomUUID();persistCart();renderCart();if(open)openDialog('cart-dialog');
  return true;
}
function renderCart(){
  const entries=lines();
  if(!entries.length){$('cart-content').innerHTML=`<div class="empty-state"><span class="empty-icon">♧</span><h2>A little empty in here.</h2><p>Let's find something you love.</p><a href="#shop" class="button" data-action="close-dialog">Continue shopping</a></div>`;return;}
  $('cart-content').innerHTML=`${entries.map(({product:p,quantity,total})=>`<div class="cart-row"><a href="#product/${e(p.id)}" data-action="close-dialog"><img src="${e(imageOf(p))}" alt="${e(p.title)}"></a><div><h3><a href="#product/${e(p.id)}" data-action="close-dialog">${e(p.title)}</a></h3><p>${money(total)}</p><div class="cart-row-tools">${quantityControl(p.id,quantity,p.stock)}<button class="remove-button" data-action="remove" data-id="${e(p.id)}" aria-label="Remove ${e(p.title)}">Remove</button></div>${customizationFields(p.id,true)}</div></div>`).join('')}<label class="cart-note" for="order-note">A note for the studio <span class="muted">(optional)</span><textarea id="order-note" maxlength="1000" placeholder="Anything you would like us to know?">${e(orderNote)}</textarea></label><div class="cart-summary"><div class="total-row"><span>Subtotal</span><strong>${money(subtotal(entries))}</strong></div><p>Shipping will be confirmed separately. No payment is collected yet.</p><p class="small muted">Up to ${MAX_CART_ITEMS} different products per checkout request.</p><a class="button full" href="#checkout" data-action="close-dialog">Check out <span>→</span></a><button class="text-link full" data-action="close-dialog" style="display:block;margin:18px auto">Continue shopping</button></div>`;
}
function breadcrumbs(current,extra=''){return `<div class="breadcrumbs"><a href="#home">Home</a><span>/</span>${extra}<span>${e(current)}</span></div>`;}
function productCard(p){return productCardMarkup(p,siteContent);}
function story(){return storyMarkup();}
function renderHome(){$('main').innerHTML=homeMarkup(products,storeSettings,siteContent);}
function renderShop(){
  const {page,id}=route();const category=page==='collection'?categoryOf(id):null;
  if(page==='collection'&&!category)return renderNotFound();
  const search=page==='search'?decodeURIComponent(id):'';
  const title=category?.name || (page==='search'?`Search: “${search}”`:'The art store');
  $('main').innerHTML=`<div class="container"><div class="page-head">${breadcrumbs(category?.name || (search?'Search':'Art store'))}<h1>${e(title)}</h1><p>${e(category?.description) || 'Something to keep. Something to gift. Something to make you smile.'}</p></div><div class="filter-bar"><div class="filters"><label class="checkbox"><input type="checkbox" id="available-filter" ${filter.available?'checked':''}>In stock only</label><label for="category-filter" class="sr-only">Collection</label><select id="category-filter"><option value="">All collections</option>${CATEGORIES.map(c=>`<option value="${c.id}" ${category?.id===c.id?'selected':''}>${e(c.name)}</option>`).join('')}</select></div><div class="sort-group"><label for="sort-filter">Sort by</label><select id="sort-filter"><option value="featured">Featured</option><option value="newest">Newest first</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="title">Alphabetically, A–Z</option></select><span id="product-count" class="muted"></span></div></div><div id="product-results"></div></div>`;
  $('sort-filter').value=filter.sort;renderProductResults();
}
function renderProductResults(){const {page,id}=route();const list=filterProducts(products,{...filter,category:page==='collection'?id:'',search:page==='search'?decodeURIComponent(id):''});$('product-count').textContent=`${list.length} products`;$('product-results').innerHTML=list.length?`<div class="product-grid">${list.map(productCard).join('')}</div>`:`<div class="empty-state"><h2>${catalogReady?'Nothing here just yet.':'The studio is getting ready.'}</h2><p>${catalogError?'The live catalogue is temporarily unavailable.':catalogReady?'Try another collection or clear your filters.':'Your collection will appear here when products are published.'}</p><a class="button outline" href="#shop" data-action="reset-filters">View all products</a></div>`;}
function renderProduct(){
  const p=visible().find(p=>p.id===route().id);if(!p){if(!catalogReady&&!catalogError){$('main').innerHTML='<div class="page-loading">Loading product…</div>';return;}return renderNotFound();}
  $('main').innerHTML=`<div class="container"><div class="page-head">${breadcrumbs(p.title,`<a href="#collection/${p.category}">${e(categoryOf(p.category)?.name)}</a><span>/</span>`)}</div><section class="product-layout"><div><button class="product-main-image" data-action="zoom" aria-label="Zoom ${e(p.title)} image"><img id="product-main-image" src="${e(imageOf(p))}" alt="${e(p.title)}"></button>${p.images.length>1?`<div class="thumbs">${p.images.map((img,i)=>`<button data-action="thumbnail" data-index="${i}" class="${i===0?'active':''}" aria-label="View image ${i+1}"><img src="${e(safeImage(img))}" alt="${e(p.title)} — image ${i+1}"></button>`).join('')}</div>`:''}</div><div class="product-detail"><p class="eyebrow">Silly Sensei · ${e(categoryOf(p.category)?.name)}</p><h1>${e(p.title)}</h1><p class="price">${money(p.price)}${p.comparePrice>p.price?`<del>${money(p.comparePrice)}</del>`:''}</p><p class="small muted"><a class="text-link" href="#info/shipping">Shipping</a> confirmed separately.</p><p class="stock-status ${!p.stock?'sold':''}">${p.stock?p.stock===1?'One of a kind · 1 available':`${p.stock} available`:'Currently sold out'}</p>${p.stock?`<p class="quantity-label">Quantity</p>${quantityControl(p.id,1,p.stock,'product')}`:''}${p.stock?customizationFields(p.id):''}<div class="buy-actions"><button class="button outline full" data-action="add-detail" data-id="${e(p.id)}" ${!p.stock?'disabled':''}>${p.stock?'Add to cart':'Sold out'}</button><button class="button full" data-action="buy-now" data-id="${e(p.id)}" ${!p.stock?'disabled':''}>Buy it now <span>→</span></button></div><p class="description">${e(p.description)}</p><details open><summary>The little details</summary><p>${p.material?`Material: ${e(p.material)}<br>`:''}${p.dimensions?`Size: ${e(p.dimensions)}<br>`:''}${p.sku?`SKU: ${e(p.sku)}`:'Each little detail makes it special.'}</p></details><details><summary>Delivery & care</summary><p>Delivery arrangements and shipping costs will be confirmed after your checkout request. ${e(p.care || 'Handle with care and keep in a dry place.')}</p></details></div></section><section class="related"><div class="section-heading"><h2>A few more little things</h2><a href="#shop" class="text-link">View all →</a></div><div class="product-grid">${visible().filter(item=>item.id!==p.id).slice(0,3).map(productCard).join('')}</div></section></div>`;
}
const states=['Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];
function field(name,label,options={}){return `<label class="field ${options.wide?'wide':''}" for="${name}">${label}<input id="${name}" name="${name}" type="${options.type||'text'}" ${options.optional?'':'required'} maxlength="${options.max||100}" ${options.auto?`autocomplete="${options.auto}"`:''} ${options.pattern?`pattern="${options.pattern}"`:''} ${options.mode?`inputmode="${options.mode}"`:''} value="${e(checkoutDraft[name]||'')}" placeholder="${e(options.placeholder||label)}"></label>`;}
function renderCheckout(){
  if(user&&!user.isAnonymous){
    const name=(user.displayName||'').split(' '),defaults={email:user.email||'',firstName:name[0]||'',lastName:name.slice(1).join(' '),...accountState.profile};
    for(const key of ['email','firstName','lastName','phone','address','apartment','city','state','postalCode'])if(checkoutDraft[key]===undefined&&defaults[key])checkoutDraft[key]=defaults[key];
  }
  deliveryMap?.destroy();deliveryMap=null;
  if(completedRequest)return renderSuccess();
  const entries=lines();if(!entries.length){$('main').innerHTML=`<div class="container empty-state"><h1>Your cart is waiting.</h1><p>Add a little something before checking out.</p><a class="button" href="#shop">Explore the collection →</a></div>`;return;}
  $('main').innerHTML=`<div class="checkout-wrap"><div class="page-head">${breadcrumbs('Checkout','<a href="#shop">Art store</a><span>/</span>')}<h1>A little closer to yours.</h1><p>Leave your details and we’ll take it from here.</p></div><div class="checkout-layout"><form id="checkout-form" class="checkout-form"><h2>Contact</h2><div class="form-grid">${field('email','Email address',{type:'email',auto:'email',wide:true,max:254})}${field('phone','Mobile number',{type:'tel',auto:'tel',wide:true,max:16,placeholder:'+91 98765 43210'})}</div><h2>Delivery address</h2><div class="form-grid"><label class="field wide" for="country">Country / region<select id="country" name="country" autocomplete="country-name"><option>India</option></select></label>${field('firstName','First name',{auto:'given-name'})}${field('lastName','Last name',{auto:'family-name'})}${field('address','Address',{auto:'address-line1',wide:true,max:300})}${field('apartment','Apartment, suite, etc. (optional)',{auto:'address-line2',optional:true,wide:true,max:150})}${field('city','City',{auto:'address-level2'})}<label class="field" for="state">State<select id="state" name="state" autocomplete="address-level1" required><option value="">Select state</option>${states.map(s=>`<option ${checkoutDraft.state===s?'selected':''}>${s}</option>`).join('')}</select></label>${field('postalCode','PIN code',{auto:'postal-code',pattern:'[1-9][0-9]{5}',mode:'numeric',max:6})}<label class="field wide" for="checkout-notes">A note for the studio (optional)<textarea id="checkout-notes" name="notes" maxlength="1000" placeholder="Gift notes, delivery instructions, or a little hello…">${e(checkoutDraft.notes??orderNote)}</textarea></label></div>${mapPanel(checkoutDraft.location)}<h2>Payment</h2><div class="checkout-info"><strong>Payments are coming soon.</strong><p>You can save your checkout details now. No payment will be taken, and this does not place or reserve an order. Shipping and availability will be confirmed separately.</p></div><label class="checkbox"><input name="consent" type="checkbox" required ${checkoutDraft.consent?'checked':''}><span>I agree to share these details with Silly Sensei for this checkout request. <a href="#info/privacy" class="text-link">Privacy information</a></span></label><div class="checkout-submit-wrap"><button id="checkout-submit" type="submit" class="truck-button">${truckContent('Save checkout')}</button></div><p id="checkout-motion-status" class="checkout-motion-status" role="status"></p><p id="checkout-notice" class="notice" role="alert"></p><a href="#shop" class="text-link">← Back to shopping</a></form><aside class="checkout-summary summary-collapsed" aria-labelledby="summary-title"><button type="button" class="summary-toggle" data-action="toggle-summary" aria-expanded="false" aria-controls="checkout-summary-content"><span>View your collection <span aria-hidden="true">⌄</span></span><strong>${money(subtotal(entries))}</strong></button><div id="checkout-summary-content"><div class="section-heading" style="margin:0 0 25px"><h2 id="summary-title">Your little collection</h2><button class="text-link" data-action="cart">Edit</button></div>${entries.map(({product:p,quantity,total})=>`<div class="checkout-item"><div class="checkout-item-image"><img src="${e(imageOf(p))}" alt="${e(p.title)}"><span>${quantity}</span></div><div>${e(p.title)}<small>${e(categoryOf(p.category)?.name)}</small></div><span>${money(total)}</span></div>`).join('')}<hr><div class="total-row"><span>Subtotal · ${entries.reduce((n,l)=>n+l.quantity,0)} ${entries.reduce((n,l)=>n+l.quantity,0)===1?'item':'items'}</span><span>${money(subtotal(entries))}</span></div><div class="total-row"><span>Shipping</span><span class="small muted">To be confirmed</span></div><div class="total-row grand"><span>Estimated subtotal</span><span>${money(subtotal(entries))}</span></div><p class="small muted">INR · Final total will be confirmed before payment.</p><div class="checkout-info"><strong>Just the details, for now.</strong><p>Your information helps us prepare your request. We won’t ask for card details on this page.</p></div></div></aside></div></div>`;
  mountCheckoutMap();
}
function mountCheckoutMap(){
  deliveryMap=mountDeliveryMap(document.querySelector('.delivery-pin'),{
    initial:checkoutDraft.location,
    getAddress:()=>{captureCheckout();return checkoutDraft;},
    onChange:point=>{if(point)checkoutDraft.location=point;else delete checkoutDraft.location;},
    onAddress:address=>{for(const key of ['address','city','state','postalCode']){if(!address[key]||!$(key))continue;if(key==='state'&&!states.includes(address[key]))continue;$(key).value=address[key];}captureCheckout();},
  });
}
function captureCheckout(){const form=$('checkout-form');if(!form)return;const data=new FormData(form);const point=checkoutDraft.location;checkoutDraft=Object.fromEntries(data);if(point)checkoutDraft.location=point;checkoutDraft.consent=data.get('consent')==='on';}
function renderSuccess(){$('main').innerHTML=`<div class="container"><section class="success-card"><span class="success-icon">✓</span><p class="eyebrow">Details received</p><h1>Thanks, ${e(completedRequest.customer.firstName)}.</h1><p>Your checkout details have been saved for the studio to review.</p><p>Reference: <strong>${e(completedRequest.id.slice(0,8).toUpperCase())}</strong></p><div class="checkout-info"><strong>No payment has been taken.</strong><p>This is a checkout request, not a confirmed order. Items are not reserved.</p></div><a class="button" href="#shop">Keep exploring →</a><p style="margin-top:20px"><a href="#account/requests" class="text-link">My checkout requests →</a></p></section></div>`;}
async function submitCheckout(event){event.preventDefault();if(submitting)return;captureCheckout();if(deliveryMap?.needsConfirmation()){ $('checkout-notice').textContent='Choose and confirm your delivery pin on the map before saving.';deliveryMap.focus();return;}const customer=Object.fromEntries(Object.entries(checkoutDraft).map(([k,v])=>[k,typeof v==='string'?v.trim():v]));const error=validateCustomer(customer);if(error){$('checkout-notice').textContent=error;return;}
  submitting=true;const button=$('checkout-submit'),animation=beginCheckoutAnimation(button);$('checkout-notice').textContent='';
  try{
    const saved=await store.saveCheckout(checkoutId,customer,cart,products,checkoutCustomizations(cart));
    await animation.complete();completedRequest=saved;deliveryMap?.destroy();deliveryMap=null;
    cart=[];persistCart();clearCustomizations();checkoutDraft={};orderNote='';requestsLoaded=false;accountState.loaded=false;
    if(route().page==='checkout'){renderSuccess();window.scrollTo(0,0);$('main').focus({preventScroll:true});}
    else{render();toast('Checkout details saved. Your request is ready for the studio.');}
  }catch(error){if($('checkout-notice'))$('checkout-notice').textContent=store.friendlyError(error);else toast(store.friendlyError(error));}
  finally{submitting=false;animation.reset();}
}
function renderAccount(){
  $('main').innerHTML=accountMarkup(user,isAdmin,{...accountState,tab:route().id,states,authLoading,authError});mountLogout();
  if(user&&!user.isAnonymous&&!accountState.loaded&&!accountState.loading)fetchCustomerAccount();
}
async function fetchCustomerAccount(more=false){
  if(!user||user.isAnonymous||accountState.loading)return;
  const uid=user.uid;accountState.loading=true;accountState.error='';
  if(route().page==='account')renderAccount();
  const [history,profile]=await Promise.allSettled([store.loadCustomerRequests(more?accountState.cursor:null),more?Promise.resolve(accountState.profile):store.loadProfile()]);
  if(user?.uid!==uid)return;
  if(history.status==='fulfilled'){
    accountState.requests=more?[...accountState.requests,...history.value.requests]:history.value.requests;
    accountState.cursor=history.value.cursor;accountState.hasMore=history.value.hasMore;
  }else accountState.error=store.friendlyError(history.reason);
  if(profile.status==='fulfilled'){accountState.profile=profile.value;accountState.profileError='';}
  else accountState.profileError=store.friendlyError(profile.reason);
  accountState.loading=false;accountState.loaded=true;
  if(route().page==='account')renderAccount();
  if(route().page==='checkout'&&$('checkout-form')&&!submitting){
    const defaults={email:user.email||'',...accountState.profile};
    for(const key of ['email','firstName','lastName','phone','address','apartment','city','state','postalCode']){
      const input=$('checkout-form').elements[key];
      if(input&&!input.value&&checkoutDraft[key]===undefined&&defaults[key]){input.value=defaults[key];checkoutDraft[key]=defaults[key];}
    }
  }
}
async function submitCustomerProfile(event){
  event.preventDefault();const form=event.target,button=form.querySelector('[type="submit"]'),notice=$('profile-notice');
  const profile=normalizeProfile(Object.fromEntries(new FormData(form))),error=validateProfile(profile);
  if(error){notice.textContent=error;return;}
  button.disabled=true;notice.classList.remove('is-success');notice.textContent='Saving your details…';
  try{await store.saveProfile(profile);accountState.profile=profile;notice.classList.add('is-success');notice.textContent='Your details are saved for next time.';}
  catch(error){notice.textContent=store.friendlyError(error);}finally{button.disabled=false;}
}
function applyStoreBanners(){
  const announcement=document.querySelector('.announcement');
  announcement.hidden=!storeSettings.announcementVisible;
  announcement.innerHTML=`<a href="${e(storeSettings.announcementLink)}">${e(storeSettings.announcementText)} <span aria-hidden="true">→</span></a>`;
}
async function submitBanners(event){
  event.preventDefault();if(!isAdmin)return;
  const form=event.target,data=new FormData(form),button=form.querySelector('[type="submit"]'),notice=$('banner-notice');
  const value=Object.fromEntries(data);delete value.bannerFile;
  if(!value.bannerImage&&form.elements.bannerImage.dataset.savedImage==='true')value.bannerImage=storeSettings.bannerImage;
  value.announcementVisible=data.get('announcementVisible')==='on';value.bannerVisible=data.get('bannerVisible')==='on';
  value.reviewsVisible=data.get('reviewsVisible')==='on';value.reviewImages=String(data.get('reviewImages')||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  if(value.reviewImages.length>7||value.reviewImages.some(url=>!/^https:\/\//.test(url)||url.length>2000)||(value.reviewsVisible&&value.reviewImages.length!==7)){notice.textContent='Add exactly 7 HTTPS review image URLs to show the carousel, or leave it hidden.';return;}
  if(['announcementLink','bannerLink'].some(key=>safeStoreLink(value[key])!==value[key])){notice.textContent='Use a store link such as #shop or a valid HTTPS URL.';return;}
  button.disabled=true;notice.classList.remove('is-success');notice.textContent='Saving banners…';
  try{
    const file=data.get('bannerFile');
    if(file?.size)value.bannerImage=await store.uploadImage(file,'store-banner');
    else if(value.bannerImage&&safeImage(value.bannerImage,'')!==value.bannerImage)throw new Error('Use an HTTPS image URL or choose an image file.');
    await store.saveSettings(normalizeSettings(value));
    notice.classList.add('is-success');notice.textContent='Banners saved. Your visibility settings are live in this store.';
    $('banner-preview').innerHTML=bannerMarkup({...storeSettings,bannerVisible:true});
  }catch(error){notice.textContent=store.friendlyError(error);}finally{button.disabled=false;}
}
async function showProductCustomizations(id){
  if(!user||user.isAnonymous)return;
  const target=$(`request-custom-${id}`),request=(isAdmin&&route().page==='admin'?requestList:accountState.requests).find(o=>o.id===id);if(!target||!request)return;
  target.innerHTML='<p class="muted">Loading product notes…</p>';
  try{
    const entries=await store.loadCustomizations(id);
    const sections=[];
    for(const entry of entries){
      const photos=[];
      for(const path of entry.images){
        try{const url=await store.referenceImageURL(path);photos.push(`<a href="${e(url)}" target="_blank" rel="noopener"><img src="${e(url)}" alt="Customer reference image"></a>`);}catch{photos.push('<p class="small">Image could not load. Try again or check access to this request.</p>');}
      }
      sections.push(`<section><h3>${e(request.items.find(item=>item.productId===entry.productId)?.title||entry.productId)}</h3><p class="product-note-copy">${e(entry.note||'Reference images only.')}</p><div class="reference-gallery">${photos.join('')}</div></section>`);
    }
    target.innerHTML=sections.join('')||'<p class="muted">No product notes or reference images were added.</p>';
  }catch(error){target.textContent=store.friendlyError(error);}
}
function renderAdmin(){
  if(!isAdmin){renderAccount();return;}
  if(['products','collections','requests','settings','content'].includes(route().id))adminTab=route().id;
  contentEditor?.destroy();contentEditor=null;
  $('main').innerHTML=`<div class="wide-container admin-layout"><aside class="admin-sidebar"><p class="eyebrow">The studio / Admin</p>${[['products','Products'],['collections','Collections'],['requests','Checkout requests'],['content','Storefront editor'],['settings','Banners & reviews']].map(([id,label])=>`<button class="admin-tab ${adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}">${label}</button>`).join('')}<hr><a class="admin-tab" href="#home">View store ↗</a>${logoutMarkup()}<p class="small muted">${e(user?.displayName || 'Administrator')}</p></aside><section class="admin-main" id="admin-content"></section></div>`;renderAdminContent();mountLogout();
}
function renderAdminContent(){
  if(adminTab==='products'){
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Your products</h1><p>A home for everything you make.</p></div><button class="button" data-action="new-product">+ Add product</button></div><div class="stats-grid"><div class="stat"><span>Total products</span><strong>${products.length}</strong></div><div class="stat"><span>Published</span><strong>${products.filter(p=>p.visible).length}</strong></div><div class="stat"><span>Out of stock</span><strong>${products.filter(p=>!p.stock).length}</strong></div></div><div class="admin-filters"><input id="admin-search" aria-label="Search admin products" placeholder="Search products…" value="${e(adminSearch)}"><select id="admin-category" aria-label="Filter admin collection"><option value="">All collections</option>${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===adminCategory?'selected':''}>${e(c.name)}</option>`).join('')}</select></div><div id="admin-product-table"></div>`;renderAdminTable();
  }else if(adminTab==='collections'){
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Your collections</h1><p>Four little worlds, one studio. Assign a collection when editing a product.</p></div></div><div class="admin-category-grid">${CATEGORIES.map(c=>`<article><img src="${e(c.image)}" alt="${e(c.name)}"><h2>${e(c.name)}</h2><p>${products.filter(p=>p.category===c.id).length} products · <a href="#collection/${c.id}" class="text-link">View collection →</a></p></article>`).join('')}</div>`;
  }else if(adminTab==='requests'){
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Checkout requests</h1><p>Customer details collected before payment. These are not paid orders.</p></div><button class="button outline small" data-action="refresh-requests">Refresh</button></div><div id="requests-list">${requestsLoaded?'':'<p class="muted">Loading requests…</p>'}</div>`;
    if(requestsLoaded)renderRequests();else fetchRequests();
  }else if(adminTab==='content'){
    if(!contentReady&&!contentError){$('admin-content').innerHTML='<h1>Storefront editor</h1><p role="status">Loading your published pages…</p>';return;}
    contentEditor=mountContentEditor($('admin-content'),siteContent,{
      draft:contentDraft,loadError:contentError,products:()=>products,settings:()=>storeSettings,header:()=>document.querySelector('.site-header').outerHTML,
      onDraft:value=>{contentDraft=value;},
      onUpload:file=>store.uploadImage(file,'store-content'),
      onPublish:async value=>{if(!isAdmin)throw new Error('Sign in with an administrator account to publish.');try{await store.saveContent(value);}catch(error){throw new Error(store.friendlyError(error));}siteContent=normalizeContent(value);refreshStoreContent();}
    });
  }else{
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Store settings</h1><p>Make the storefront your own.</p></div></div>${settingsForm(storeSettings)}`;
  }
}
function renderAdminTable(){const list=products.filter(p=>(!adminCategory||p.category===adminCategory)&&`${p.title} ${p.sku}`.toLowerCase().includes(adminSearch.toLowerCase()));$('admin-product-table').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th>Price</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><div class="table-product"><img src="${e(imageOf(p))}" alt=""><span>${e(p.title)}${p.featured?' <span title="Featured">✳</span>':''}<small>${e(categoryOf(p.category)?.name)}</small></span></div></td><td><span class="status-pill ${p.visible?'':'draft'}">${p.archived?'Archived':p.visible?'Published':'Draft'}</span></td><td>${p.stock} in stock</td><td>${money(p.price)}</td><td><button class="table-action" data-action="edit-product" data-id="${e(p.id)}" aria-label="Edit ${e(p.title)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><h2>No products yet.</h2><p>Add a product or change your search.</p></div>';}
async function fetchRequests(){try{requestList=await store.loadRequests();requestsError='';}catch(error){requestsError=store.friendlyError(error);}requestsLoaded=true;if($('requests-list'))renderRequests();}
function renderRequests(){$('requests-list').innerHTML=requestsError?`<p class="notice" role="alert">${e(requestsError)}</p>`:requestList.length?requestList.map(o=>`<article class="order-card"><div class="order-head"><h2>#${e(o.id.slice(0,8).toUpperCase())} <span class="status-pill">No payment</span></h2><select data-request-status="${e(o.id)}" aria-label="Status for ${e(o.id.slice(0,8))}">${[['details_received','Details received'],['reviewed','Reviewed'],['contacted','Contacted'],['closed','Closed']].map(([value,label])=>`<option value="${value}" ${o.status===value?'selected':''}>${label}</option>`).join('')}</select></div><p><strong>${e(o.customer.firstName)} ${e(o.customer.lastName)}</strong><br>${e(o.customer.email)} · ${e(o.customer.phone)}</p><p>${e(o.customer.address)}${o.customer.apartment?`, ${e(o.customer.apartment)}`:''}<br>${e(o.customer.city)}, ${e(o.customer.state)} ${e(o.customer.postalCode)} · ${e(o.customer.country)}</p><div class="order-lines">${o.items.map(item=>`<span>${e(item.quantity)} × ${e(item.title)} — ${money(item.unitPrice*item.quantity)}</span>`).join('')}</div><button class="text-link" data-action="request-customizations" data-id="${e(o.id)}">View product notes & images</button><div id="request-custom-${e(o.id)}" class="request-customizations"></div><p>Estimated subtotal: <strong>${money(o.estimatedSubtotal)}</strong> · Shipping unconfirmed</p>${o.customer.notes?`<p><strong>Note:</strong> ${e(o.customer.notes)}</p>`:''}<div class="order-label-actions"><button class="button outline small" data-action="print-label" data-id="${e(o.id)}">Edit & print label ↗</button><a class="text-link" href="${e(locationLink(o.customer))}" target="_blank" rel="noopener">${validLocation(o.customer.location)?'View delivery pin ↗':'Search address ↗'}</a></div><p class="small muted">Received ${new Date(o.createdAt?.seconds?o.createdAt.seconds*1000:o.createdAt).toLocaleString('en-IN')}</p></article>`).join(''):'<div class="empty-state"><span class="empty-icon">↘</span><h2>All quiet for now.</h2><p>Saved checkout requests will appear here.</p></div>';}
function openEditor(id){
  if(!isAdmin)return;editingId=id||null;const p=products.find(p=>p.id===id)||{title:'',description:'',category:'paintings',price:'',stock:1,visible:true,images:[],material:'',dimensions:'',care:'',sku:''};editingImages=[...p.images];
  $('editor-dialog').innerHTML=`<div class="drawer-header"><div><p class="eyebrow">The studio / Products</p><h2 id="editor-title">${id?'Edit product':'Make room for something new.'}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Close product editor">×</button></div><form id="product-form"><div class="form-grid"><label class="field wide">Product name<input name="title" required maxlength="120" value="${e(p.title)}" placeholder="Give your little thing a name"></label><label class="field wide">Description<textarea name="description" maxlength="3000" placeholder="Tell its story…">${e(p.description)}</textarea></label><label class="field">Collection<select name="category" required>${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===p.category?'selected':''}>${e(c.name)}</option>`).join('')}</select></label><label class="field">SKU (optional)<input name="sku" maxlength="80" value="${e(p.sku)}"></label><label class="field">Price (₹)<input name="price" type="number" required min="0.01" max="10000000" step="0.01" value="${e(p.price)}"></label><label class="field">Compare-at price (₹, optional)<input name="comparePrice" type="number" min="0" max="10000000" step="0.01" value="${p.comparePrice||''}"></label><label class="field">Available quantity<input name="stock" type="number" required min="0" max="100000" step="1" value="${p.stock}"></label><label class="field">Material (optional)<input name="material" maxlength="150" value="${e(p.material)}"></label><label class="field">Dimensions (optional)<input name="dimensions" maxlength="150" value="${e(p.dimensions)}"></label><label class="field">Care instructions (optional)<input name="care" maxlength="500" value="${e(p.care)}"></label><label class="field wide">Additional image URLs (one per line)<textarea id="product-image-urls" name="imageUrls" placeholder="https://…"></textarea></label><label class="field wide">Or upload photos · JPG, PNG, WebP · up to 6 MB each<input id="product-files" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple ></label></div><div id="editor-saved-images" class="image-preview-grid"></div><div id="editor-image-preview" class="image-preview-grid"></div><p class="small muted" style="margin-top:12px">Up to 8 images. The first image is your cover. Leave images blank to use the collection placeholder.</p><label class="checkbox"><input type="checkbox" name="visible" ${p.visible?'checked':''}>Publish to the storefront</label><label class="checkbox"><input type="checkbox" name="featured" ${p.featured?'checked':''}>Feature on the homepage</label><div class="editor-actions">${id?`<button type="button" class="danger-link" data-action="archive-product" data-id="${e(id)}">Archive product</button>`:'<span></span>'}<button id="save-product" class="button" type="submit">${id?'Save changes':'Add product'} →</button></div><p id="product-notice" class="notice" role="alert"></p></form>`;renderSavedProductImages();openDialog('editor-dialog');
}
function renderSavedProductImages(){
  $('editor-saved-images').innerHTML=editingImages.map((img,i)=>`<div class="saved-product-image"><img src="${e(safeImage(img))}" alt="Saved product photo ${i+1}"><button type="button" class="text-link" data-action="remove-product-image" data-index="${i}" aria-label="Remove saved photo ${i+1}">Remove</button></div>`).join('');
}
async function submitProduct(event){event.preventDefault();if(!isAdmin)return;const form=event.target;const data=new FormData(form);const price=Number(data.get('price')),comparePrice=Number(data.get('comparePrice')||0),stock=Number(data.get('stock'));
  const urls=String(data.get('imageUrls')||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);const files=[...$('product-files').files];
  const fail=m=>$('product-notice').textContent=m;
  if(!String(data.get('title')).trim())return fail('Enter a product name.');
  if(!Number.isFinite(price)||price<=0||!Number.isInteger(stock)||stock<0)return fail('Enter a valid price and whole-number stock quantity.');
  if(comparePrice && comparePrice<=price)return fail('The compare-at price must be higher than the selling price.');
  if(editingImages.length+urls.length+files.length>8)return fail('Use up to 8 images.');
  if(urls.some(url=>safeImage(url,'')!==url))return fail('Use HTTPS image URLs.');
  const button=$('save-product');button.disabled=true;button.textContent='Saving…';fail('');
  try{const id=editingId||crypto.randomUUID();const uploaded=[];for(const file of files)uploaded.push(await store.uploadImage(file,id));
    const p={title:String(data.get('title')).trim(),description:String(data.get('description')).trim(),category:data.get('category'),price,comparePrice,stock,sku:String(data.get('sku')).trim(),material:String(data.get('material')).trim(),dimensions:String(data.get('dimensions')).trim(),care:String(data.get('care')).trim(),visible:data.get('visible')==='on',featured:data.get('featured')==='on',archived:false,images:[...editingImages,...urls,...uploaded]};
    if(!editingId)p.createdAt=Date.now();
    await store.saveProduct(p,id);$('editor-dialog').close();toast('Product saved.');
  }catch(error){fail(store.friendlyError(error));}finally{button.disabled=false;button.textContent='Save changes →';}
}
function renderInfo(){const markup=infoMarkup(siteContent,route().id);if(!markup)return renderNotFound();$('main').innerHTML=markup;}
function renderNotFound(){$('main').innerHTML='<div class="container empty-state"><h1>This little thing wandered off.</h1><p>The product may be unpublished or the link may have changed.</p><a href="#shop" class="button">Back to the art store →</a></div>';}
function render(){
  contentEditor?.destroy();contentEditor=null;
  deliveryMap?.destroy();deliveryMap=null;stopReviews();
  const {page}=route();document.body.dataset.page=page;document.querySelectorAll('.desktop-nav>a').forEach(a=>a.toggleAttribute('aria-current',a.hash===`#${page}`));document.querySelectorAll('.desktop-nav>a[aria-current]').forEach(a=>a.setAttribute('aria-current','page'));
  document.title=`${page==='home'?'Art & little things':page==='admin'?'Studio admin':page==='checkout'?'Checkout':page==='account'?'Your account':'Art store'} · Silly Sensei`;
  if(page==='home')renderHome();else if(['shop','collection','search'].includes(page))renderShop();else if(page==='product')renderProduct();else if(page==='checkout')renderCheckout();else if(page==='admin')renderAdmin();else if(page==='account')renderAccount();else if(page==='about')$('main').innerHTML=`<div class="container"><div class="page-head">${breadcrumbs('Our story')}<h1>Little things. A lot of heart.</h1></div>${story()}</div>`;else if(page==='info')renderInfo();else renderNotFound();
  applyStoreContent(siteContent,page);decorateCartButtons();stopReviews=mountReviews();mountLogout();
}
function updateBanner(){const banner=$('connection-banner');banner.hidden=!catalogError;banner.innerHTML=catalogError?'The catalogue could not load. <button class="text-link" data-action="retry">Try again</button>':'';}
async function startCatalog(){const generation=++catalogGeneration;if(unsubscribeProducts)unsubscribeProducts();try{const stop=await store.observeProducts(isAdmin,list=>{if(generation!==catalogGeneration)return;products=list;catalogReady=true;catalogError='';reconcileCart();updateBanner();if(submitting)return;if(route().page==='checkout'&&$('checkout-form')){captureCheckout();renderCheckout();}else render();if($('cart-dialog').open)renderCart();},error=>{if(generation!==catalogGeneration)return;catalogError=store.friendlyError(error);updateBanner();render();});if(generation!==catalogGeneration)stop();else unsubscribeProducts=stop;}catch(error){if(generation!==catalogGeneration)return;catalogError=store.friendlyError(error);updateBanner();render();}}

document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;const action=target.dataset.action,id=target.dataset.id;
  try{
    if(action==='cart'){renderCart();openDialog('cart-dialog');}
    else if(action==='toggle-summary'){const collapsed=target.closest('.checkout-summary').classList.toggle('summary-collapsed');target.setAttribute('aria-expanded',String(!collapsed));target.querySelector('span').innerHTML=collapsed?'View your collection <span aria-hidden="true">⌄</span>':'Hide summary <span aria-hidden="true">⌃</span>';}
    else if(action==='close-dialog'){target.closest('dialog')?.close();}
    else if(action==='search'){openDialog('search-dialog');$('search-input').focus();renderSearch();}
    else if(action==='menu'){const menu=$('mobile-menu');menu.hidden=!menu.hidden;target.setAttribute('aria-expanded',String(!menu.hidden));}
    else if(action==='collections'){const menu=$('collection-menu');menu.hidden=!menu.hidden;target.setAttribute('aria-expanded',String(!menu.hidden));}
    else if(action==='add'){if(addToCart(id,1,false)){await animateCart(target);if(target.isConnected)openDialog('cart-dialog');}}
    else if(action==='print-label'){if(isAdmin){const request=requestList.find(o=>o.id===id);if(request)await openLabel(request,{load:store.loadLabel,save:store.saveLabel});}}
    else if(action==='add-detail'||action==='buy-now'){const quantity=Number(document.querySelector('[data-context="product"][data-quantity]')?.value||1);if(!Number.isInteger(quantity)||quantity<1)return toast('Enter a whole-number quantity.');if(addToCart(id,quantity,false)){if(action==='buy-now')location.hash='checkout';else{await animateCart(target);if(target.isConnected)openDialog('cart-dialog');}}}
    else if(action==='remove'){clearCustomization(id);cart=cart.filter(c=>c.id!==id);persistCart();renderCart();if(route().page==='checkout'){captureCheckout();renderCheckout();}}
    else if(action==='quantity'){const context=target.dataset.context;const input=target.parentElement.querySelector('input');const p=products.find(p=>p.id===id);const value=Math.max(1,Math.min(p.stock,99,Number(input.value)+Number(target.dataset.delta)));if(context==='product'){input.parentElement.outerHTML=quantityControl(id,value,p.stock,'product');}else{cart.find(c=>c.id===id).quantity=value;persistCart();renderCart();if(route().page==='checkout'){captureCheckout();renderCheckout();}}}
    else if(action==='zoom'){$('zoom-image').src=$('product-main-image').src;$('zoom-image').alt=$('product-main-image').alt;openDialog('image-dialog');}
    else if(action==='remove-product-image'){editingImages.splice(Number(target.dataset.index),1);renderSavedProductImages();}
    else if(action==='thumbnail'){const p=products.find(p=>p.id===route().id);$('product-main-image').src=safeImage(p.images[Number(target.dataset.index)]);document.querySelectorAll('.thumbs button').forEach(b=>b.classList.toggle('active',b===target));}
    else if(action==='signin'){target.disabled=true;await store.signIn();if(target.isConnected)target.disabled=false;}
    else if(action==='account-refresh'||action==='account-more'){await fetchCustomerAccount(action==='account-more');}
    else if(action==='request-customizations'){await showProductCustomizations(id);}
    else if(action==='remove-reference'){removeReference(id,target.dataset.fileId);refreshReferencePreviews(id);}
    else if(action==='signout'){await animateLogout(target);await store.signOut();location.hash='account';}
    else if(action==='admin-tab'){adminTab=target.dataset.tab;location.hash='admin/'+adminTab;}
    else if(action==='new-product')openEditor();
    else if(action==='edit-product')openEditor(id);
    else if(action==='archive-product'){await store.archiveProduct(id);$('editor-dialog').close();toast('Product archived. Edit it to publish it again.');}
    else if(action==='refresh-requests'){requestsLoaded=false;renderAdminContent();}
    else if(action==='view-requests'){adminTab='requests';requestsLoaded=false;location.hash='admin/requests';}
    else if(action==='reset-filters'){filter={sort:'featured',available:false};if(route().page==='shop')renderShop();}
    else if(action==='retry'){catalogError='';await startCatalog();}
  }catch(error){const notice=$('auth-notice')||$('product-notice');if(notice)notice.textContent=store.friendlyError(error);else toast(store.friendlyError(error));target.disabled=false;}
});
document.addEventListener('click',event=>{if(!event.target.closest('.nav-dropdown')){$('collection-menu').hidden=true;document.querySelector('[data-action="collections"]').setAttribute('aria-expanded','false');}});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('submit',event=>{if(event.target.id==='customer-profile-form')submitCustomerProfile(event);if(event.target.id==='checkout-form')submitCheckout(event);if(event.target.id==='banner-form')submitBanners(event);if(event.target.id==='product-form')submitProduct(event);if(event.target.id==='search-form'){event.preventDefault();location.hash=`search/${encodeURIComponent($('search-input').value.trim())}`;closeDialogs();}});
document.addEventListener('input',event=>{if(event.target.dataset.productNote)setProductNote(event.target.dataset.productNote,event.target.value);if(['address','city','postalCode'].includes(event.target.id))deliveryMap?.invalidate();if(event.target.id==='search-input')renderSearch();if(event.target.id==='order-note')orderNote=event.target.value;if(event.target.id==='admin-search'){adminSearch=event.target.value;renderAdminTable();}if(event.target.closest('#checkout-form'))captureCheckout();});
document.addEventListener('change',async event=>{const t=event.target;if(t.dataset.referenceFiles){try{addReferences(t.dataset.referenceFiles,t.files);refreshReferencePreviews(t.dataset.referenceFiles);}catch(error){toast(error.message);}t.value='';}if(['state','country'].includes(t.id))deliveryMap?.invalidate();
  if(t.id==='sort-filter'){filter.sort=t.value;renderProductResults();decorateCartButtons();}if(t.id==='available-filter'){filter.available=t.checked;renderProductResults();decorateCartButtons();}if(t.id==='category-filter')location.hash=t.value?`collection/${t.value}`:'shop';if(t.id==='admin-category'){adminCategory=t.value;renderAdminTable();}
  if(t.dataset.quantity){const p=products.find(p=>p.id===t.dataset.quantity);let value=Number(t.value);if(!Number.isInteger(value)||value<1)value=1;value=Math.min(value,p.stock,99);if(t.dataset.context==='product'){t.parentElement.outerHTML=quantityControl(p.id,value,p.stock,'product');}else{cart.find(c=>c.id===p.id).quantity=value;persistCart();renderCart();if(route().page==='checkout'){captureCheckout();renderCheckout();}}}
  if(t.dataset.requestStatus){t.disabled=true;try{await store.updateRequest(t.dataset.requestStatus,t.value);const request=requestList.find(o=>o.id===t.dataset.requestStatus);if(request)request.status=t.value;toast('Request status updated.');}catch(error){toast(store.friendlyError(error));renderRequests();}finally{t.disabled=false;}}
  if(t.id==='product-files'){$('editor-image-preview').replaceChildren();for(const file of [...t.files].slice(0,8)){if(!file.type.startsWith('image/'))continue;const image=document.createElement('img');const url=URL.createObjectURL(file);image.src=url;image.alt=file.name;image.onload=image.onerror=()=>URL.revokeObjectURL(url);$('editor-image-preview').append(image);}}
});
function renderSearch(){const query=$('search-input').value;const results=filterProducts(products,{search:query}).slice(0,6);$('search-results').innerHTML=query?results.length?results.map(p=>`<a class="search-result" href="#product/${e(p.id)}" data-action="close-dialog"><img src="${e(imageOf(p))}" alt=""><div>${e(p.title)}<span>${money(p.price)} · ${e(categoryOf(p.category)?.name)}</span></div></a>`).join(''):'<p class="muted" style="margin-top:25px">No little things found. Try a different search.</p>':`<p class="eyebrow" style="margin-top:25px">Explore a collection</p><div class="footer-links">${categoryLinks}</div>`;}
window.addEventListener('hashchange',()=>{if(location.hash==='#main'){return;}$('mobile-menu').hidden=true;document.querySelector('[data-action="menu"]').setAttribute('aria-expanded','false');closeDialogs();render();window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});});
window.addEventListener('storage',event=>{if(event.key===cartKey){try{const value=JSON.parse(event.newValue);cart=Array.isArray(value)?value:[];reconcileCart();updateCartBadge();if($('cart-dialog').open)renderCart();if(route().page==='checkout'){captureCheckout();renderCheckout();}}catch{}}});
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement&&!event.target.closest('.leaflet-container')&&!event.target.dataset.fallback){event.target.dataset.fallback='1';event.target.src='assets/paintings.svg';}},true);
updateCartBadge();updateBanner();render();
startCatalog();
store.observeAuth((nextUser,nextAdmin)=>{
  const changed=isAdmin!==nextAdmin,identityChanged=user?.uid!==nextUser?.uid;
  if(identityChanged){
    contentDraft=null;
    if(user&&!user.isAnonymous){checkoutDraft={};completedRequest=null;orderNote='';clearCustomizations();closeDialogs();}
    accountState={requests:[],profile:{},loaded:false,loading:false};
  }
  user=nextUser;isAdmin=nextAdmin;authLoading=false;authError='';requestList=[];requestsLoaded=false;
  if(changed)startCatalog();
  if(['account','admin'].includes(route().page)){
    if(nextAdmin&&identityChanged){location.hash=requestedAdminPage;requestedAdminPage='admin';render();}
    else if(!nextAdmin&&route().page==='admin')location.hash='account';else render();
  }
  if(identityChanged&&user&&!user.isAnonymous)fetchCustomerAccount();
}).catch(error=>{authLoading=false;authError=store.friendlyError(error);if(['account','admin'].includes(route().page))renderAccount();});
store.observeSettings(settings=>{storeSettings=settings;applyStoreBanners();if(route().page==='home')render();},error=>toast('Store banners could not load. Please try again later.')).catch(()=>{});
function refreshStoreContent(){
  contentCategories(siteContent).forEach((c,i)=>Object.assign(CATEGORIES[i],c));
  categoryLinks=CATEGORIES.map(c=>`<a href="#collection/${c.id}">${e(c.name)}</a>`).join('');
  $('collection-menu').innerHTML=categoryLinks;
  $('mobile-menu').innerHTML=`<a href="#home">Home</a><a href="#shop">Art store</a>${CATEGORIES.map(c=>`<a class="mobile-category" href="#collection/${c.id}">${e(c.name)}</a>`).join('')}<a href="#about">Our story</a><a href="#account">My account</a>`;
  $('footer').innerHTML=footerMarkup(siteContent);applyStoreContent(siteContent,route().page);
}
store.observeContent(value=>{
  siteContent=value;contentReady=true;contentError='';refreshStoreContent();
  if(contentEditor){contentEditor.updatePublished(value);return;}
  if(!submitting&&!['checkout','account'].includes(route().page))render();
},()=>{contentError='Published page content could not load. Check your connection and deploy the updated Firestore rules, then reload. Publishing is disabled until the content loads.';if(route().page==='admin'&&adminTab==='content')renderAdmin();}).catch(()=>{contentError='The page editor could not connect. Reload to try again.';if(route().page==='admin'&&adminTab==='content')renderAdmin();});

