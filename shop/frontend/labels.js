import {escapeHTML as e} from './commerce.js';
import {skeletonMarkup} from './skeletons.js';
import {validLocation,locationLink} from './location-utils.js';
import {loadScript} from './browser-library.js';
import {TEMPLATE_FIELDS,DEFAULT_LABEL_TEMPLATE,normalizeTemplate,labelForRequest} from './label-data.js';

export function labelMarkup(request,t,qr) {
  t={...DEFAULT_LABEL_TEMPLATE,...t};
  const c=request.customer,hasPin=validLocation(c.location),count=request.items.reduce((n,i)=>n+i.quantity,0);
  return `<article class="address-label"><header><img src="assets/brand-logo.webp" alt="Silly Sensei"><div><b>${e(t.heading)}</b><span>#${e(request.id.slice(0,8).toUpperCase())}</span></div></header><div class="label-routing"><strong>${e(t.country)}</strong><span>${count} ${count===1?'item':'items'} · ${e(t.handling)}</span></div><div class="label-address"><span class="label-caption">${e(t.deliverTo)}</span><h2>${e(t.recipient)}</h2><p>${e(t.address)}${t.apartment?`<br>${e(t.apartment)}`:''}</p><p class="label-city">${e(t.city)}, ${e(t.state)}</p><div class="label-postal"><span>${e(t.postalLabel)}</span><strong>${e(t.postalCode)}</strong></div><p class="label-phone"><b>${e(t.phoneLabel)}</b> ${e(t.phone)}</p></div><div class="label-location"><div class="label-qr" role="img" aria-label="QR code for customer-confirmed delivery location">${qr}</div><div><b>${e(t.qrHeading)}</b><p>${hasPin?e(t.locationHint):'Address search · verify before delivery'}</p><p class="label-coordinates">${hasPin?`${c.location.latitude.toFixed(6)}<br>${c.location.longitude.toFixed(6)}`:'Google Maps search'}</p></div></div>${hasPin&&c.location.formattedAddress?`<p class="label-nearby"><b>Nearby:</b> ${e(c.location.formattedAddress)}</p>`:''}<footer><strong>${e(t.message)}</strong><br>${e(t.postageNote)}<br>${request.paymentStatus==='captured'?'Payment received':'Payment not collected'}</footer></article>`;
}
async function makeQR(customer){await loadScript('assets/vendor/qrcode.js');const qr=window.qrcode(0,'M');qr.addData(locationLink(customer),'Byte');qr.make();return qr.createSvgTag({cellSize:3,margin:12,scalable:true});}
export async function openLabel(request,{load}) {
  const [template,qr]=await Promise.all([load(),makeQR(request.customer)]);
  let dialog=document.getElementById('label-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='label-dialog';dialog.className='label-dialog';document.body.append(dialog);}
  const html=labelMarkup(request,labelForRequest(request,template),qr);
  dialog.innerHTML=`<div class="drawer-header"><div><p class="eyebrow">Dispatch</p><h2 id="label-title">Delivery label</h2></div><button type="button" class="icon-button" id="label-close" aria-label="Close label">×</button></div><div class="label-print-preview"><div class="label-sheet">${html}</div></div><p class="small muted">100 × 150 mm · Print at 100% without browser headers or footers. Long addresses may need A4 paper.</p><div class="label-controls"><a href="#admin/labels" class="text-link" id="label-template-link">Edit the global label template →</a><a class="text-link" href="${e(locationLink(request.customer))}" target="_blank" rel="noopener">Open Google Maps ↗</a><button class="button" id="label-print">Print label ↗</button></div>`;
  dialog.setAttribute('aria-labelledby','label-title');
  let printRoot=document.getElementById('print-root');if(!printRoot){printRoot=document.createElement('div');printRoot.id='print-root';document.body.append(printRoot);}printRoot.innerHTML=html;
  dialog.querySelector('#label-close').onclick=()=>dialog.close();dialog.querySelector('#label-template-link').onclick=()=>dialog.close();
  dialog.onclose=()=>{dialog.replaceChildren();printRoot.replaceChildren();document.body.classList.remove('printing-label');};
  dialog.querySelector('#label-print').onclick=()=>{document.body.classList.add('printing-label');window.print();};
  window.addEventListener('afterprint',()=>document.body.classList.remove('printing-label'),{once:true});dialog.showModal();
}
export async function mountLabelTemplate(root,{load,save}) {
  root.innerHTML=skeletonMarkup('editor','Loading your shared label settings…');
  const request={id:'sample-label',customer:{firstName:'Sample',lastName:'Recipient',address:'12 Example Street',apartment:'Apartment 4B',city:'Bengaluru',state:'Karnataka',postalCode:'560001',phone:'9000000000',location:{latitude:12.9716,longitude:77.5946,source:'pin',confirmed:true,accuracy:0,formattedAddress:'Bengaluru, Karnataka'}},items:[{quantity:1}]};
  try{
    const [value,qr]=await Promise.all([load(),makeQR(request.customer)]);if(!root.isConnected)return;
    let template=normalizeTemplate(value);
    const names={heading:'Label heading',country:'Country line',handling:'Handling instructions',qrHeading:'QR heading',message:'Footer message',deliverTo:'Recipient caption',postalLabel:'PIN code caption',phoneLabel:'Phone caption',locationHint:'Map description',postageNote:'Postage note'};
    root.innerHTML=`<div class="admin-title"><div><h1>Label template</h1><p>One shared design for every delivery label.</p></div></div><div class="label-template-layout"><form id="label-template-form"><p class="small muted">Customer names, addresses and map pins are filled from each order automatically.</p>${Object.entries(TEMPLATE_FIELDS).map(([key,max])=>`<label class="field">${names[key]}<input name="${key}" maxlength="${max}" value="${e(template[key])}"></label>`).join('')}<button class="button" type="submit">Save for all labels</button><p class="notice" role="status"></p></form><section><p class="eyebrow">Preview · sample address</p><div class="label-sheet"></div></section></div>`;
    const form=root.querySelector('form'),notice=form.querySelector('.notice'),paint=()=>root.querySelector('.label-sheet').innerHTML=labelMarkup(request,labelForRequest(request,template),qr);
    form.oninput=()=>{template=normalizeTemplate(Object.fromEntries(new FormData(form)));paint();notice.textContent='Unsaved changes';};
    form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;notice.textContent='Saving…';try{await save(template);notice.textContent='Saved. Every new print uses this template.';}catch(error){notice.textContent=error.message||'Could not save. Your edits are still here.';}finally{button.disabled=false;}};paint();
  }catch{if(root.isConnected)root.innerHTML='<h1>Label template</h1><p class="notice" role="alert">Could not load the shared label settings. Deploy the current Firestore rules and refresh.</p>';}
}
