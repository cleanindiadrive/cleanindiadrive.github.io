import {escapeHTML as e} from './commerce.js';
import {isInlineImage,validImageSource,encodeImage} from './image-data.js';
export function reviewCards(images=[]){return `<div class="review-editor-grid">${Array.from({length:7},(_,i)=>{const image=images[i]||'';return `<article class="review-editor-card" data-review-card="${i}"><div class="review-editor-image">${image?`<img src="${e(image)}" alt="Review ${i+1} preview" decoding="async">`:'Add a review image'}</div><h3>Review ${i+1}</h3><label class="field">Image URL<input type="url" data-review-url maxlength="2000" value="${isInlineImage(image)?'':e(image)}" placeholder="https://…"></label><label class="field">Or upload an image<input type="file" data-review-file accept="image/jpeg,image/png,image/webp"></label><button type="button" class="text-link" data-review-remove>Remove image</button><p class="small" role="status"></p></article>`;}).join('')}</div>`;}
export function mountReviewEditor(root,images=[]){
  root=root.querySelector('#banner-form')||root;
  let busy=0;const cards=[...root.querySelectorAll('[data-review-card]')];
  const paint=card=>{const box=card.querySelector('.review-editor-image');box.replaceChildren();if(card.reviewImage){const img=new Image();img.src=card.reviewImage;img.alt=`Review ${Number(card.dataset.reviewCard)+1} preview`;box.append(img);}else box.textContent='Add a review image';};
  cards.forEach((card,i)=>{
    card.reviewImage=images[i]||'';
    card.querySelector('[data-review-url]').oninput=event=>{const v=event.target.value.trim();if(v&&!validImageSource(v)){card.querySelector('[role=status]').textContent='Use an HTTPS image URL.';return;}card.reviewImage=v;card.querySelector('[role=status]').textContent='';paint(card);};
    card.querySelector('[data-review-remove]').onclick=()=>{card.reviewImage='';card.querySelector('[data-review-url]').value='';paint(card);};
    card.querySelector('[data-review-file]').onchange=async event=>{const file=event.target.files[0];if(!file)return;busy++;root.dataset.uploading=String(busy);const notice=card.querySelector('[role=status]');card.inert=true;notice.textContent='Preparing image…';try{card.reviewImage=await encodeImage(file);card.querySelector('[data-review-url]').value='';paint(card);notice.textContent='Ready to save';}catch(error){notice.textContent=error.message;}finally{busy--;root.dataset.uploading=String(busy);card.inert=false;event.target.value='';}};
  });
}
export function collectReviews(root){if(Number(root.dataset.uploading)>0)throw new Error('Wait for the review images to finish preparing.');const cards=[...root.querySelectorAll('[data-review-card]')];for(const card of cards){const url=card.querySelector('[data-review-url]').value.trim();if(url&&!validImageSource(url))throw new Error('Use an HTTPS URL or upload a review image.');}return cards.map(c=>c.reviewImage).filter(Boolean);}
