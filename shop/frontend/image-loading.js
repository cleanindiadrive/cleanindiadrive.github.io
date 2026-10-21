// Reserve image space immediately; decode off the main rendering path.
const watched=new WeakSet();
function prepare(root){for(const img of root.querySelectorAll('img')){
  if(watched.has(img))continue;watched.add(img);img.decoding='async';
  const done=()=>img.classList.remove('image-loading');
  if(!img.complete)img.classList.add('image-loading');
  img.addEventListener('load',done,{once:true});
  img.addEventListener('error',()=>{done();img.classList.add('image-failed');if(img.closest('.content-image-control,.review-editor-image'))return;img.src='assets/paintings.svg';},{once:true});
}}
prepare(document);new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)if(node.nodeType===1)prepare(node.parentElement||node);}).observe(document.body,{childList:true,subtree:true});
