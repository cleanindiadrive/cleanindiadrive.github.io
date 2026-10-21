import {POLICY_DEFAULTS} from './policy-defaults.js';
import {starterCopy} from './placeholder-copy.js';
import {escapeHTML as e,safeImage} from './commerce.js';
import {MAX_INLINE_IMAGE_LENGTH} from './image-data.js';
const field=(label,value,kind='text',max=120)=>({label,value,kind,max});
const body=(label,value)=>field(label,value,'textarea',6000);
const link=(label,value)=>field(label,value,'link',500);
const picture=(label,value)=>field(label,value,'image',MAX_INLINE_IMAGE_LENGTH);
const toggle=(label,value=true)=>field(label,value,'checkbox');
export const CONTENT_SCHEMA={
  brand:{label:'Branding',fields:{name:field('Store name','Silly Sensei'),pageTitle:field('Browser tab title','Silly Sensei · Art store'),logo:picture('Store logo','assets/brand-logo.webp'),mascot:picture('Studio mascot','assets/silly-sensei-loading.webp')}},
  navigation:{label:'Header & navigation',fields:{home:field('Home link label','Home'),shop:field('Shop link label','Art store'),collections:field('Collections menu label','Collections'),story:field('Story link label','Our story'),account:field('Account link label','My account')}},
  home:{label:'Homepage & shop headings',fields:{eyebrow:field('Homepage eyebrow','Silly Sensei'),heading:field('Homepage heading','Shop by collection'),ctaTitle:field('Collection callout heading','Browse the store'),ctaButton:field('Collection callout button','View all products'),ctaLink:link('Collection callout destination','#shop'),featureLabel:field('Featured product eyebrow','Featured product'),featureTitle:field('Featured heading override (blank uses product name)',''),shopTitle:field('Shop page heading','The art store'),shopDescription:field('Shop page description','Browse all products below.','textarea',400),checkoutTitle:field('Checkout heading','Checkout'),checkoutDescription:field('Checkout introduction','Enter your contact details and delivery address.','textarea',400),relatedTitle:field('Related products heading','You may also like'),searchPlaceholder:field('Search placeholder','Search products…'),cartTitle:field('Cart heading','Your cart')}},
  collections:{label:'Collection cards & descriptions',fields:{paintingsName:field('Paintings title','Paintings'),paintingsDescription:field('Paintings description','Add a description for your paintings here.','textarea',400),paintingsImage:picture('Paintings card image','assets/paintings.svg'),clayName:field('Clay models title','Clay models'),clayDescription:field('Clay models description','Add a description for your clay models here.','textarea',400),clayImage:picture('Clay models card image','assets/clay-models.svg'),moldsName:field('Molds title','Molds'),moldsDescription:field('Molds description','Add a description for your molds here.','textarea',400),moldsImage:picture('Molds card image','assets/molds.svg'),rocksName:field('Rock paints title','Rock paints'),rocksDescription:field('Rock paints description','Add a description for your painted rocks here.','textarea',400),rocksImage:picture('Rock paints card image','assets/rock-paints.svg')}},
  story:{label:'Story & studio section',fields:{pageTitle:field('Our story page heading','About Silly Sensei'),eyebrow:field('Story eyebrow','About the studio'),heading:field('Story heading','Our story'),text1:body('Story paragraph one','[Add a short introduction to Silly Sensei here.]'),text2:body('Story paragraph two','[Tell customers about the people behind the studio and what you make.]'),caption:field('Mascot caption','Silly Sensei'),button:field('Story link label','Shop collections'),destination:link('Story link destination','#shop')}},
  services:{label:'Service strip',fields:{title1:field('First heading','Handmade art'),text1:field('First description','Add a short description here.'),title2:field('Second heading','Custom requests'),text2:field('Second description','Add your customization details here.'),title3:field('Third heading','Delivery'),text3:field('Third description','Add your delivery information here.')}},
  footer:{label:'Footer',fields:{description:field('Footer description','Paintings, clay models, molds and painted rocks.','textarea',500),heading1:field('First column heading','Shop collections'),heading2:field('Second column heading','Information'),copyright:field('Copyright line ({year} inserts current year)','© {year} Silly Sensei.','text',300),locale:field('Region & currency label','India · INR ₹'),privacyLabel:field('Privacy link label','Privacy'),termsLabel:field('Terms link label','Terms'),link1Label:field('Link 1 label','Paintings'),link1Url:link('Link 1 destination','#collection/paintings'),link2Label:field('Link 2 label','Clay models'),link2Url:link('Link 2 destination','#collection/clay-models'),link3Label:field('Link 3 label','Molds'),link3Url:link('Link 3 destination','#collection/molds'),link4Label:field('Link 4 label','Rock paints'),link4Url:link('Link 4 destination','#collection/rock-paints'),link5Label:field('Link 5 label','Our story'),link5Url:link('Link 5 destination','#about'),link6Label:field('Link 6 label','Shipping & returns'),link6Url:link('Link 6 destination','#info/shipping'),link7Label:field('Link 7 label','Get in touch'),link7Url:link('Link 7 destination','#info/contact'),link8Label:field('Link 8 label','My account'),link8Url:link('Link 8 destination','#account')}},
  pages:{label:'Contact & policy pages',fields:Object.fromEntries(Object.entries(POLICY_DEFAULTS).map(([key,value])=>[key,key.endsWith('Body')?body(key.replace('Body','')+' page text',value):field(key.replace('Title','')+' page title',value)]))},
  sections:{label:'Section visibility',fields:{collections:toggle('Show collection cards'),callout:toggle('Show collection callout'),featured:toggle('Show featured product'),services:toggle('Show service strip'),story:toggle('Show homepage story'),footer:toggle('Show footer')}}
};
export const DEFAULT_CONTENT=Object.fromEntries(Object.entries(CONTENT_SCHEMA).map(([section,group])=>[section,Object.fromEntries(Object.entries(group.fields).map(([key,f])=>[key,f.value]))]));
export function contentCategories(c){return [['paintings','paintings'],['clay-models','clay'],['molds','molds'],['rock-paints','rocks']].map(([id,key])=>({id,name:c.collections[key+'Name'],description:c.collections[key+'Description'],image:c.collections[key+'Image']}));}
export function safeContentLink(value){return typeof value==='string'&&(/^(?:#(?:home|shop|about|account(?:\/(?:requests|profile))?|info\/(?:contact|shipping|refunds|privacy|terms)|collection\/[a-z-]+|product\/[\w-]+)|https:\/\/[^\s<>"']+|mailto:[^\s<>"']+@[^\s<>"']+|tel:\+?[\d -]+)$/.test(value));}
export function normalizeContent(value={}) {
  return Object.fromEntries(Object.entries(CONTENT_SCHEMA).map(([section,group])=>[section,Object.fromEntries(Object.entries(group.fields).map(([key,f])=>{
    let v=starterCopy(value[section]?.[key]);
    if(f.kind==='image'&&typeof v==='string')v=v.replace(/^assets\/(brand-logo|silly-sensei-loading|loading-doodles)\.png$/, 'assets/$1.webp');
    if(f.kind==='checkbox')return [key,typeof v==='boolean'?v:f.value];
    if(typeof v!=='string')return [key,f.value];
    if(f.kind==='link'&&!safeContentLink(v))return [key,f.value];
    if(f.kind==='image'&&safeImage(v,'')!==v)return [key,f.value];
    return [key,v.slice(0,f.max)];
  }))]));
}
export function validateContent(content){
  for(const [section,group] of Object.entries(CONTENT_SCHEMA))for(const [key,f] of Object.entries(group.fields)){
    const v=content[section]?.[key];
    if(f.kind==='checkbox'){if(typeof v!=='boolean')return `${f.label}: choose a visibility option.`;continue;}
    if(typeof v!=='string'||v.length>f.max)return `${f.label}: use up to ${f.max} characters.`;
    if(f.kind==='link'&&!safeContentLink(v))return `${f.label}: use a store route, HTTPS URL, email or phone link.`;
    if(f.kind==='image'&&(!v||safeImage(v,'')!==v))return `${f.label}: choose an image, an HTTPS image URL or an assets/ path.`;
  }
  return '';
}
export function footerMarkup(c,categoryLinks='') {
  const f=c.footer,links=start=>Array.from({length:4},(_,i)=>{const n=start+i;return `<a href="${e(f[`link${n}Url`])}">${e(f[`link${n}Label`])}</a>`;}).join('');
  return `<div class="container"><div class="footer-top"><div><a href="#home" class="brand"><img class="brand-logo" src="${e(c.brand.logo)}" alt="${e(c.brand.name)}" width="110" height="72"></a><p>${e(f.description)}</p></div><div class="footer-links"><h3>${e(f.heading1)}</h3>${links(1)}</div><div class="footer-links"><h3>${e(f.heading2)}</h3>${links(5)}</div></div><div class="footer-bottom"><span>${e(f.copyright.replaceAll('{year}',String(new Date().getFullYear()))).replace(e(c.brand.name),`<a href="#home" class="footer-brand-link">${e(c.brand.name)}</a>`)}</span><div><a href="#info/refunds">Cancellation & returns</a><a href="#info/privacy">${e(f.privacyLabel)}</a><a href="#info/terms">${e(f.termsLabel)}</a><span>${e(f.locale)}</span></div></div></div>`;
}
export function applyStoreContent(c,page,root=document) {
  const set=(selector,text)=>root.querySelectorAll(selector).forEach(el=>{el.textContent=text;});
  const image=(selector,url)=>root.querySelectorAll(selector).forEach(el=>{if(el.getAttribute('src')!==url)el.setAttribute('src',url);});
  const href=(selector,url)=>root.querySelectorAll(selector).forEach(el=>el.setAttribute('href',url));
  image('.brand-logo',c.brand.logo);root.querySelectorAll('.brand-logo').forEach(el=>el.alt=c.brand.name);
  image('.story-symbol>img,.account-welcome-art>img,.dashboard-studio>img',c.brand.mascot);
  set('.desktop-nav>a:nth-of-type(1)',c.navigation.home);set('.desktop-nav>a:nth-of-type(2)',c.navigation.shop);set('.desktop-nav>a:nth-of-type(3)',c.navigation.story);root.querySelectorAll('.desktop-nav [data-action="collections"]').forEach(el=>{el.textContent=c.navigation.collections;});
  for(const [route,key] of [['home','home'],['shop','shop'],['about','story'],['account','account']])set(`#mobile-menu>a[href="#${route}"]`,c.navigation[key]);
  root.querySelector('.header-actions>a[href="#account"]')?.setAttribute('aria-label',c.navigation.account);
  root.querySelector('.site-header .brand')?.setAttribute('aria-label',c.brand.name+' home');
  set('.home-intro>.eyebrow',c.home.eyebrow);set('.home-intro>h1',c.home.heading);set('.collection-cta>h2',c.home.ctaTitle);set('.collection-cta>a',c.home.ctaButton+' →');href('.collection-cta>a',c.home.ctaLink);set('.feature-copy>.eyebrow',c.home.featureLabel);if(c.home.featureTitle)set('.feature-copy>h2',c.home.featureTitle);
  if(page==='shop'){set('.page-head h1',c.home.shopTitle);set('.page-head>p',c.home.shopDescription);}
  if(page==='checkout'){set('.checkout-wrap>.page-head h1',c.home.checkoutTitle);set('.checkout-wrap>.page-head>p',c.home.checkoutDescription);}
  set('.related .section-heading>h2',c.home.relatedTitle);set('#cart-title',c.home.cartTitle);const search=root.querySelector('#search-input');if(search)search.placeholder=c.home.searchPlaceholder;
  set('.story-copy>.eyebrow',c.story.eyebrow);set('.story-copy>h2',c.story.heading);set('.story-copy>p:nth-of-type(2)',c.story.text1);set('.story-copy>p:nth-of-type(3)',c.story.text2);set('.story-symbol>span',c.story.caption);set('.story-copy>a',c.story.button+' →');href('.story-copy>a',c.story.destination);if(page==='about')set('.page-head>h1',c.story.pageTitle);
  root.querySelectorAll('.service-strip>div').forEach((el,i)=>{el.replaceChildren(document.createTextNode(c.services[`title${i+1}`]));const span=document.createElement('span');span.textContent=c.services[`text${i+1}`];el.append(span);});
  for(const [key,selector] of Object.entries({collections:'.collection-grid',callout:'.collection-cta',featured:'.feature',services:'.service-strip',story:'.story-block',footer:'#footer'}))root.querySelectorAll(selector).forEach(el=>el.hidden=key==='story'&&page==='about'?false:!c.sections[key]);
  if(root.nodeType===9)root.title=c.brand.pageTitle;
}
