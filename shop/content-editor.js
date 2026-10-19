import {CONTENT_SCHEMA,normalizeContent,validateContent,applyStoreContent,footerMarkup} from './store-content.js';
import {homeMarkup,storyMarkup,infoMarkup,productCardMarkup} from './storefront-view.js';
import {escapeHTML as e} from './commerce.js';

export function editorPreview(content,page,products,settings,header) {
  const c=normalizeContent(content);
  let main=homeMarkup(products,settings,c),kind='home';
  if(page==='about'){kind=page;main=`<div class="container"><div class="page-head"><h1>${e(c.story.pageTitle)}</h1></div>${storyMarkup()}</div>`;}
  if(page==='footer'){kind=page;main='';}
  if(page==='shop'){kind=page;main=`<div class="container"><div class="page-head"><h1>${e(c.home.shopTitle)}</h1><p>${e(c.home.shopDescription)}</p></div><div class="product-grid">${products.filter(p=>p.visible&&!p.archived).map(p=>productCardMarkup(p,c)).join('')}</div></div>`;}
  if(['contact','shipping','privacy','terms'].includes(page)){kind='info';main=infoMarkup(c,page);}
  const doc=new DOMParser().parseFromString(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${e(new URL('./',document.baseURI).href)}"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;900&family=Quicksand:wght@500&display=swap" rel="stylesheet">${['shop.css','brand.css','features.css','animations.css','animation-integration.css'].map(css=>`<link rel="stylesheet" href="${css}">`).join('')}<style>a,button,input,select{pointer-events:none}body{overflow-x:hidden}.site-header{position:relative}.story-copy>p{white-space:pre-line}</style></head><body data-page="${kind}">${settings.announcementVisible?`<div class="announcement">${e(settings.announcementText)}</div>`:''}${header}<main>${main}</main><footer id="footer" class="site-footer">${footerMarkup(c)}</footer></body></html>`,'text/html');
  applyStoreContent(c,kind,doc);
  doc.querySelectorAll('script,iframe,dialog').forEach(el=>el.remove());
  return '<!doctype html>'+doc.documentElement.outerHTML;
}

export function mountContentEditor(root,initial,{onPublish,onUpload,products=()=>[],settings=()=>({}),header=()=>'',onDraft=()=>{},draft:priorDraft,loadError=''}) {
  let published=normalizeContent(initial),draft=normalizeContent(priorDraft||initial),busy=false,timer,page='home',device='desktop',previousPage='home';
  const fieldMarkup=(section,key,f)=>{const id=`content-${section}-${key}`,name=section+'.'+key,v=draft[section][key];
    if(f.kind==='checkbox')return `<label class="visibility-toggle" for="${id}"><input id="${id}" name="${name}" type="checkbox" ${v?'checked':''}>${e(f.label)}</label>`;
    return `<label class="field" for="${id}">${e(f.label)}${f.kind==='textarea'?`<textarea id="${id}" name="${name}" maxlength="${f.max}" rows="${f.max>500?5:3}">${e(v)}</textarea>`:`<input id="${id}" name="${name}" maxlength="${f.max}" value="${e(v)}">`}</label>${f.kind==='image'?`<label class="content-upload">Upload image<input type="file" data-upload="${name}" accept="image/jpeg,image/png,image/webp"></label>`:''}`;
  };
  root.innerHTML=`<div class="admin-title"><div><p class="eyebrow">Make it yours</p><h1>Storefront editor</h1><p>Edit your pages and see changes before publishing.</p></div></div><div class="content-toolbar"><span class="content-save-state" role="status"></span><div><button type="button" class="button outline small" data-content-discard>Discard changes</button><button type="submit" form="content-form" class="button small">Publish changes</button></div></div>${loadError?`<p class="notice" role="alert">${e(loadError)}</p>`:''}<p class="content-message" role="status"></p><div class="content-workspace"><form id="content-form" class="content-form"><div class="content-tip">Open a section to edit. Image uploads use JPG, PNG or WebP, up to 6 MB. Products and banners have their own admin tabs.</div>${Object.entries(CONTENT_SCHEMA).map(([section,group],i)=>`<details class="content-group" name="content-sections" ${i===0?'open':''} data-section="${section}"><summary>${e(group.label)}<span>${Object.keys(group.fields).length}</span></summary><div class="content-fields">${Object.entries(group.fields).map(([key,f])=>fieldMarkup(section,key,f)).join('')}</div></details>`).join('')}</form><section class="content-preview" aria-label="Storefront draft preview"><div class="content-preview-toolbar"><label>Preview page<select aria-label="Preview page">${[['home','Homepage'],['shop','Shop'],['about','Our story'],['contact','Contact'],['shipping','Shipping & returns'],['privacy','Privacy'],['terms','Terms'],['footer','Footer']].map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><div class="content-devices" role="group" aria-label="Preview screen size"><button type="button" data-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-device="mobile" aria-pressed="false">Mobile</button></div></div><p class="content-preview-hint">Live draft · scroll to explore · links are inactive</p><div class="content-preview-stage"><div class="content-preview-frame"><iframe title="Live storefront preview" sandbox="allow-same-origin" tabindex="-1"></iframe></div></div></section></div>`;
  const form=root.querySelector('form'),notice=root.querySelector('.content-message'),state=root.querySelector('.content-save-state'),frame=root.querySelector('iframe'),stage=root.querySelector('.content-preview-stage'),holder=root.querySelector('.content-preview-frame');
  function dirty(){return JSON.stringify(draft)!==JSON.stringify(published);}
  function status(){state.textContent=dirty()?'● Unpublished changes':'✓ All changes published';root.querySelector('[data-content-discard]').disabled=busy||!dirty();root.querySelector('[type="submit"]').disabled=busy||!dirty()||!!loadError;}
  function size(){const width=device==='mobile'?390:1200,scale=Math.min(1,(stage.clientWidth-24)/width);holder.style.width=width+'px';holder.style.height=(600/scale)+'px';holder.style.transform=`scale(${scale})`;stage.style.height='624px';}
  function preview(){const scrollTop=page===previousPage?(frame.contentDocument?.documentElement.scrollTop||0):0;previousPage=page;frame.onload=()=>{frame.contentWindow?.scrollTo(0,scrollTop);};frame.srcdoc=editorPreview(draft,page,products(),settings(),header());size();status();}
  function capture(){for(const [section,group] of Object.entries(CONTENT_SCHEMA))for(const [key,f] of Object.entries(group.fields)){const el=form.elements.namedItem(section+'.'+key);draft[section][key]=f.kind==='checkbox'?el.checked:el.value;}onDraft(structuredClone(draft));}
  function changed(){capture();notice.textContent='';clearTimeout(timer);timer=setTimeout(preview,180);status();}
  function locked(value){busy=value;form.inert=value;root.querySelectorAll('.content-toolbar button').forEach(el=>el.disabled=value);status();}
  form.addEventListener('input',changed);
  form.addEventListener('change',async event=>{
    const name=event.target.dataset.upload,file=event.target.files?.[0];if(!name||!file)return;
    locked(true);notice.textContent='Uploading image…';notice.classList.remove('is-error');
    try{const url=await onUpload(file);if(!root.isConnected)return;form.elements.namedItem(name).value=url;capture();preview();notice.textContent='Image ready in your draft. Publish to show it in the store.';}
    catch(error){notice.textContent=error.message||'The image could not upload. Please try again.';notice.classList.add('is-error');}
    finally{locked(false);event.target.value='';}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;capture();const invalid=validateContent(draft);notice.classList.toggle('is-error',!!invalid);if(invalid){notice.textContent=invalid;return;}
    locked(true);notice.textContent='Publishing changes…';
    try{await onPublish(structuredClone(draft));published=normalizeContent(draft);onDraft(null);notice.textContent='Published. Your storefront now shows these changes.';}
    catch(error){notice.textContent=error.message||'Publishing failed. Your draft is still here; please try again.';notice.classList.add('is-error');}
    finally{locked(false);}
  });
  root.querySelector('[data-content-discard]').addEventListener('click',()=>{draft=normalizeContent(published);for(const [section,group] of Object.entries(CONTENT_SCHEMA))for(const [key,f] of Object.entries(group.fields)){const el=form.elements.namedItem(section+'.'+key);if(f.kind==='checkbox')el.checked=draft[section][key];else el.value=draft[section][key];}onDraft(null);notice.textContent='Draft discarded. Showing published content.';preview();});
  root.querySelector('[aria-label="Preview page"]').addEventListener('change',event=>{page=event.target.value;preview();});
  root.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',()=>{device=button.dataset.device;root.querySelectorAll('[data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));size();}));
  form.querySelectorAll('details').forEach(group=>group.addEventListener('toggle',()=>{if(!group.open)return;if(group.dataset.section==='footer')page='footer';else if(group.dataset.section==='story')page='about';else if(group.dataset.section==='pages')page='contact';else page='home';root.querySelector('[aria-label="Preview page"]').value=page;preview();}));
  const observer=new ResizeObserver(size);observer.observe(stage);preview();
  return {destroy(){observer.disconnect();clearTimeout(timer);},isDirty:dirty,updatePublished(value){const keepDraft=dirty();published=normalizeContent(value);if(!keepDraft&&!busy){draft=normalizeContent(value);for(const [section,group] of Object.entries(CONTENT_SCHEMA))for(const [key,f] of Object.entries(group.fields)){const el=form.elements.namedItem(section+'.'+key);if(f.kind==='checkbox')el.checked=draft[section][key];else el.value=draft[section][key];}preview();}status();}};
}
