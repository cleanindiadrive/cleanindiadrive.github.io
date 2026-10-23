import {selectedCartLines,cartIssues} from './cart-state.js';
import {invoicePDF,downloadFile} from './downloads.js?v=invoice-2026-10-21-2';
import {ORDER_STATUSES,availableStatuses,canTransition,statusHelp} from './order-workflow.js';
import {openQuoteEditor} from './quote-editor.js';
import './image-loading.js';
import {pageSkeleton,skeletonMarkup} from './skeletons.js';
import {deferPageRender} from './page-loading.js';
import {mountSalesDashboard} from './sales-dashboard.js';
import {payRequest} from './payments.js';
import {mountReviewEditor,collectReviews} from './review-editor.js';
import {MAX_CART_ITEMS,CATEGORIES,categoryOf,money,escapeHTML as e,safeImage,cartLines,subtotal,filterProducts,validateCustomer} from './commerce.js';
import * as store from './store.js';
import {mapPanel,mountDeliveryMap} from './delivery-location.js';
import {validLocation,locationLink} from './location-utils.js';
import {openLabel,mountLabelTemplate} from './labels.js';
import {decorateCartButtons,animateCart,animateCartCheckout,playPaymentOutcome,reviewSection,mountReviews} from './shop-effects.js';
import {accountMarkup} from './customer-dashboard.js';
import {steppedProgress} from './stepped-progress.js';
import {normalizeProfile,validateProfile,checkoutDefaults} from './profile.js';
import {logoutMarkup,mountLogout,animateLogout} from './logout.js';
import {DEFAULT_SETTINGS,normalizeSettings,safeStoreLink,bannerMarkup,settingsForm} from './store-settings.js';
import {DEFAULT_CONTENT,normalizeContent,contentCategories,applyStoreContent,footerMarkup} from './store-content.js';
import {homeMarkup,storyMarkup,infoMarkup,productCardMarkup} from './storefront-view.js';
import {mountContentEditor} from './content-editor.js';
import {customizationFields,setProductNote,addReferences,removeReference,refreshReferencePreviews,clearCustomization,checkoutCustomizations,clearCustomizations} from './customization.js';
let storeSettings={...DEFAULT_SETTINGS};
let settingsReady=false,settingsError='';
let siteContent=normalizeContent(DEFAULT_CONTENT),contentDraft=null,contentEditor=null,contentReady=false,contentError='';
let requestedAdminPage=location.hash.startsWith('#admin/')?location.hash.slice(1):'admin';
let deliveryMap,stopReviews=()=>{};

const $ = id => document.getElementById(id);
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('main').focus();$('main').scrollIntoView({behavior:'instant'});});
const cartKey = 'silly-shop-cart-v1';
const pendingCheckoutKey='silly-shop-pending-payment-v1';
let products = [], cart = [], user = null, isAdmin = false, catalogReady = false, catalogError = '', unsubscribeProducts, catalogGeneration = 0;
let filter = {sort:'featured',available:false}, adminTab = 'products', adminSearch = '', adminCategory = '';
let requestList = [], requestsLoaded = false, requestsError = '', editingId = null, editingImages = [];
const rememberedProducts=new Map();
let checkoutProducts=[];
let checkoutDraft = {}, checkoutId = crypto.randomUUID(), completedRequest = null, submitting = false, checkoutStep = 1, lastRenderedPage = '';
const checkoutTouched=new Set();
let checkoutStepMotionToken=0,checkoutStepAnimations=[];
let toastTimer, orderNote = '';
let authLoading=true,authError='',accountState={requests:[],profile:{},loaded:false,loading:false};
try {const saved = JSON.parse(localStorage.getItem(cartKey)); if (Array.isArray(saved)) cart = saved.filter(c=>c && typeof c.id==='string' && Number.isInteger(c.quantity) && c.quantity>0).slice(0,MAX_CART_ITEMS);} catch {}
const visible = () => products.filter(p=>p.visible && !p.archived);
const imageOf = p => safeImage(p.images?.[0],categoryOf(p.category)?.image);
const route = () => {const parts=location.hash.slice(1).split('/');return {page:parts[0] || 'home',id:parts.slice(1).join('/')};};
let categoryLinks = CATEGORIES.map(c=>`<a href="#collection/${c.id}">${e(c.name)}</a>`).join('');
$('collection-menu').innerHTML=categoryLinks;
$('mobile-menu').innerHTML=`<a href="#home">Home</a><a href="#shop">Art store</a>${CATEGORIES.map(c=>`<a class="mobile-category" href="#collection/${c.id}">${e(c.name)}</a>`).join('')}<a href="#about">Our story</a><a href="#account">My account</a>`;
$('footer').innerHTML=footerMarkup(siteContent);

function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function persistCart(){try{localStorage.setItem(cartKey,JSON.stringify(cart));}catch{toast('Your browser could not save the cart. Keep this tab open.');}updateCartBadge();}
function clearPendingCheckout(){try{localStorage.removeItem(pendingCheckoutKey);}catch{}}
function lines(){return selectedCartLines(cart,products,[...rememberedProducts.values()]);}
function paymentAnimationItems(orderItems,fallbackCart=cart){
  const fallback=fallbackCart.map(({id,quantity})=>{
    const product=checkoutProducts.find(item=>item.id===id)||products.find(item=>item.id===id)||rememberedProducts.get(id);
    return {productId:id,title:product?.title||'Item',quantity};
  });
  const source=Array.isArray(orderItems)&&orderItems.length?orderItems:fallback;
  return source.slice(0,MAX_CART_ITEMS).map(item=>{
    const savedProduct=fallback.find(candidate=>candidate.productId===item?.productId);
    return {title:String(item?.title||item?.name||savedProduct?.title||'Item'),quantity:Number.isInteger(item?.quantity)&&item.quantity>0?item.quantity:savedProduct?.quantity||1};
  });
}
function updateCartBadge(){const count=cart.reduce((n,c)=>n+c.quantity,0);$('cart-count').textContent=count;$('cart-count').hidden=!count;}
function reconcileCart(){updateCartBadge();updateCheckoutAvailability();}
function updateCheckoutAvailability(){
  if(!$('checkout-form'))return;
  const issues=cartIssues(cart,products,checkoutProducts),notice=$('checkout-availability');
  const messages=catalogError?['Availability could not refresh. Your cart and delivery details are saved. Retry before submitting.']:!catalogReady?['Checking current availability…']:issues;
  if(notice){notice.textContent=messages.join(' ');notice.hidden=!messages.length;}
  const review=$('review-checkout-cart');if(review)review.hidden=!messages.length;
  const submit=$('checkout-submit');if(submit)submit.disabled=submitting||messages.length>0;
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
  if(cart.length&&!catalogReady){$('cart-content').innerHTML=catalogError?catalogErrorMarkup():skeletonMarkup('rows','Loading your cart…');return;}
  const entries=lines();
  if(!entries.length){$('cart-content').innerHTML=`<div class="empty-state"><span class="empty-icon">♧</span><h2>Your cart is empty</h2><p>Browse the store to add a product.</p><a href="#shop" class="button" data-action="close-dialog">Continue shopping</a></div>`;return;}
  const rows=entries.map(({product:p,quantity,total})=>`<div class="cart-row"><a href="#product/${e(p.id)}" data-action="close-dialog"><img src="${e(imageOf(p))}" alt="${e(p.title)}"></a><div><h3><a href="#product/${e(p.id)}" data-action="close-dialog">${e(p.title)}</a></h3><p>${money(total)}</p><div class="cart-row-tools">${quantityControl(p.id,quantity,Math.max(quantity,p.stock))}<button class="remove-button" data-action="remove" data-id="${e(p.id)}" aria-label="Remove ${e(p.title)}">Remove</button></div>${customizationFields(p.id,true)}</div></div>`).join('');
  $('cart-content').innerHTML=`<div class="cart-checkout-flow"><div class="cart-checkout-pile"><section class="cart-checkout-card cart-checkout-current"><div class="cart-checkout-items">${rows}</div><label class="cart-note" for="order-note">A note for the studio <span class="muted">(optional)</span><textarea id="order-note" maxlength="1000" placeholder="Anything you would like us to know?">${e(orderNote)}</textarea></label><div class="cart-summary"><div class="total-row"><span>Subtotal</span><strong>${money(subtotal(entries))}</strong></div><p>Shipping will be confirmed separately.</p><p class="small muted">Up to ${MAX_CART_ITEMS} different products per checkout request.</p></div></section><section class="cart-checkout-card cart-checkout-confirmed" aria-hidden="true"><span class="cart-checkout-ready-icon" aria-hidden="true">✓</span><h2>Your cart is ready</h2><p>Continue to checkout to add your delivery details and pay securely.</p><p class="small muted">Shipping will be added when the studio confirms your final total.</p></section></div><button class="cart-checkout-button" type="button" data-action="cart-checkout"><svg class="cart-checkout-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 11.5a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.5L22 8H6"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/></svg><span class="cart-checkout-label">Checkout</span><svg class="cart-checkout-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg></button><button class="text-link full" data-action="close-dialog" style="display:block;margin:18px auto">Continue shopping</button></div>`;
}
function breadcrumbs(current,extra=''){return `<div class="breadcrumbs"><a href="#home">Home</a><span>/</span>${extra}<span>${e(current)}</span></div>`;}
function productCard(p){return productCardMarkup(p,siteContent);}
function story(){return storyMarkup();}
function renderHome(){
  if((!contentReady&&!contentError)||(!settingsReady&&!settingsError)){$('main').innerHTML=pageSkeleton('home');return;}
  $('main').innerHTML=homeMarkup(products,storeSettings,siteContent,{catalogLoading:!catalogReady&&!catalogError,catalogError});
}
function renderShop(){
  const {page,id}=route();const category=page==='collection'?categoryOf(id):null;
  if(page==='collection'&&!category)return renderNotFound();
  const search=page==='search'?decodeURIComponent(id):'';
  const title=category?.name || (page==='search'?`Search: “${search}”`:'The art store');
  $('main').innerHTML=`<div class="container"><div class="page-head">${breadcrumbs(category?.name || (search?'Search':'Art store'))}<h1>${e(title)}</h1><p>${e(category?.description) || 'Browse all products below.'}</p></div><div class="filter-bar"><div class="filters"><label class="checkbox"><input type="checkbox" id="available-filter" ${filter.available?'checked':''}>In stock only</label><label for="category-filter" class="sr-only">Collection</label><select id="category-filter"><option value="">All collections</option>${CATEGORIES.map(c=>`<option value="${c.id}" ${category?.id===c.id?'selected':''}>${e(c.name)}</option>`).join('')}</select></div><div class="sort-group"><label for="sort-filter">Sort by</label><select id="sort-filter"><option value="featured">Featured</option><option value="newest">Newest first</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="title">Alphabetically, A–Z</option></select><span id="product-count" class="muted"></span></div></div><div id="product-results"></div></div>`;
  $('sort-filter').value=filter.sort;renderProductResults();
}
function renderProductResults(){
  if(!catalogReady&&!catalogError){$('product-count').textContent='';$('product-results').innerHTML=skeletonMarkup('products','Loading products…');return;}
  const {page,id}=route(),list=filterProducts(products,{...filter,category:page==='collection'?id:'',search:page==='search'?decodeURIComponent(id):''});
  $('product-count').textContent=catalogReady?`${list.length} products`:'';
  $('product-results').innerHTML=list.length?`<div class="product-grid">${list.map(productCard).join('')}</div>`:catalogError?catalogErrorMarkup():`<div class="empty-state"><h2>Nothing here just yet.</h2><p>Try another collection or clear your filters.</p><a class="button outline" href="#shop" data-action="reset-filters">View all products</a></div>`;
}
function catalogErrorMarkup(){return '<div class="empty-state" role="alert"><h2>The catalogue could not load</h2><p>Check your connection and try again.</p><button class="button outline" data-action="retry">Try again</button></div>';}
function renderProduct(){
  const p=visible().find(p=>p.id===route().id);if(!p){if(catalogError){$('main').innerHTML=`<div class="container">${catalogErrorMarkup()}</div>`;return;}if(!catalogReady){$('main').innerHTML=pageSkeleton('product');return;}return renderNotFound();}
  $('main').innerHTML=`<div class="container"><div class="page-head">${breadcrumbs(p.title,`<a href="#collection/${p.category}">${e(categoryOf(p.category)?.name)}</a><span>/</span>`)}</div><section class="product-layout"><div><button class="product-main-image" data-action="zoom" aria-label="Zoom ${e(p.title)} image"><img id="product-main-image" src="${e(imageOf(p))}" alt="${e(p.title)}"></button>${p.images.length>1?`<div class="thumbs">${p.images.map((img,i)=>`<button data-action="thumbnail" data-index="${i}" class="${i===0?'active':''}" aria-label="View image ${i+1}"><img src="${e(safeImage(img))}" alt="${e(p.title)} — image ${i+1}"></button>`).join('')}</div>`:''}</div><div class="product-detail"><p class="eyebrow">Silly Sensei · ${e(categoryOf(p.category)?.name)}</p><h1>${e(p.title)}</h1><p class="price">${money(p.price)}${p.comparePrice>p.price?`<del>${money(p.comparePrice)}</del>`:''}</p><p class="small muted"><a class="text-link" href="#info/shipping">Shipping</a> confirmed separately.</p><p class="stock-status ${!p.stock?'sold':''}">${p.stock?p.stock===1?'One of a kind · 1 available':`${p.stock} available`:'Currently sold out'}</p>${p.stock?`<p class="quantity-label">Quantity</p>${quantityControl(p.id,1,p.stock,'product')}`:''}${p.stock?customizationFields(p.id):''}<div class="buy-actions"><button class="button outline full" data-action="add-detail" data-id="${e(p.id)}" ${!p.stock?'disabled':''}>${p.stock?'Add to cart':'Sold out'}</button><button class="button full" data-action="buy-now" data-id="${e(p.id)}" ${!p.stock?'disabled':''}>Buy it now <span>→</span></button></div><p class="description">${e(p.description)}</p><details open><summary>Product details</summary><p>${p.material?`Material: ${e(p.material)}<br>`:''}${p.dimensions?`Size: ${e(p.dimensions)}<br>`:''}${p.sku?`SKU: ${e(p.sku)}`:'More product details will be added here.'}</p></details><details><summary>Delivery & care</summary><p>Delivery arrangements and shipping costs will be confirmed after your checkout request. ${e(p.care || 'Handle with care and keep in a dry place.')}</p></details></div></section><section class="related"><div class="section-heading"><h2>You may also like</h2><a href="#shop" class="text-link">View all →</a></div><div class="product-grid">${visible().filter(item=>item.id!==p.id).slice(0,3).map(productCard).join('')}</div></section></div>`;
}
const states=['Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];
function field(name,label,options={}){return `<label class="field ${options.wide?'wide':''}" for="${name}">${label}<input id="${name}" name="${name}" type="${options.type||'text'}" ${options.optional?'':'required'} maxlength="${options.max||100}" ${options.auto?`autocomplete="${options.auto}"`:''} ${options.pattern?`pattern="${options.pattern}"`:''} ${options.mode?`inputmode="${options.mode}"`:''} value="${e(checkoutDraft[name]||'')}" placeholder="${e(options.placeholder||label)}"></label>`;}
function checkoutProgress(step){
  const labels=['Contact','Delivery','Review','Complete'];
  return `<div id="checkout-progress">${steppedProgress(labels,step,'Checkout progress')}</div>`;
}
function updateCheckoutProgress(step){
  const progress=$('checkout-progress')?.querySelector('.checkout-progress');if(!progress)return;
  const items=[...progress.querySelectorAll('li')],current=Math.max(1,Math.min(items.length,Number(step)||1));
  const fill=progress.querySelector('.checkout-progress-line span');
  if(fill)fill.style.width=`${items.length>1?(current-1)/(items.length-1)*100:0}%`;
  const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches,changedMarkers=[];
  items.forEach((item,index)=>{
    const number=index+1,complete=number<current,active=number===current,marker=item.querySelector('.checkout-step-marker');
    item.classList.toggle('is-complete',complete);item.classList.toggle('is-active',active);
    if(active)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    if(marker&&marker.classList.contains('is-check')!==complete){
      marker.classList.remove('is-glyph-transitioning');
      marker.classList.toggle('is-check',complete);
      marker.innerHTML=complete?'<span class="checkout-step-glyph"><svg class="checkout-step-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 4 4L16 6.5"></path></svg></span>':`<span class="checkout-step-glyph">${number}</span>`;
      if(animate)changedMarkers.push(marker);
    }
  });
  clearTimeout(updateCheckoutProgress.timer);
  if(animate&&changedMarkers.length){void progress.offsetWidth;changedMarkers.forEach(marker=>marker.classList.add('is-glyph-transitioning'));updateCheckoutProgress.timer=setTimeout(()=>changedMarkers.forEach(marker=>marker.classList.remove('is-glyph-transitioning')),850);}
}
function cancelCheckoutStepMotion(form){
  checkoutStepMotionToken++;
  checkoutStepAnimations.forEach(animation=>animation.cancel());checkoutStepAnimations=[];
  const stage=form.querySelector('.checkout-step-stage');
  if(stage){stage.style.height='';stage.style.overflow='';}
  form.querySelectorAll('[data-checkout-step]').forEach(page=>{page.style.zIndex='';});
  form.classList.remove('is-step-transitioning');
}
function checkoutProfileDefaults(profile=accountState.profile){
  return checkoutDefaults(profile,user,accountState.requests);
}
function applyCheckoutProfile(profile=accountState.profile){
  const form=$('checkout-form');if(!form||!user||user.isAnonymous)return;
  const defaults=checkoutProfileDefaults(profile);
  for(const key of ['email','firstName','lastName','phone','address','apartment','city','state','postalCode']){
    const input=form.elements.namedItem(key);
    if(input&&!checkoutTouched.has(key)&&!String(input.value||'').trim()&&defaults[key])input.value=defaults[key];
  }
  if(!checkoutDraft.location&&!checkoutTouched.has('location')&&validLocation(defaults.location)){
    checkoutDraft.location={...defaults.location};
    deliveryMap?.setSavedLocation(checkoutDraft.location);
  }
  captureCheckout();
  if(checkoutStep===3)renderCheckoutReview();
}
function renderCheckout(){
  if(deferPageRender(render))return;
  if(user&&!user.isAnonymous){
    const defaults=checkoutProfileDefaults();
    for(const key of ['email','firstName','lastName','phone','address','apartment','city','state','postalCode'])if(checkoutDraft[key]===undefined&&!checkoutTouched.has(key)&&defaults[key])checkoutDraft[key]=defaults[key];
    if(!checkoutDraft.location&&!checkoutTouched.has('location')&&validLocation(defaults.location))checkoutDraft.location={...defaults.location};
  }
  deliveryMap?.destroy();deliveryMap=null;
  if(completedRequest)return renderSuccess();
  if(authLoading||(cart.length&&!catalogReady&&!catalogError)){$('main').innerHTML=pageSkeleton('checkout');return;}
  if(cart.length&&!catalogReady&&catalogError){$('main').innerHTML=`<div class="container">${catalogErrorMarkup()}</div>`;return;}
  const entries=lines();checkoutProducts=entries.map(l=>({...l.product}));if(!entries.length){$('main').innerHTML=`<div class="container empty-state"><h1>Your cart is empty</h1><p>Add a product before checking out.</p><a class="button" href="#shop">Explore the collection →</a></div>`;return;}
  if(!user||user.isAnonymous){
    $('main').innerHTML=`<div class="container"><div class="page-head">${breadcrumbs('Checkout','<a href="#shop">Art store</a><span>/</span>')}<h1>Sign in to check out</h1><p>Your cart is saved. Sign in with Google before entering delivery details or paying.</p></div><section class="checkout-info"><strong>Sign-in is required</strong><p>After signing in, you can continue checkout and track your request from your account.</p>${authLoading?'<p role="status">Checking your sign-in…</p>':'<button type="button" class="button" data-action="signin">Continue with Google</button>'}</section><p style="margin-top:20px"><a class="text-link" href="#shop">← Back to shopping</a></p></div>`;
    return;
  }
  $('main').innerHTML=`<div class="checkout-wrap"><div class="page-head">${breadcrumbs('Checkout','<a href="#shop">Art store</a><span>/</span>')}<h1>Checkout</h1><p>Pay the product subtotal securely now. The studio will confirm shipping and bill it separately.</p></div><div class="checkout-layout"><form id="checkout-form" class="checkout-form" novalidate>${!user||user.isAnonymous?'<div class="checkout-info"><strong>Keep this request in your account</strong><p>Sign in with Google before saving so you can track status, cancel and save your address.</p><button type="button" class="button outline small" data-action="signin">Continue with Google</button></div>':''}${checkoutProgress(checkoutStep)}<div class="checkout-step-stage"><section class="checkout-step" data-checkout-step="1" aria-labelledby="checkout-contact-heading"><h2 id="checkout-contact-heading" tabindex="-1">Contact</h2><p class="small muted">Where the studio can reach you about this request.</p><div class="form-grid">${field('email','Email address',{type:'email',auto:'email',wide:true,max:254})}${field('phone','Mobile number',{type:'tel',auto:'tel',wide:true,max:16,placeholder:'+91 98765 43210'})}${field('firstName','First name',{auto:'given-name'})}${field('lastName','Last name',{auto:'family-name'})}</div></section><section class="checkout-step" data-checkout-step="2" aria-labelledby="checkout-delivery-heading"><h2 id="checkout-delivery-heading" tabindex="-1">Delivery address</h2><p class="small muted">Add your full address and confirm the pin on the map.</p><div class="form-grid"><label class="field wide" for="country">Country / region<select id="country" name="country" autocomplete="country-name"><option>India</option></select></label>${field('address','Address',{auto:'address-line1',wide:true,max:300})}${field('apartment','Apartment, suite, etc. (optional)',{auto:'address-line2',optional:true,wide:true,max:150})}${field('city','City',{auto:'address-level2'})}<label class="field" for="state">State<select id="state" name="state" autocomplete="address-level1" required><option value="">Select state</option>${states.map(s=>`<option ${checkoutDraft.state===s?'selected':''}>${s}</option>`).join('')}</select></label>${field('postalCode','PIN code',{auto:'postal-code',pattern:'[1-9][0-9]{5}',mode:'numeric',max:6})}<label class="field wide" for="checkout-notes">A note for the studio (optional)<textarea id="checkout-notes" name="notes" maxlength="1000" placeholder="Add delivery instructions or a gift note…">${e(checkoutDraft.notes??orderNote)}</textarea></label></div>${mapPanel(checkoutDraft.location)}</section><section class="checkout-step" data-checkout-step="3" aria-labelledby="checkout-review-heading"><h2 id="checkout-review-heading" tabindex="-1">Review your request</h2><div id="checkout-review" class="checkout-review"></div><div class="checkout-info"><strong>Product subtotal due now: ${money(subtotal(entries))}</strong><p>Shipping is not included. The studio will confirm the delivery charge and collect it separately later.</p></div><label class="checkbox"><input name="consent" type="checkbox" required ${checkoutDraft.consent?'checked':''}><span>I agree to share these details with Silly Sensei for this checkout request. <a href="#info/privacy" class="text-link">Privacy information</a></span></label></section></div><div class="checkout-step-actions"><button id="checkout-prev" type="button" class="button outline" data-action="checkout-previous" hidden>← Back</button><button id="checkout-next" type="button" class="button" data-action="checkout-next">Continue →</button><button id="checkout-submit" type="submit" class="pos-transaction-container" hidden aria-label="Pay ${money(subtotal(entries))} for the product subtotal"><span class="left-side" aria-hidden="true"><span class="card"><span class="card-line"></span><span class="buttons"></span></span><span class="post"><span class="post-line"></span><span class="screen"><span class="dollar">₹</span></span><span class="numbers"></span><span class="numbers-line2"></span></span></span><span class="right-side"><span class="new">Pay ${money(subtotal(entries))}</span><svg viewBox="0 0 451.846 451.847" class="arrow" aria-hidden="true"><path d="M345.441 248.292L151.154 442.573c-12.359 12.365-32.397 12.365-44.75 0-12.354-12.354-12.354-32.391 0-44.744L278.318 225.92 106.409 54.017c-12.354-12.359-12.354-32.394 0-44.748 12.354-12.359 32.391-12.359 44.75 0l194.287 194.284c6.177 6.18 9.262 14.271 9.262 22.366 0 8.099-3.091 16.196-9.267 22.373z"/></svg></span></button></div><p id="checkout-availability" class="notice" role="alert" hidden></p><button id="review-checkout-cart" type="button" class="text-link" data-action="review-checkout-cart" hidden>Review updated cart</button><p id="checkout-notice" class="notice" role="alert"></p><a href="#shop" class="text-link">← Back to shopping</a></form><aside class="checkout-summary summary-collapsed" aria-labelledby="summary-title"><button type="button" class="summary-toggle" data-action="toggle-summary" aria-expanded="false" aria-controls="checkout-summary-content"><span>View order summary <span aria-hidden="true">⌄</span></span><strong>${money(subtotal(entries))}</strong></button><div id="checkout-summary-content"><div class="section-heading" style="margin:0 0 25px"><h2 id="summary-title">Order summary</h2><button class="text-link" data-action="cart">Edit</button></div>${entries.map(({product:p,quantity,total})=>`<div class="checkout-item"><div class="checkout-item-image"><img src="${e(imageOf(p))}" alt="${e(p.title)}"><span>${quantity}</span></div><div>${e(p.title)}<small>${e(categoryOf(p.category)?.name)}</small></div><span>${money(total)}</span></div>`).join('')}<hr><div class="total-row"><span>Subtotal · ${entries.reduce((n,l)=>n+l.quantity,0)} ${entries.reduce((n,l)=>n+l.quantity,0)===1?'item':'items'}</span><span>${money(subtotal(entries))}</span></div><div class="total-row"><span>Shipping</span><span class="small muted">To be confirmed</span></div><div class="total-row grand"><span>Estimated subtotal</span><span>${money(subtotal(entries))}</span></div><p class="small muted">INR · Product subtotal due now; shipping is billed separately after confirmation.</p><div class="checkout-info"><strong>Pay securely</strong><p>Your information helps us prepare your request. We won’t ask for card details on this page.</p></div></div></aside></div></div>`;
  mountCheckoutMap();
  applyCheckoutProfile();
  if(user&&!user.isAnonymous&&(!accountState.loaded||accountState.error||accountState.profileError)&&!accountState.loading)void fetchCustomerAccount();
  setCheckoutStep(checkoutStep,{focus:false});
}
function setCheckoutStep(step,{focus=true}={}){
  const previousStep=checkoutStep,nextStep=Math.max(1,Math.min(3,step));
  const form=$('checkout-form');if(!form)return;
  captureCheckout();
  const pages=[...form.querySelectorAll('[data-checkout-step]')],from=pages.find(page=>!page.hidden&&Number(page.dataset.checkoutStep)===previousStep)||pages.find(page=>!page.hidden),to=pages.find(page=>Number(page.dataset.checkoutStep)===nextStep);
  cancelCheckoutStepMotion(form);checkoutStep=nextStep;updateCheckoutProgress(checkoutStep);
  const stage=form.querySelector('.checkout-step-stage'),canAnimate=previousStep!==nextStep&&from&&to&&stage&&typeof from.animate==='function'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(canAnimate){
    pages.forEach(page=>{page.hidden=page!==from&&page!==to;});to.hidden=false;
    from.style.zIndex='1';to.style.zIndex='2';
    stage.style.overflow='hidden';const startHeight=from.getBoundingClientRect().height;stage.style.height=`${startHeight}px`;const endHeight=to.getBoundingClientRect().height;
    form.classList.add('is-step-transitioning');const forward=nextStep>previousStep;
    const leave=from.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${forward?-22:22}px)`}],{duration:500,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});
    const enter=to.animate([{opacity:0,transform:`translateX(${forward?24:-24}px)`},{opacity:1,transform:'translateX(0)'}],{duration:660,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
    const resize=stage.animate([{height:`${startHeight}px`},{height:`${endHeight}px`}],{duration:660,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
    checkoutStepAnimations=[leave,enter,resize];const token=checkoutStepMotionToken;
    Promise.all(checkoutStepAnimations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{
      if(token!==checkoutStepMotionToken)return;
      from.hidden=true;checkoutStepAnimations.forEach(animation=>animation.cancel());checkoutStepAnimations=[];
      stage.style.height='';stage.style.overflow='';form.classList.remove('is-step-transitioning');
    });
  }else pages.forEach(page=>{page.hidden=Number(page.dataset.checkoutStep)!==checkoutStep;});
  const previous=$('checkout-prev'),next=$('checkout-next'),submit=$('checkout-submit');
  previous.hidden=checkoutStep===1;next.hidden=checkoutStep===3;submit.hidden=checkoutStep!==3;
  if(checkoutStep===3)renderCheckoutReview();
  updateCheckoutAvailability();
  if(focus)form.querySelector(`[data-checkout-step="${checkoutStep}"] h2`)?.focus({preventScroll:false});
}
function renderCheckoutReview(){
  const review=$('checkout-review');if(!review)return;
  const value=id=>$(id)?.value?.trim()||'';
  const name=[value('firstName'),value('lastName')].filter(Boolean).join(' ');
  const address=[value('address'),value('apartment'),value('city'),value('state'),value('postalCode'),value('country')].filter(Boolean).join(', ');
  review.innerHTML=`<div><span>Contact</span><strong>${e(name)}</strong><small>${e(value('email'))} · ${e(value('phone'))}</small></div><div><span>Deliver to</span><strong>${e(address)}</strong></div><div><span>Delivery pin</span><strong>${checkoutDraft.location?'Confirmed':'Needs confirmation'}</strong></div>`;
}
function checkoutStepValid(){
  const form=$('checkout-form'),page=form?.querySelector(`[data-checkout-step="${checkoutStep}"]`);if(!page)return false;
  if(checkoutStep===1){
    const phone=$('phone');
    for(const control of page.querySelectorAll('input,select,textarea'))if(control!==phone&&!control.checkValidity()){control.reportValidity();return false;}
    phone.setCustomValidity(/^(?:\+91[ -]?)?[6-9]\d{9}$/.test(phone.value.replace(/\s/g,''))?'':'Enter a valid 10-digit Indian mobile number.');
    if(!phone.reportValidity())return false;
  }else if(checkoutStep===2){
    for(const control of page.querySelectorAll('input,select,textarea'))if(!control.checkValidity()){control.reportValidity();return false;}
    captureCheckout();
    if(deliveryMap?.needsConfirmation()){$('checkout-notice').textContent='Choose and confirm your delivery pin on the map before continuing.';deliveryMap.focus();return false;}
  }
  $('checkout-notice').textContent='';captureCheckout();return true;
}
function mountCheckoutMap(){
  deliveryMap=mountDeliveryMap(document.querySelector('.delivery-pin'),{
    initial:checkoutDraft.location,
    getAddress:()=>{captureCheckout();return checkoutDraft;},
    onChange:point=>{checkoutTouched.add('location');if(point)checkoutDraft.location=point;else delete checkoutDraft.location;},
    onAddress:address=>{for(const key of ['address','city','state','postalCode']){if(!address[key]||!$(key))continue;if(key==='state'&&!states.includes(address[key]))continue;$(key).value=address[key];checkoutTouched.add(key);}captureCheckout();},
  });
  updateCheckoutAvailability();
}

function captureCheckout(){const form=$('checkout-form');if(!form)return;const data=new FormData(form);const point=checkoutDraft.location;checkoutDraft=Object.fromEntries(data);if(point)checkoutDraft.location=point;checkoutDraft.consent=data.get('consent')==='on';}
async function checkoutFingerprint(customer){const value=JSON.stringify({uid:user.uid,customer,cart:cart.map(item=>({id:item.id,quantity:item.quantity})).sort((a,b)=>a.id.localeCompare(b.id))});const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function renderSuccess(){$('main').innerHTML=`<div class="container"><section class="success-card">${checkoutProgress(4)}<span class="success-icon">✓</span><p class="eyebrow">Payment verified</p><h1>Thanks, ${e(completedRequest.customer.firstName)}.</h1><p>Your product subtotal payment is confirmed.</p><p>Reference: <strong>${e(completedRequest.id.slice(0,8).toUpperCase())}</strong></p><div class="checkout-info"><strong>Items paid: ${money(completedRequest.quote.amount/100)}</strong><p>Shipping will be confirmed by the studio and collected as a separate payment.</p></div><section id="save-address-prompt" class="save-address-prompt"><h2>Save this address for next time?</h2><p>Your delivery details stay with this request either way.</p><div class="save-address-actions"><button class="button" data-action="save-checkout-address">${user&&!user.isAnonymous?'Save address':'Sign in & save address'}</button><button class="text-link" data-action="skip-save-address">Not now</button></div><p class="notice" role="status"></p></section><a class="button" href="#shop">Keep exploring →</a><p style="margin-top:20px"><a href="#account/requests" class="text-link">My checkout requests →</a></p></section></div>`;}
function showPaymentPreviewChoice(){
  let dialog=$('payment-preview-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='payment-preview-dialog';dialog.className='checkout-payment-dialog';
    dialog.setAttribute('aria-labelledby','payment-preview-title');
    dialog.innerHTML='<p class="eyebrow">Payment preview</p><h2 id="payment-preview-title">Choose a result</h2><p>This is a simulation only. It will not contact Razorpay, create an order, or change stock.</p><div class="checkout-payment-dialog-actions"><button type="button" class="button" data-action="preview-payment-outcome" data-outcome="success">Preview successful payment</button><button type="button" class="button outline" data-action="preview-payment-outcome" data-outcome="failure">Preview failed payment</button><button type="button" class="text-link" data-action="cancel-payment-preview">Cancel</button></div>';
    document.body.append(dialog);
  }
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  dialog.querySelector('[data-outcome="success"]')?.focus();
}
async function waitForCheckoutButtonAnimation(button){
  const pause=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
  if(typeof button.getAnimations!=='function'||typeof window.requestAnimationFrame!=='function'){await pause(1800);return;}
  await new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve)));
  const animations=button.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'||animation.playState==='pending');
  if(animations.length){await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));return;}
  if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)await pause(1800);
}
async function submitCheckout(event){
  event.preventDefault();if(submitting)return;
  if(checkoutStep<3){if(checkoutStepValid())setCheckoutStep(checkoutStep+1);return;}
  captureCheckout();updateCheckoutAvailability();
  if(!catalogReady||catalogError||cartIssues(cart,products,checkoutProducts).length)return;
  if(!user||user.isAnonymous){$('checkout-notice').textContent='Sign in with Google above to save and pay for your request.';return;}
  if(deliveryMap?.needsConfirmation()){$('checkout-notice').textContent='Choose and confirm your delivery pin on the map before paying.';setCheckoutStep(2);deliveryMap.focus();return;}
  const customer=Object.fromEntries(Object.entries(checkoutDraft).map(([k,v])=>[k,typeof v==='string'?v.trim():v]));
  const error=validateCustomer(customer);if(error){$('checkout-notice').textContent=error;if(!customer.consent)$('checkout-form').elements.consent.focus();return;}
  // Snapshot names and quantities before payment reserves stock and live catalogue updates can hide cart lines.
  const cartSnapshot=cart.map(item=>({...item}));
  const animationItems=paymentAnimationItems(null,cartSnapshot);
  submitting=true;const button=$('checkout-submit');button.disabled=true;button.setAttribute('aria-busy','true');button.classList.add('is-animating');$('checkout-notice').textContent='';
  await waitForCheckoutButtonAnimation(button);
  button.classList.remove('is-animating');button.removeAttribute('aria-busy');
  try{
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)||await store.paymentPreviewEnabled()){
      showPaymentPreviewChoice();
      return;
    }
    const fingerprint=await checkoutFingerprint(customer);let pending=null;
    try{pending=JSON.parse(localStorage.getItem(pendingCheckoutKey)||'null');}catch{}
    if(pending?.uid===user.uid){
      let oldRequest=accountState.requests.find(request=>request.id===pending.id);
      if(!oldRequest){const history=await store.loadCustomerRequests();oldRequest=history.requests.find(request=>request.id===pending.id);}
      if(['cancelled','closed'].includes(oldRequest?.status)||(oldRequest?.paymentStatus==='captured'&&oldRequest.status!=='cancel_requested')){clearPendingCheckout();pending=null;checkoutId=crypto.randomUUID();}
      else if(pending.fingerprint!==fingerprint)throw new Error('An unpaid checkout already exists for this account. Finish or cancel it under My account before starting a different checkout.');
      else checkoutId=pending.id;
    }
    let saved=await store.saveCheckout(checkoutId,customer,cart,checkoutProducts,checkoutCustomizations(cart),true);
    if(saved.status==='cancelled'){
      clearPendingCheckout();checkoutId=crypto.randomUUID();
      saved=await store.saveCheckout(checkoutId,customer,cart,checkoutProducts,checkoutCustomizations(cart),true);
    }
    if(['cancel_requested','closed'].includes(saved.status))throw new Error('This checkout has a pending cancellation. Wait for the studio to release it before starting another order.');
    if(saved.paymentStatus==='captured'){
      clearPendingCheckout();completedRequest=saved;deliveryMap?.destroy();deliveryMap=null;await playPaymentOutcome('success',{items:animationItems});
      cart=[];persistCart();clearCustomizations();checkoutDraft={};checkoutTouched.clear();orderNote='';checkoutId=crypto.randomUUID();renderSuccess();window.scrollTo({top:0,behavior:'smooth'});$('main').focus({preventScroll:true});return;
    }
    try{localStorage.setItem(pendingCheckoutKey,JSON.stringify({id:saved.id,uid:user.uid,fingerprint}));}catch{}
    completedRequest=saved;requestsLoaded=false;accountState.loaded=false;
    try{
      await payRequest(saved.id,'items');
    }catch(paymentError){
      deliveryMap?.destroy();deliveryMap=null;
      await playPaymentOutcome('failure',{message:store.friendlyError(paymentError),items:animationItems});
      return;
    }
    deliveryMap?.destroy();deliveryMap=null;
    await playPaymentOutcome('success',{items:animationItems});
    clearPendingCheckout();cart=[];persistCart();clearCustomizations();checkoutDraft={};checkoutTouched.clear();orderNote='';checkoutId=crypto.randomUUID();
    if(route().page==='checkout'){renderSuccess();window.scrollTo({top:0,behavior:'smooth'});$('main').focus({preventScroll:true});}
    else{render();toast('Payment verified. Thank you!');}
  }catch(error){
    if($('checkout-notice'))$('checkout-notice').textContent=store.friendlyError(error);else toast(store.friendlyError(error));
  }finally{
    submitting=false;
    $('checkout-submit')?.removeAttribute('aria-busy');
    $('checkout-submit')?.classList.remove('is-paying');
    updateCheckoutAvailability();
  }
}
function renderAccount(){
  if(deferPageRender(render))return;
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
  if(route().page==='checkout'&&$('checkout-form')&&!submitting)applyCheckoutProfile(accountState.profile);
}
async function submitCustomerProfile(event){
  event.preventDefault();const form=event.target,button=form.querySelector('[type="submit"]'),notice=$('profile-notice');
  const profile=normalizeProfile({...accountState.profile,...Object.fromEntries(new FormData(form))}),error=validateProfile(profile);
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
  value.reviewsVisible=data.get('reviewsVisible')==='on';
  try{value.reviewImages=collectReviews(form);}catch(error){notice.textContent=error.message;return;}
  if(value.reviewsVisible&&!value.reviewImages.length){notice.textContent='Add at least one review image or hide this section.';return;}
  if(['announcementLink','bannerLink'].some(key=>safeStoreLink(value[key])!==value[key])){notice.textContent='Use a store link such as #shop or a valid HTTPS URL.';return;}
  button.disabled=true;notice.classList.remove('is-success');notice.textContent='Saving banners…';
  try{
    const file=data.get('bannerFile');
    if(file?.size)value.bannerImage=await store.uploadImage(file,'store-banner');
    else if(value.bannerImage&&safeImage(value.bannerImage,'')!==value.bannerImage)throw new Error('Use an HTTPS image URL or choose an image file.');
    await store.saveSettings(normalizeSettings(value));storeSettings=normalizeSettings(value);
    notice.classList.add('is-success');notice.textContent='Banners saved. Your visibility settings are live in this store.';
    $('banner-preview').innerHTML=bannerMarkup({...storeSettings,bannerVisible:true});
  }catch(error){notice.textContent=store.friendlyError(error);}finally{button.disabled=false;}
}
async function showProductCustomizations(id){
  if(!user||user.isAnonymous)return;
  const target=$(`request-custom-${id}`),request=(isAdmin&&route().page==='admin'?requestList:accountState.requests).find(o=>o.id===id);if(!target||!request)return;
  target.innerHTML=skeletonMarkup('rows','Loading product notes…');
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
  if(authLoading){$('main').innerHTML=pageSkeleton('admin');return;}
  if(!isAdmin){renderAccount();return;}
  if(['sales','products','collections','requests','settings','content','labels','contact','shipping','refunds','privacy','terms'].includes(route().id))adminTab=route().id;
  contentEditor?.destroy();contentEditor=null;
  $('main').innerHTML=`<div class="wide-container admin-layout"><aside class="admin-sidebar"><p class="eyebrow">The studio / Admin</p><nav class="admin-nav" aria-label="Studio navigation">${[['sales','Sales & revenue'],['products','Products'],['collections','Collections'],['requests','Orders & requests'],['content','Storefront editor'],['settings','Banners & reviews'],['labels','Label template'],['contact','Contact page'],['shipping','Shipping policy'],['refunds','Cancellation & returns'],['privacy','Privacy policy'],['terms','Terms of service']].map(([id,label])=>`<button class="admin-tab ${adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}">${label}</button>`).join('')}</nav><div class="admin-account-actions"><a class="admin-tab" href="#home">View store ↗</a>${logoutMarkup()}<p class="small muted">${e(user?.displayName || 'Administrator')}</p></div></aside><section class="admin-main" id="admin-content"></section></div>`;renderAdminContent();mountLogout();
}
function renderAdminContent(){
  if(deferPageRender(render))return;
  if(!$('admin-content')){render();return;}
  if(adminTab==='sales'){mountSalesDashboard($('admin-content'),{load:store.loadSales});
  }else if(adminTab==='labels'){mountLabelTemplate($('admin-content'),{load:store.loadLabel,save:store.saveLabel});
  }else if(adminTab==='products'){
    if(!catalogReady){$('admin-content').innerHTML=`<div class="admin-title"><h1>Your products</h1></div>${catalogError?catalogErrorMarkup():skeletonMarkup('table','Loading products…')}`;return;}
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Your products</h1><p>Manage your products, prices and stock.</p></div><button class="button" data-action="new-product">+ Add product</button></div><div class="stats-grid"><div class="stat"><span>Total products</span><strong>${products.length}</strong></div><div class="stat"><span>Published</span><strong>${products.filter(p=>p.visible).length}</strong></div><div class="stat"><span>Out of stock</span><strong>${products.filter(p=>!p.stock).length}</strong></div></div><div class="admin-filters"><input id="admin-search" aria-label="Search admin products" placeholder="Search products…" value="${e(adminSearch)}"><select id="admin-category" aria-label="Filter admin collection"><option value="">All collections</option>${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===adminCategory?'selected':''}>${e(c.name)}</option>`).join('')}</select></div><div id="admin-product-table"></div>`;renderAdminTable();
  }else if(adminTab==='collections'){
    if(!catalogReady){$('admin-content').innerHTML=catalogError?catalogErrorMarkup():skeletonMarkup('collections','Loading collections…');return;}
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Your collections</h1><p>Assign a collection when editing a product.</p></div></div><div class="admin-category-grid">${CATEGORIES.map(c=>`<article><img src="${e(c.image)}" alt="${e(c.name)}"><h2>${e(c.name)}</h2><p>${products.filter(p=>p.category===c.id).length} products · <a href="#collection/${c.id}" class="text-link">View collection →</a></p></article>`).join('')}</div>`;
  }else if(adminTab==='requests'){
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Orders & requests</h1><p>Review requests, confirm totals and manage fulfilment. Payment status comes from verified gateway records.</p></div><button class="button outline small" data-action="refresh-requests">Refresh</button></div><div id="requests-list">${requestsLoaded?'':skeletonMarkup('rows','Loading requests…')}</div>`;
    if(requestsLoaded)renderRequests();else fetchRequests();
  }else if(['content','contact','shipping','refunds','privacy','terms'].includes(adminTab)){
    if(!contentReady&&!contentError){$('admin-content').innerHTML=skeletonMarkup('editor','Loading your published pages…');return;}
    contentEditor=mountContentEditor($('admin-content'),siteContent,{pageOnly:adminTab==='content'?'':adminTab,
      draft:contentDraft,loadError:contentError,products:()=>products,settings:()=>storeSettings,header:()=>document.querySelector('.site-header').outerHTML,
      onDraft:value=>{contentDraft=value;},
      onUpload:file=>store.uploadImage(file,'store-content'),
      onPublish:async value=>{if(!isAdmin)throw new Error('Sign in with an administrator account to publish.');try{await store.saveContent(value);}catch(error){throw new Error(store.friendlyError(error));}siteContent=normalizeContent(value);refreshStoreContent();}
    });
  }else{
    if(!settingsReady){$('admin-content').innerHTML=settingsError?`<p class="notice" role="alert">${e(settingsError)}</p>`:skeletonMarkup('form','Loading store settings…');return;}
    $('admin-content').innerHTML=`<div class="admin-title"><div><h1>Store settings</h1><p>Make the storefront your own.</p></div></div>${settingsForm(storeSettings)}`;mountReviewEditor($('admin-content'),storeSettings.reviewImages);
  }
}
function renderAdminTable(){const list=products.filter(p=>(!adminCategory||p.category===adminCategory)&&`${p.title} ${p.sku}`.toLowerCase().includes(adminSearch.toLowerCase()));$('admin-product-table').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th>Price</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><div class="table-product"><img src="${e(imageOf(p))}" alt=""><span>${e(p.title)}${p.featured?' <span title="Featured">✳</span>':''}<small>${e(categoryOf(p.category)?.name)}</small></span></div></td><td><span class="status-pill ${p.visible?'':'draft'}">${p.archived?'Archived':p.visible?'Published':'Draft'}</span></td><td>${p.stock} in stock</td><td>${money(p.price)}</td><td><button class="table-action" data-action="edit-product" data-id="${e(p.id)}" aria-label="Edit ${e(p.title)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><h2>No products yet.</h2><p>Add a product or change your search.</p></div>';}
async function fetchRequests(){try{requestList=await store.loadRequests();requestsError='';}catch(error){requestsError=store.friendlyError(error);}requestsLoaded=true;if($('requests-list'))renderRequests();}
function manualPaymentControls(o){
  const manual=o.paymentMethod==='manual',captured=o.paymentStatus==='captured',refunded=o.paymentStatus==='refunded';
  const canPaid=o.status==='contacted'&&!!o.quote&&o.inventoryReserved&&!['pending','captured','refunded'].includes(o.paymentStatus)&&!o.razorpayOrderId;
  const canUnpaid=manual&&captured&&['contacted','processing'].includes(o.status);
  const help=canPaid?'Only record money already received.':o.paymentStatus==='pending'?'A Razorpay payment is pending; verify its result before recording an offline payment.':!o.quote||!o.inventoryReserved?'Confirm the total and reserve stock first.':o.status!=='contacted'?'This request must be contacted before payment can be recorded.': 'Payment status is controlled by the verified Razorpay record.';
  let controls='';
  if(manual&&captured&&o.status==='cancelled'&&o.refundStatus==='required')controls='<button class="button outline small" data-action="manual-refund" data-id="'+e(o.id)+'">Mark offline refund complete</button><p class="small muted">Return the funds first.</p>';
  else if(canUnpaid)controls='<button class="button outline small" data-action="manual-unpaid" data-id="'+e(o.id)+'">Mark unpaid</button>';
  else if(!captured&&!refunded)controls='<button type="button" class="button small" data-action="manual-paid" data-id="'+e(o.id)+'" '+(canPaid?'':'disabled')+'>Mark paid</button><button type="button" class="button outline small" disabled>Mark unpaid</button><p class="small muted">'+e(help)+'</p>';
  else controls='<p class="small muted">'+(manual?'Offline payment recorded · '+e(o.manualPayment?.method||'Payment')+' · Reference '+e(o.manualPayment?.reference||''):'Razorpay payment is verified. Use Razorpay refund controls for any reversal.')+'</p>';
  if(!captured&&!refunded)return '<section class="manual-payment-controls"><h3>Payment status · '+(o.paymentStatus==='pending'?'Payment pending':'Unpaid')+'</h3><label class="field">Offline method<select name="manual-method"><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label class="field">Receipt / transaction reference<input name="manual-reference" minlength="3" maxlength="100" autocomplete="off" placeholder="UPI UTR or receipt number"></label>'+controls+'</section>';
  return '<section class="manual-payment-controls"><h3>Payment status · '+(refunded?'Refunded':'Paid')+(manual?' · Offline':'')+'</h3>'+controls+'</section>';
}
function renderRequests(){$('requests-list').innerHTML=requestsError?`<p class="notice" role="alert">${e(requestsError)}</p>`:requestList.length?requestList.map(o=>`<article class="order-card"><div class="order-head"><h2>#${e(o.id.slice(0,8).toUpperCase())} <span class="status-pill">${o.paymentStatus==='captured'?'Paid':o.paymentStatus==='refunded'?'Refunded':'Unpaid'}</span></h2><select ${availableStatuses(o).length<2?'disabled':''} data-request-status="${e(o.id)}" aria-label="Status for ${e(o.id.slice(0,8))}">${ORDER_STATUSES.filter(([value])=>!['cancel_requested','cancelled'].includes(value)).map(([value,label])=>`<option value="${value}" ${o.status===value?'selected':''} ${value!==o.status&&!canTransition(o,value)?'disabled':''}>${label}</option>`).join('')}</select></div>${statusHelp(o)?`<p class="small muted">${e(statusHelp(o))}</p>`:''}<p><strong>${e(o.customer.firstName)} ${e(o.customer.lastName)}</strong><br>${e(o.customer.email)} · ${e(o.customer.phone)}</p><p>${e(o.customer.address)}${o.customer.apartment?`, ${e(o.customer.apartment)}`:''}<br>${e(o.customer.city)}, ${e(o.customer.state)} ${e(o.customer.postalCode)} · ${e(o.customer.country)}</p><div class="order-lines">${o.items.map(item=>`<span>${e(item.quantity)} × ${e(item.title)} — ${money(item.unitPrice*item.quantity)}</span>`).join('')}</div><button class="text-link" data-action="request-customizations" data-id="${e(o.id)}">View product notes & images</button><div id="request-custom-${e(o.id)}" class="request-customizations"></div><p>Estimated subtotal: <strong>${money(o.estimatedSubtotal)}</strong> · Shipping unconfirmed</p>${o.customer.notes?`<p><strong>Note:</strong> ${e(o.customer.notes)}</p>`:''}<div class="order-label-actions">${['captured','refunded'].includes(o.paymentStatus)?`<button class="button outline small" data-action="download-invoice" data-id="${e(o.id)}">Download invoice</button>`:''}<button class="button outline small" data-action="print-label" data-id="${e(o.id)}">Print label ↗</button><a class="text-link" href="${e(locationLink(o.customer))}" target="_blank" rel="noopener">${validLocation(o.customer.location)?'View delivery pin ↗':'Search address ↗'}</a></div>${manualPaymentControls(o)}${['details_received','reviewed','contacted','processing'].includes(o.status)?`<button class="text-link" data-action="resolve-cancellation" data-id="${e(o.id)}" data-approve="true">${o.inventoryReserved?'Cancel order & release stock':'Cancel request'}</button>`:''}${o.status==='cancel_requested'?`<div class="order-tools"><button class="button small" data-action="resolve-cancellation" data-id="${e(o.id)}" data-approve="true">Approve cancellation</button><button class="button outline small" data-action="resolve-cancellation" data-id="${e(o.id)}" data-approve="false">Decline cancellation</button></div>`:''}${(o.checkoutPayment?(!o.shippingQuote&&['details_received','reviewed','contacted','processing'].includes(o.status)):(!o.quote&&['details_received','reviewed','contacted'].includes(o.status)))?`<button class="text-link" data-action="approve-quote" data-id="${e(o.id)}">Set quote / shipping charge →</button>`:''}${o.quote?`<p class="payment-info">${o.checkoutPayment?'Item subtotal':'Confirmed total'}: ${money(o.quote.amount/100)} · ${e(o.refundStatus==='required'?(o.paymentMethod==='manual'?'Offline refund due — return funds through the original method, then record it below.':'Refund due — issue it in Razorpay; the webhook updates this request.'):o.paymentStatus)}</p>${o.shippingQuote ? '<p class=small>Shipping charge: ' + money(o.shippingQuote.amount/100) + ' - ' + e(o.shippingPaymentStatus||'awaiting payment') + '</p>' : ''}`:''}<p class="small muted">Received ${new Date(o.createdAt?.seconds?o.createdAt.seconds*1000:o.createdAt).toLocaleString('en-IN')}</p></article>`).join(''):'<div class="empty-state"><span class="empty-icon">↘</span><h2>All quiet for now.</h2><p>Saved checkout requests will appear here.</p></div>';}
function openEditor(id){
  if(!isAdmin)return;editingId=id||null;const p=products.find(p=>p.id===id)||{title:'',description:'',category:'paintings',price:'',stock:1,visible:true,images:[],material:'',dimensions:'',care:'',sku:''};editingImages=[...p.images];
  $('editor-dialog').innerHTML=`<div class="drawer-header"><div><p class="eyebrow">The studio / Products</p><h2 id="editor-title">${id?'Edit product':'Add product'}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Close product editor">×</button></div><form id="product-form"><div class="form-grid"><label class="field wide">Product name<input name="title" required maxlength="120" value="${e(p.title)}" placeholder="Product name"></label><label class="field wide">Description<textarea name="description" maxlength="3000" placeholder="Add a product description…">${e(p.description)}</textarea></label><label class="field">Collection<select name="category" required>${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===p.category?'selected':''}>${e(c.name)}</option>`).join('')}</select></label><label class="field">SKU (optional)<input name="sku" maxlength="80" value="${e(p.sku)}"></label><label class="field">Price (₹)<input name="price" type="number" required min="0.01" max="10000000" step="0.01" value="${e(p.price)}"></label><label class="field">Compare-at price (₹, optional)<input name="comparePrice" type="number" min="0" max="10000000" step="0.01" value="${p.comparePrice||''}"></label><label class="field">Available quantity<input name="stock" type="number" required min="0" max="100000" step="1" value="${p.stock}"></label><label class="field">Material (optional)<input name="material" maxlength="150" value="${e(p.material)}"></label><label class="field">Dimensions (optional)<input name="dimensions" maxlength="150" value="${e(p.dimensions)}"></label><label class="field">Care instructions (optional)<input name="care" maxlength="500" value="${e(p.care)}"></label><label class="field wide">Additional image URLs (one per line)<textarea id="product-image-urls" name="imageUrls" placeholder="https://…"></textarea></label><label class="field wide">Or upload photos · JPG, PNG, WebP · up to 6 MB each<input id="product-files" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple ></label></div><div id="editor-saved-images" class="image-preview-grid"></div><div id="editor-image-preview" class="image-preview-grid"></div><p class="small muted" style="margin-top:12px">Up to 8 images. The first image is your cover. Leave images blank to use the collection placeholder.</p><label class="checkbox"><input type="checkbox" name="visible" ${p.visible?'checked':''}>Publish to the storefront</label><label class="checkbox"><input type="checkbox" name="featured" ${p.featured?'checked':''}>Feature on the homepage</label><div class="editor-actions">${id?`<button type="button" class="danger-link" data-action="archive-product" data-id="${e(id)}">Archive product</button>`:'<span></span>'}<button id="save-product" class="button" type="submit">${id?'Save changes':'Add product'} →</button></div><p id="product-notice" class="notice" role="alert"></p></form>`;renderSavedProductImages();openDialog('editor-dialog');
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
function renderNotFound(){$('main').innerHTML='<div class="container empty-state"><h1>Product not found</h1><p>The product may be unpublished or the link may have changed.</p><a href="#shop" class="button">Back to the art store →</a></div>';}
function render(){
  $('main').removeAttribute('data-loading');
  contentEditor?.destroy();contentEditor=null;
  deliveryMap?.destroy();deliveryMap=null;stopReviews();
  const {page}=route();if(page!=='checkout'&&lastRenderedPage==='checkout')checkoutStep=1;lastRenderedPage=page;document.body.dataset.page=page;document.querySelectorAll('.desktop-nav>a').forEach(a=>a.toggleAttribute('aria-current',a.hash===`#${page}`));document.querySelectorAll('.desktop-nav>a[aria-current]').forEach(a=>a.setAttribute('aria-current','page'));
  document.title=`${page==='home'?'Art store':page==='admin'?'Studio admin':page==='checkout'?'Checkout':page==='account'?'Your account':'Art store'} · Silly Sensei`;
  if(deferPageRender(render))return;
  if(['about','info'].includes(page)&&!contentReady&&!contentError){$('main').innerHTML=pageSkeleton(page);return;}
  if(page==='home')renderHome();else if(['shop','collection','search'].includes(page))renderShop();else if(page==='product')renderProduct();else if(page==='checkout')renderCheckout();else if(page==='admin')renderAdmin();else if(page==='account')renderAccount();else if(page==='about')$('main').innerHTML=`<div class="container"><div class="page-head">${breadcrumbs('Our story')}<h1>About Silly Sensei</h1></div>${story()}</div>`;else if(page==='info')renderInfo();else renderNotFound();
  applyStoreContent(siteContent,page);decorateCartButtons();stopReviews=mountReviews();mountLogout();
}
function updateBanner(){const banner=$('connection-banner');banner.hidden=!catalogError;banner.innerHTML=catalogError?'The catalogue could not load. <button class="text-link" data-action="retry">Try again</button>':'';}
async function startCatalog(){const generation=++catalogGeneration;if(unsubscribeProducts)unsubscribeProducts();catalogError='';updateBanner();if(!catalogReady){render();if($('cart-dialog').open)renderCart();if($('search-dialog').open)renderSearch();}try{const stop=await store.observeProducts(isAdmin,list=>{if(generation!==catalogGeneration)return;products=list;for(const p of list)rememberedProducts.set(p.id,p);catalogReady=true;catalogError='';reconcileCart();updateBanner();if(submitting)return;if(route().page==='checkout'&&$('checkout-form')){captureCheckout();updateCheckoutAvailability();}else render();if($('cart-dialog').open)renderCart();if($('search-dialog').open)renderSearch();},error=>{if(generation!==catalogGeneration)return;catalogError=store.friendlyError(error);updateBanner();if(route().page==='checkout'&&$('checkout-form'))updateCheckoutAvailability();else render();if($('cart-dialog').open)renderCart();if($('search-dialog').open)renderSearch();});if(generation!==catalogGeneration)stop();else unsubscribeProducts=stop;}catch(error){if(generation!==catalogGeneration)return;catalogError=store.friendlyError(error);updateBanner();render();if($('cart-dialog').open)renderCart();if($('search-dialog').open)renderSearch();}}

document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;const action=target.dataset.action,id=target.dataset.id;
  try{
    if(action==='checkout-next'){if(checkoutStepValid())setCheckoutStep(checkoutStep+1);}
    else if(action==='checkout-previous'){captureCheckout();setCheckoutStep(checkoutStep-1);}
    else if(action==='cart'){renderCart();openDialog('cart-dialog');}
    else if(action==='cart-checkout'){if(!user||user.isAnonymous){closeDialogs();location.hash='checkout';}else{const flow=target.closest('.cart-checkout-flow');target.disabled=true;await animateCartCheckout(flow);if(target.isConnected){closeDialogs();location.hash='checkout';}}}
    else if(action==='payment-preview-return'){const preview=target.dataset.preview==='true';renderCheckout();const notice=$('checkout-notice');notice.textContent=preview?'Preview only: no payment, order or stock reservation was recorded.':'Payment was not verified. Your cart and checkout request are saved so you can retry.';notice.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});}
    else if(action==='cancel-payment-preview'){$('payment-preview-dialog')?.close();$('payment-preview-dialog')?.removeAttribute('open');}
    else if(action==='preview-payment-outcome'){if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&!(await store.paymentPreviewEnabled()))return;$('payment-preview-dialog')?.close();$('payment-preview-dialog')?.removeAttribute('open');deliveryMap?.destroy();deliveryMap=null;await playPaymentOutcome(target.dataset.outcome==='success'?'success':'failure',{preview:true,items:paymentAnimationItems()});}
    else if(action==='toggle-summary'){const collapsed=target.closest('.checkout-summary').classList.toggle('summary-collapsed');target.setAttribute('aria-expanded',String(!collapsed));target.querySelector('span').innerHTML=collapsed?'View order summary <span aria-hidden="true">⌄</span>':'Hide summary <span aria-hidden="true">⌃</span>';}
    else if(action==='close-dialog'){target.closest('dialog')?.close();}
    else if(action==='search'){openDialog('search-dialog');$('search-input').focus();renderSearch();}
    else if(action==='menu'){const menu=$('mobile-menu');menu.hidden=!menu.hidden;target.setAttribute('aria-expanded',String(!menu.hidden));}
    else if(action==='collections'){const menu=$('collection-menu');menu.hidden=!menu.hidden;target.setAttribute('aria-expanded',String(!menu.hidden));}
    else if(action==='add'){if(addToCart(id,1,false)){await animateCart(target);if(target.isConnected)openDialog('cart-dialog');}}
    else if(action==='print-label'){if(isAdmin){const request=requestList.find(o=>o.id===id);if(request)await openLabel(request,{load:store.loadLabel,save:store.saveLabel});}}
    else if(action==='add-detail'||action==='buy-now'){const quantity=Number(document.querySelector('[data-context="product"][data-quantity]')?.value||1);if(!Number.isInteger(quantity)||quantity<1)return toast('Enter a whole-number quantity.');if(addToCart(id,quantity,false)){if(action==='buy-now')location.hash='checkout';else{await animateCart(target);if(target.isConnected)openDialog('cart-dialog');}}}
    else if(action==='remove'){clearCustomization(id);cart=cart.filter(c=>c.id!==id);persistCart();renderCart();if(route().page==='checkout'){captureCheckout();renderCheckout();}}
    else if(action==='quantity'){
      const context=target.dataset.context,delta=Number(target.dataset.delta),control=target.closest('.quantity');
      if(![-1,1].includes(delta)||!control)return;
      const product=products.find(item=>item.id===id)||rememberedProducts.get(id);
      if(context==='product'){
        const input=control.querySelector('[data-quantity]');if(!input||!product)return;
        const stock=Math.max(1,Number(product.stock)||1),value=Math.max(1,Math.min(99,stock,Number(input.value||1)+delta));
        control.outerHTML=quantityControl(id,value,stock,'product');
      }else{
        const line=cart.find(item=>item.id===id);if(!line)return;
        const stock=Number(product?.stock),maximum=Math.max(line.quantity,Number.isFinite(stock)&&stock>0?Math.min(99,stock):line.quantity);
        const value=Math.max(1,Math.min(maximum,line.quantity+delta));
        if(value===line.quantity){if(delta>0)toast('The available stock limit has been reached.');return;}
        line.quantity=value;persistCart();renderCart();
        if(route().page==='checkout'){captureCheckout();renderCheckout();}
      }
    }
    else if(action==='zoom'){$('zoom-image').src=$('product-main-image').src;$('zoom-image').alt=$('product-main-image').alt;openDialog('image-dialog');}
    else if(action==='remove-product-image'){editingImages.splice(Number(target.dataset.index),1);renderSavedProductImages();}
    else if(action==='thumbnail'){const p=products.find(p=>p.id===route().id);$('product-main-image').src=safeImage(p.images[Number(target.dataset.index)]);document.querySelectorAll('.thumbs button').forEach(b=>b.classList.toggle('active',b===target));}
    else if(action==='signin'){target.disabled=true;await store.signIn();if(target.isConnected)target.disabled=false;}
    else if(action==='skip-save-address'){$('save-address-prompt').remove();}
    else if(action==='save-checkout-address'){target.disabled=true;if(!user||user.isAnonymous)await store.signIn();const profile=normalizeProfile(completedRequest.customer);await store.saveProfile(profile);accountState.profile=profile;if($('save-address-prompt'))$('save-address-prompt').innerHTML='<p role="status">Your address and confirmed pin are saved for next time.</p>';}
    else if(action==='cancel-request'){target.disabled=true;const form=target.closest('.cancel-form');await store.cancelRequest(id,form.querySelector('textarea').value);await fetchCustomerAccount();toast('Your cancellation has been saved.');}
    else if(action==='download-invoice'){target.disabled=true;try{const invoice=await store.callBackend('getInvoice',{requestId:id});const pdf=await invoicePDF(invoice);downloadFile(pdf,'invoice-'+String(invoice.number||id).replace(/[^a-zA-Z0-9_-]/g,'')+'.pdf','application/pdf');toast('PDF invoice downloaded.');}finally{target.disabled=false;}}
    else if(action==='pay-request'){target.disabled=true;await payRequest(id,target.dataset.purpose||'items');await fetchCustomerAccount();toast(target.dataset.purpose==='shipping'?'Shipping payment verified. Thank you!':'Payment verified. Thank you!');}
    else if(action==='approve-quote'){const request=requestList.find(r=>r.id===id);if(request)openQuoteEditor(request,{approve:data=>store.callBackend('approveQuote',data),onSaved:()=>{requestsLoaded=false;renderAdminContent();}});}
    else if(action==='resolve-cancellation'){target.disabled=true;await store.callBackend('resolveCancellation',{requestId:id,approve:target.dataset.approve==='true'});requestsLoaded=false;renderAdminContent();}
    else if(action==='manual-paid'){const box=target.closest('.manual-payment-controls'),method=box.querySelector('[name=manual-method]').value,reference=box.querySelector('[name=manual-reference]').value.trim();if(!reference)return toast('Enter the offline payment reference.');target.disabled=true;await store.callBackend('setManualPaymentStatus',{requestId:id,status:'paid',method,reference});requestsLoaded=false;renderAdminContent();toast('Offline payment recorded.');}
    else if(action==='manual-unpaid'){if(!window.confirm('Mark this offline payment unpaid? Confirm that the money was never received or has been returned.'))return;target.disabled=true;await store.callBackend('setManualPaymentStatus',{requestId:id,status:'unpaid'});requestsLoaded=false;renderAdminContent();toast('Offline payment marked unpaid.');}
    else if(action==='manual-refund'){if(!window.confirm('Confirm that you have already returned the offline payment to the customer.'))return;target.disabled=true;await store.callBackend('setManualPaymentStatus',{requestId:id,status:'refunded'});requestsLoaded=false;renderAdminContent();toast('Offline refund recorded.');}
    else if(action==='review-checkout-cart'){captureCheckout();renderCheckout();renderCart();openDialog('cart-dialog');}
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
  }catch(error){const notice=$('save-address-prompt')?.querySelector('.notice')||$('auth-notice')||$('product-notice');if(notice)notice.textContent=store.friendlyError(error);else toast(store.friendlyError(error));target.disabled=false;}
});
document.addEventListener('click',event=>{if(!event.target.closest('.nav-dropdown')){$('collection-menu').hidden=true;document.querySelector('[data-action="collections"]').setAttribute('aria-expanded','false');}});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('submit',event=>{if(event.target.id==='customer-profile-form')submitCustomerProfile(event);if(event.target.id==='checkout-form')submitCheckout(event);if(event.target.id==='banner-form')submitBanners(event);if(event.target.id==='product-form')submitProduct(event);if(event.target.id==='search-form'){event.preventDefault();location.hash=`search/${encodeURIComponent($('search-input').value.trim())}`;closeDialogs();}});
document.addEventListener('input',event=>{if(event.target.dataset.productNote)setProductNote(event.target.dataset.productNote,event.target.value);if(['address','city','postalCode'].includes(event.target.id))deliveryMap?.invalidate();if(event.target.id==='search-input')renderSearch();if(event.target.id==='order-note')orderNote=event.target.value;if(event.target.id==='admin-search'){adminSearch=event.target.value;renderAdminTable();}if(event.target.closest('#checkout-form')){if(event.target.name)checkoutTouched.add(event.target.name);captureCheckout();}});
document.addEventListener('change',async event=>{const t=event.target;if(t.dataset.referenceFiles){try{addReferences(t.dataset.referenceFiles,t.files);refreshReferencePreviews(t.dataset.referenceFiles);}catch(error){toast(error.message);}t.value='';}if(['state','country'].includes(t.id))deliveryMap?.invalidate();
  if(t.id==='sort-filter'){filter.sort=t.value;renderProductResults();decorateCartButtons();}if(t.id==='available-filter'){filter.available=t.checked;renderProductResults();decorateCartButtons();}if(t.id==='category-filter')location.hash=t.value?`collection/${t.value}`:'shop';if(t.id==='admin-category'){adminCategory=t.value;renderAdminTable();}
  if(t.dataset.quantity){const p=products.find(p=>p.id===t.dataset.quantity)||rememberedProducts.get(t.dataset.quantity)||{id:t.dataset.quantity,stock:0};let value=Number(t.value);if(!Number.isInteger(value)||value<1)value=1;value=Math.max(1,Math.min(value,Math.max(cart.find(c=>c.id===p.id)?.quantity||1,p.stock),99));if(t.dataset.context==='product'){t.parentElement.outerHTML=quantityControl(p.id,value,p.stock,'product');}else{cart.find(c=>c.id===p.id).quantity=value;persistCart();renderCart();if(route().page==='checkout'){captureCheckout();renderCheckout();}}}
  if(t.dataset.requestStatus){t.disabled=true;try{await store.updateRequest(t.dataset.requestStatus,t.value);toast('Request status updated.');}catch(error){toast(store.friendlyError(error));}finally{await fetchRequests();if(t.isConnected)t.disabled=false;}}
  if(t.id==='product-files'){$('editor-image-preview').replaceChildren();for(const file of [...t.files].slice(0,8)){if(!file.type.startsWith('image/'))continue;const image=document.createElement('img');const url=URL.createObjectURL(file);image.src=url;image.alt=file.name;image.onload=image.onerror=()=>URL.revokeObjectURL(url);$('editor-image-preview').append(image);}}
});
function renderSearch(){if($('search-input').value&&!catalogReady){$('search-results').innerHTML=catalogError?catalogErrorMarkup():skeletonMarkup('rows','Loading search results…');return;}const query=$('search-input').value;const results=filterProducts(products,{search:query}).slice(0,6);$('search-results').innerHTML=query?results.length?results.map(p=>`<a class="search-result" href="#product/${e(p.id)}" data-action="close-dialog"><img src="${e(imageOf(p))}" alt=""><div>${e(p.title)}<span>${money(p.price)} · ${e(categoryOf(p.category)?.name)}</span></div></a>`).join(''):'<p class="muted" style="margin-top:25px">No products found. Try a different search.</p>':`<p class="eyebrow" style="margin-top:25px">Explore a collection</p><div class="footer-links">${categoryLinks}</div>`;}
window.addEventListener('hashchange',()=>{if(location.hash==='#main'){return;}$('mobile-menu').hidden=true;document.querySelector('[data-action="menu"]').setAttribute('aria-expanded','false');closeDialogs();render();window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});});
window.addEventListener('storage',event=>{if(event.key===cartKey){try{const value=JSON.parse(event.newValue);cart=Array.isArray(value)?value:[];reconcileCart();updateCartBadge();if($('cart-dialog').open)renderCart();if(route().page==='checkout'){captureCheckout();renderCheckout();}}catch{}}});
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement&&!event.target.closest('.leaflet-container')&&!event.target.dataset.fallback){event.target.dataset.fallback='1';event.target.src='assets/paintings.svg';}},true);
updateCartBadge();updateBanner();render();
startCatalog();
store.observeAuth((nextUser,nextAdmin)=>{
  const changed=isAdmin!==nextAdmin,identityChanged=user?.uid!==nextUser?.uid;
  if(identityChanged){
    contentDraft=null;
    if(user&&!user.isAnonymous){checkoutDraft={};checkoutTouched.clear();completedRequest=null;orderNote='';clearCustomizations();closeDialogs();}
    accountState={requests:[],profile:{},loaded:false,loading:false};
  }
  user=nextUser;isAdmin=nextAdmin;authLoading=false;authError='';requestList=[];requestsLoaded=false;
  if(changed)startCatalog();
  if(['account','admin'].includes(route().page)){
    if(nextAdmin&&identityChanged){location.hash=requestedAdminPage;requestedAdminPage='admin';render();}
    else if(!nextAdmin&&route().page==='admin')location.hash='account';else render();
  }
  if(route().page==='checkout'&&!submitting){if(identityChanged)captureCheckout();renderCheckout();}
  if(identityChanged&&user&&!user.isAnonymous)fetchCustomerAccount();
}).catch(error=>{authLoading=false;authError=store.friendlyError(error);if(['account','admin'].includes(route().page))renderAccount();if(route().page==='checkout')renderCheckout();});
function settingsLoadFailed(){
  settingsError='Store settings could not load. Check your connection and reload to try again.';
  if(route().page==='home')render();
  if(route().page==='admin'&&adminTab==='settings')renderAdminContent();
}
store.observeSettings(settings=>{
  storeSettings=settings;settingsReady=true;settingsError='';applyStoreBanners();
  if(route().page==='home')render();
  if(route().page==='admin'&&adminTab==='settings')renderAdminContent();
},settingsLoadFailed).catch(settingsLoadFailed);
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
},()=>{contentError='Published page content could not load. Check your connection and deploy the updated Realtime Database rules, then reload. Publishing is disabled until the content loads.';if(!submitting&&!['checkout','account'].includes(route().page))render();}).catch(()=>{contentError='The page editor could not connect. Reload to try again.';if(!submitting&&!['checkout','account'].includes(route().page))render();});

