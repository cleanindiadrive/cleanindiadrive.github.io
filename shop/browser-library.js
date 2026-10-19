const loading = new Map();
export function loadScript(src) {
  if (!loading.has(src)) loading.set(src,new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=src;
    script.onload=()=>resolve();script.onerror=()=>{loading.delete(src);script.remove();reject(new Error('The map or label library could not load. Please try again.'));};
    document.head.append(script);
  }));
  return loading.get(src);
}
