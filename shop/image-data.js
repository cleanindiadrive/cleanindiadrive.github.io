// Eight images plus product metadata must stay below Firestore's 1 MiB document limit.
export const MAX_INLINE_IMAGE_LENGTH=100000;
export const MAX_IMAGE_FILE_BYTES=6*1024*1024;
export function isInlineImage(value){
  return typeof value==='string'&&value.length<=MAX_INLINE_IMAGE_LENGTH&&/^data:image\/(?:jpeg|png|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)&&value.split(',')[1].length>0;
}
export function validImageSource(value){
  return typeof value==='string'&&(isInlineImage(value)||(value.length<=2000&&(/^(?:https:\/\/[^\s<>"']+|assets\/[a-zA-Z0-9._/-]+)$/.test(value))));
}
export async function encodeImage(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WebP image.');
  if(file.size>MAX_IMAGE_FILE_BYTES)throw new Error('Each image must be smaller than 6 MB.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error('This image could not be opened. Choose another JPG, PNG or WebP.');}
  try{
    if(!bitmap.width||!bitmap.height)throw new Error('This image has no usable dimensions.');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Your browser could not prepare this image.');
    // Canvas removes metadata, preserves transparency and converts animated images to a still.
    for(let dimension=1600;dimension>=100;dimension=Math.floor(dimension*.75)){
      const scale=Math.min(1,dimension/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.86,.72,.58,.44]){
        const data=canvas.toDataURL('image/webp',quality);
        if(isInlineImage(data))return data;
        // Browsers without WebP encoding return lossless PNG; resize instead of retrying quality.
        if(data.startsWith('data:image/png;'))break;
      }
    }
    throw new Error('This image is too detailed to save. Try a smaller image or crop it first.');
  }finally{bitmap.close();}
}
