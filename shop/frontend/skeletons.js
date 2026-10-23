// Loading placeholders reuse the finished page's grids to reserve its space.
const block=(kind='line')=>`<span class="skeleton skeleton-${kind}"></span>`;
const repeat=(count,markup)=>Array.from({length:count},()=>markup).join('');
const heading=()=>`${block('eyebrow')}${block('heading')}${block('line')}`;
const fields=()=>`<div class="form-grid">${repeat(6,`<div class="skeleton-field">${block('eyebrow')}${block('input')}</div>`)}</div>`;
const stats=()=>`<div class="stats-grid">${repeat(3,`<div class="stat">${block('short')}${block('heading')}</div>`)}</div>`;
const rows=(count=3)=>`<div class="skeleton-rows">${repeat(count,`<div class="skeleton-row">${block('avatar')}<div>${block('line')}${block('short')}</div>${block('short')}</div>`)}</div>`;
const productCards=()=>`<div class="product-grid">${repeat(6,`<article class="product-card">${block('image')}<p class="eyebrow">${block('eyebrow')}</p><h2>${block('line')}</h2><p class="price">${block('short')}</p>${block('button')}</article>`)}</div>`;
const collectionCards=()=>`<div class="collection-grid">${repeat(4,`<div class="collection-card">${block('image')}<h2>${block('line')}</h2></div>`)}</div>`;
const feature=()=>`<section class="feature"><div class="feature-media">${block('image')}</div><div class="feature-copy">${heading()}${block('line')}${block('button')}</div></section>`;
const panel=()=>`<div class="dashboard-panel">${heading()}${fields()}${block('button')}</div>`;

export function skeletonMarkup(kind='rows',label='Loading…'){
  const layouts={products:productCards,collections:collectionCards,feature,rows,stats,
    sales:()=>`${heading()}${block('input')}<div class="revenue-grid">${repeat(4,`<article>${block('short')}${block('heading')}${block('line')}</article>`)}</div>${panel()}`,
    form:()=>`${heading()}${fields()}${block('button')}`,
    editor:()=>`${heading()}<div class="skeleton-columns">${panel()}${panel()}</div>`,
    table:()=>`${stats()}${block('input')}${rows(5)}`};
  // Labels come from our UI, but escape them so this helper is safe to reuse.
  const text=String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div class="loading-skeleton" role="status" aria-label="${text}"><span class="sr-only">${text}</span><div aria-hidden="true" inert>${(layouts[kind]||rows)()}</div></div>`;
}

export function pageSkeleton(page='home'){
  let layout;
  if(page==='home')layout=`<div class="container"><div class="home-intro skeleton-centered">${block('eyebrow')}${block('heading')}</div>${collectionCards()}</div>`;
  else if(['shop','collection','search'].includes(page))layout=`<div class="container"><div class="page-head">${heading()}</div><div class="filter-bar">${block('input')}${block('short')}</div>${productCards()}</div>`;
  else if(page==='product')layout=`<div class="container"><div class="page-head">${block('line')}</div><div class="product-layout"><div>${block('image')}</div><div class="product-detail">${heading()}${block('short')}${block('input')}${block('button')}${block('button')}${repeat(4,block('line'))}</div></div></div>`;
  else if(page==='checkout')layout=`<div class="checkout-wrap"><div class="page-head">${heading()}</div><div class="checkout-layout"><div>${fields()}${block('button')}</div><div class="checkout-summary">${block('heading')}${rows()}${block('line')}</div></div></div>`;
  else if(['account','admin'].includes(page))layout=`<div class="wide-container ${page==='account'?'customer-dashboard':'admin-layout'}"><aside class="${page==='account'?'customer-sidebar':'admin-sidebar'}">${block('avatar')}${block('heading')}${repeat(4,block('input'))}</aside><section class="${page==='account'?'customer-main':'admin-main'}"><div class="page-head">${heading()}</div>${stats()}${rows()}</section></div>`;
  else layout=`<div class="container"><div class="info-page">${heading()}${repeat(8,block('line'))}</div></div>`;
  return `<div class="loading-skeleton" role="status" aria-label="Loading page…"><span class="sr-only">Loading page…</span><div aria-hidden="true" inert>${layout}</div></div>`;
}
