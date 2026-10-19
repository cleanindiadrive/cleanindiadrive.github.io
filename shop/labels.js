import {escapeHTML as e} from './commerce.js';
import {validLocation,locationLink} from './location-utils.js';
import {loadScript} from './browser-library.js';
import {LABEL_FIELDS,defaultLabel,normalizeLabel,validateLabel} from './label-data.js';

export function labelMarkup(request,t,qr) {
  const c=request.customer,hasPin=validLocation(c.location),count=request.items.reduce((n,i)=>n+i.quantity,0);
  return `<article class="address-label"><header><img src="assets/brand-logo.png" alt="Silly Sensei"><div><b>${e(t.heading)}</b><span>#${e(request.id.slice(0,8).toUpperCase())}</span></div></header><div class="label-routing"><strong>${e(t.country)}</strong><span>${count} ${count===1?'item':'items'} · ${e(t.handling)}</span></div><div class="label-address"><span class="label-caption">DELIVER TO</span><h2>${e(t.recipient)}</h2><p>${e(t.address)}${t.apartment?`<br>${e(t.apartment)}`:''}</p><p class="label-city">${e(t.city)}, ${e(t.state)}</p><div class="label-postal"><span>PIN CODE</span><strong>${e(t.postalCode)}</strong></div><p class="label-phone"><b>CONTACT</b> ${e(t.phone)}</p></div><div class="label-location"><div class="label-qr" role="img" aria-label="QR code for customer-confirmed delivery location">${qr}</div><div><b>${e(t.qrHeading)}</b><p>${hasPin?'Customer-confirmed delivery location':'Address search · verify before delivery'}</p><p class="label-coordinates">${hasPin?`${c.location.latitude.toFixed(6)}<br>${c.location.longitude.toFixed(6)}`:'OpenStreetMap search'}</p></div></div>${hasPin&&c.location.formattedAddress?`<p class="label-nearby"><b>Nearby:</b> ${e(c.location.formattedAddress)}</p>`:''}<footer><strong>${e(t.message)}</strong><br>Address label only · No postage purchased<br>Checkout request · Payment not collected</footer></article>`;
}
export async function openLabel(request,{load,save}) {
  await loadScript('assets/vendor/qrcode.js');
  const url=locationLink(request.customer),qr=window.qrcode(0,'M');qr.addData(url,'Byte');qr.make();
  const qrSvg=qr.createSvgTag({cellSize:3,margin:12,scalable:true});
  let dialog=document.getElementById('label-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='label-dialog';dialog.className='label-dialog';dialog.setAttribute('aria-labelledby','label-title');document.body.append(dialog);}
  const field=(key,title,required=false)=>`<label class="field ${['address','apartment','message'].includes(key)?'wide':''}">${title}<input name="${key}" maxlength="${LABEL_FIELDS[key]}" ${required?'required':''}></label>`;
  dialog.innerHTML=`<div class="drawer-header"><div><p class="eyebrow">The studio / Dispatch</p><h2 id="label-title">Edit address label</h2></div><button type="button" class="icon-button" id="label-close" aria-label="Close label editor">×</button></div><p class="small muted">Edit the printed text here. The original customer details and confirmed map pin stay attached to the request.</p><div class="label-editor-layout"><form id="label-edit-form"><h3>Recipient & delivery</h3><div class="form-grid">${field('recipient','Recipient name',true)}${field('phone','Contact number',true)}${field('address','Address',true)}${field('apartment','Apartment / landmark')}${field('city','City',true)}${field('state','State',true)}${field('postalCode','PIN code',true)}${field('country','Country text')}</div><h3>Label wording</h3><div class="form-grid">${field('heading','Label heading')}${field('handling','Handling instructions')}${field('qrHeading','QR heading')}${field('message','Footer message')}</div><div class="label-save-actions"><button class="button" id="label-save" type="submit" disabled>Save label text</button><button class="text-link" type="button" id="label-reset">Use customer details</button></div><p id="label-save-status" class="notice" role="status">Loading saved label…</p></form><div class="label-preview-column"><p class="eyebrow">Print preview · 100 × 150 mm</p><div class="label-sheet"></div><p id="label-size-note" class="small muted">Print at 100% scale without browser headers and footers.</p><p class="small muted">If you change the address, check it still matches the customer’s pin before dispatch.</p></div></div><div class="label-controls"><a class="text-link" href="${e(url)}" target="_blank" rel="noopener">Check delivery pin ↗</a><button type="button" class="button" id="label-print">Print current label ↗</button></div>`;
  let printRoot=document.getElementById('print-root');if(!printRoot){printRoot=document.createElement('div');printRoot.id='print-root';document.body.append(printRoot);}
  const form=dialog.querySelector('form'),notice=dialog.querySelector('#label-save-status'),saveButton=dialog.querySelector('#label-save');
  const generation=Symbol('label');dialog.labelLoad=generation;
  form.inert=true;dialog.querySelector('#label-print').disabled=true;
  let text=defaultLabel(request),loaded=false,saving=false;
  function paint(){
    const html=labelMarkup(request,text,qrSvg);dialog.querySelector('.label-sheet').innerHTML=html;printRoot.innerHTML=html;
    requestAnimationFrame(()=>{const sheet=dialog.querySelector('.label-sheet .address-label');if(!sheet)return;dialog.querySelector('#label-size-note').textContent=sheet.scrollHeight>567?'This address needs more space. Choose A4 paper at 100% scale.':'Print at 100% scale without browser headers and footers.';});
  }
  function fill(){for(const key of Object.keys(LABEL_FIELDS))form.elements[key].value=text[key];paint();}
  form.addEventListener('input',()=>{text=normalizeLabel(request,Object.fromEntries(new FormData(form)));notice.classList.remove('is-success');notice.textContent='Unsaved changes · Print uses the text shown here.';paint();});
  form.onsubmit=async event=>{
    event.preventDefault();if(!loaded||saving)return;notice.classList.remove('is-success');const invalid=validateLabel(text);if(invalid){notice.textContent=invalid;return;}
    saving=true;saveButton.disabled=true;notice.textContent='Saving label text…';
    try{await save(request.id,text);notice.classList.add('is-success');notice.textContent='Label text saved for this request.';}catch(error){notice.textContent=error.message||'Label could not save. Your edits are still here.';}finally{saving=false;saveButton.disabled=false;}
  };
  dialog.querySelector('#label-reset').onclick=()=>{text=defaultLabel(request);fill();notice.classList.remove('is-success');notice.textContent='Customer details restored. Save to keep this version.';};
  dialog.querySelector('#label-close').onclick=()=>dialog.close();
  dialog.onclose=()=>{dialog.labelLoad=null;dialog.replaceChildren();printRoot.replaceChildren();document.body.classList.remove('printing-label');};
  dialog.querySelector('#label-print').onclick=()=>{
    if(!form.reportValidity())return;const invalid=validateLabel(text);if(invalid){notice.textContent=invalid;return;}
    document.body.classList.add('printing-label');window.print();
  };
  window.addEventListener('afterprint',()=>document.body.classList.remove('printing-label'),{once:true});
  fill();dialog.showModal();
  try{const saved=await load(request.id);if(!dialog.open||dialog.labelLoad!==generation)return;text=normalizeLabel(request,saved);loaded=true;saveButton.disabled=false;notice.textContent='Ready to edit. Saved changes apply only to this label.';fill();}
  catch{notice.textContent='Saved label text could not load. Reopen the editor to retry before saving. You can still edit and print.';}
  finally{if(dialog.labelLoad===generation){form.inert=false;dialog.querySelector('#label-print').disabled=false;}}
}
