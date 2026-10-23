import {pageSkeleton} from './skeletons.js';

// Show the page's skeleton for one second, even when its data is cached.
export const MIN_PAGE_LOADING_MS=1000;
const main=document.getElementById('main');
let activeRoute='',readyAt=0,renderTimer;
function beginPageLoading(){
  if(location.hash==='#main')return;
  const nextRoute=location.hash.slice(1)||'home';
  if(nextRoute===activeRoute)return;
  activeRoute=nextRoute;
  readyAt=performance.now()+MIN_PAGE_LOADING_MS;
  clearTimeout(renderTimer);
  main.setAttribute('aria-busy','true');
  main.innerHTML=pageSkeleton(nextRoute.split('/')[0]);
}

// Repeated data callbacks share the same deadline instead of extending it.
export function deferPageRender(render){
  beginPageLoading();
  const remaining=readyAt-performance.now();
  clearTimeout(renderTimer);
  if(remaining<=0){main.removeAttribute('aria-busy');return false;}
  renderTimer=setTimeout(render,remaining);
  return true;
}

beginPageLoading();
window.addEventListener('hashchange',beginPageLoading);
document.getElementById('shop-app').addEventListener('error',()=>{
  if(!main.hasAttribute('data-loading'))return;
  clearTimeout(renderTimer);
  main.removeAttribute('data-loading');
  main.removeAttribute('aria-busy');
  main.innerHTML='<div class="container empty-state" role="alert"><h1>The page could not load</h1><p>Check your connection and reload to try again.</p><a class="button" href="">Reload page</a></div>';
});
