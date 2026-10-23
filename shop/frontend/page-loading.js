import {pageSkeleton} from './skeletons.js';

// This small module can render before the application and its dependencies load.
const main=document.getElementById('main');
function paint(){
  if(!main.hasAttribute('data-loading'))return;
  main.innerHTML=pageSkeleton(location.hash.slice(1).split('/')[0]||'home');
}
paint();
window.addEventListener('hashchange',paint);
document.getElementById('shop-app').addEventListener('error',()=>{
  if(!main.hasAttribute('data-loading'))return;
  main.removeAttribute('data-loading');
  main.innerHTML='<div class="container empty-state" role="alert"><h1>The studio could not load</h1><p>Check your connection and reload to try again.</p><a class="button" href="">Reload page</a></div>';
});
