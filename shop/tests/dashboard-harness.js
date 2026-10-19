// Isolated visual fixture, excluded from Firebase Hosting. Never imports store.js.
import {accountMarkup} from '../customer-dashboard.js';
import {mountLogout,animateLogout} from '../logout.js';
import {openLabel} from '../labels.js';
const user={uid:'visual-test',displayName:'Alex Sample',email:'alex@example.com'};
let profile={firstName:'Alex',lastName:'Sample',phone:'9876543210',address:'12 Example Lane',apartment:'First floor',city:'Bengaluru',state:'Karnataka',postalCode:'560001'};
const request={id:'UI123456-test',status:'reviewed',createdAt:Date.now(),estimatedSubtotal:1800,customer:{...profile,email:user.email,country:'India',notes:'Please pack with care.',location:{latitude:12.968272,longitude:77.588837,source:'pin',accuracy:0,formattedAddress:'Cubbon Park, Bengaluru, Karnataka, India',confirmed:true}},items:[{productId:'test-painting',title:'A quiet afternoon',quantity:1,unitPrice:1800,category:'paintings'}]};
let savedLabel={};
function render(){document.querySelector('main').innerHTML=accountMarkup(user,false,{tab:location.hash.split('/')[1],requests:[request],profile,states:['Karnataka','Maharashtra','Tamil Nadu']});mountLogout();}
window.addEventListener('hashchange',render);render();
document.addEventListener('click',event=>{const a=event.target.closest('a');if(a?.getAttribute('href')?.startsWith('#')){event.preventDefault();location.hash=a.getAttribute('href');}});
document.querySelector('#check-label').onclick=()=>openLabel(request,{load:async()=>savedLabel,save:async(id,text)=>{savedLabel=structuredClone(text);}});
document.addEventListener('submit',event=>{if(event.target.id==='customer-profile-form'){event.preventDefault();profile=Object.fromEntries(new FormData(event.target));document.querySelector('#profile-notice').textContent='Saved in this isolated UI check.';}});
document.addEventListener('click',async event=>{const target=event.target.closest('[data-action]');if(target?.dataset.action==='signout')await animateLogout(target);if(target?.dataset.action==='request-customizations')document.querySelector('#request-custom-'+request.id).textContent='Test note: please use warm green accents.';});
