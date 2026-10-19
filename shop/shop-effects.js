const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function decorateCartButtons(root = document) {
  root.querySelectorAll('[data-action="add"],[data-action="add-detail"]').forEach(button => {
    if (button.disabled || button.classList.contains('cart-button')) return;
    // Keep the supplied button independent of the store's generic button styles.
    button.classList.remove('button', 'outline', 'full');
    button.classList.add('cart-button');
    button.innerHTML = `<span class="add-to-cart">Add to cart</span>
      <span class="added" aria-hidden="true">Added</span>
      <i class="fas fa-shopping-cart" aria-hidden="true"></i>
      <i class="fas fa-box" aria-hidden="true"></i>`;
  });
}

// The supplied cartClick handler, called after the cart accepts the item.
function cartClick() {
  let button = this;
  button.classList.add('clicked');
}

export async function animateCart(button) {
  button.classList.remove('clicked');
  // Allow the original keyframes to replay when the same product is added again.
  void button.offsetWidth;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.setAttribute('aria-label', 'Added to cart');
  cartClick.call(button);
  if (!reduced()) await new Promise(resolve => setTimeout(resolve, 1950));
  button.disabled = false;
  button.removeAttribute('aria-busy');
}

export function truckContent(label) {
  return `<span class="default">${label}</span>
    <span class="success" aria-hidden="true">Details saved
      <svg viewBox="0 0 12 10"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg>
    </span>
    <div class="truck" aria-hidden="true">
      <div class="wheel"></div>
      <div class="back"></div>
      <div class="front"></div>
      <div class="box"></div>
    </div>`;
}

// Original GSAP sequence: the supplied values, durations, delays and easing.
// Only the surrounding save lifecycle is integrated with checkout.
function playTruck(button, onComplete) {
  let box = button.querySelector('.box'),
      truck = button.querySelector('.truck');

  if (!button.classList.contains('done')) {
    if (!button.classList.contains('animation')) {
      button.classList.add('animation');

      gsap.to(button, {
        '--box-s': 1,
        '--box-o': 1,
        duration: .3,
        delay: .5
      });
      gsap.to(box, {
        x: 0,
        duration: .4,
        delay: .7
      });
      gsap.to(button, {
        '--hx': -5,
        '--bx': 50,
        duration: .18,
        delay: .92
      });
      gsap.to(box, {
        y: 0,
        duration: .1,
        delay: 1.15
      });
      gsap.set(button, {
        '--truck-y': 0,
        '--truck-y-n': -26
      });
      gsap.to(button, {
        '--truck-y': 1,
        '--truck-y-n': -25,
        duration: .2,
        delay: 1.25,
        onComplete() {
          gsap.timeline({
            onComplete() {
              button.classList.add('done');
              onComplete();
            }
          }).to(truck, {
            x: 0,
            duration: .4
          }).to(truck, {
            x: 40,
            duration: 1
          }).to(truck, {
            x: 20,
            duration: .6
          }).to(truck, {
            x: 96,
            duration: .4
          });
          gsap.to(button, {
            '--progress': 1,
            duration: 2.4,
            ease: 'power2.in'
          });
        }
      });
    }
  } else {
    button.classList.remove('animation', 'done');
    gsap.set(truck, {x: 4});
    gsap.set(button, {
      '--progress': 0,
      '--hx': 0,
      '--bx': 0,
      '--box-s': .5,
      '--box-o': 0,
      '--truck-y': 0,
      '--truck-y-n': -26
    });
    gsap.set(box, {x: -24, y: -6});
  }
}

export function beginCheckoutAnimation(button) {
  const status = document.getElementById('checkout-motion-status');
  const label = button.querySelector('.default');
  const originalLabel = label.textContent;
  let context;
  document.activeElement?.blur();
  button.scrollIntoView({block: 'center', behavior: reduced() ? 'instant' : 'smooth'});
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.setAttribute('aria-label', 'Saving checkout details');
  label.textContent = 'Saving details…';
  if (status) status.textContent = 'Saving your checkout details…';
  return {
    async complete() {
      if (!button.isConnected) return;
      label.textContent = originalLabel;
      if (reduced() || !window.gsap) {
        button.classList.add('animation', 'done');
      } else {
        await new Promise(resolve => {
          context = gsap.context(() => playTruck(button, resolve), button);
        });
      }
      button.setAttribute('aria-label', 'Checkout details saved');
      button.setAttribute('aria-busy', 'false');
      if (status) status.textContent = '✓ Details saved. Opening your confirmation…';
      // Let the original .45 s tick delay and .4 s stroke animation finish.
      if (!reduced()) await new Promise(resolve => setTimeout(resolve, 1100));
    },
    reset() {
      context?.revert();
      button.classList.remove('animation', 'done');
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.removeAttribute('aria-label');
      label.textContent = originalLabel;
      if (status) status.textContent = '';
    }
  };
}

export function reviewSection(images=[]) {
  if(images.length!==7)return '';
  const positions = ['hideLeft', 'prevLeftSecond', 'prev', 'selected', 'next', 'nextRightSecond', 'hideRight'];
  return `<section class="reviews-section" aria-label="Customer review carousel">
    <p class="eyebrow">Little notes, lovely things</p>
    <h2>A little love from the community.</h2>
    <div class="review-stage"><div id="carousel" tabindex="0" aria-label="Customer reviews. Use left and right arrow keys to browse.">
      ${images.map((url, i) => `<div class="${positions[i]}" data-review="${i}"><img src="${url.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}" alt="Customer review ${i+1}" draggable="false"></div>`).join('')}
    </div></div>
    <div class="review-progress"><span id="review-position">4 / 7</span><button type="button" id="review-pause" class="text-link" aria-pressed="false">Pause animation</button></div>
  </section>`;
}

export function mountReviews() {
  const root = document.querySelector('.reviews-section');
  if (!root || !window.jQuery) return () => {};
  const $ = window.jQuery;
  const carousel = $(root).find('#carousel');
  const pause = root.querySelector('#review-pause');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = media.matches, hover = false, focus = false;

  // The supplied carousel function; selectors are scoped to this carousel.
  function moveToSelected(element) {
    if (element == 'next') {
      var selected = carousel.find('.selected').next();
    } else if (element == 'prev') {
      var selected = carousel.find('.selected').prev();
    } else {
      var selected = element;
    }
    var next = $(selected).next();
    var prev = $(selected).prev();
    var prevSecond = $(prev).prev();
    var nextSecond = $(next).next();
    $(selected).removeClass().addClass('selected');
    $(prev).removeClass().addClass('prev');
    $(next).removeClass().addClass('next');
    $(nextSecond).removeClass().addClass('nextRightSecond');
    $(prevSecond).removeClass().addClass('prevLeftSecond');
    $(nextSecond).nextAll().removeClass().addClass('hideRight');
    $(prevSecond).prevAll().removeClass().addClass('hideLeft');
  }

  function update() {
    carousel.children().each((_, card) => card.setAttribute('aria-hidden', String(!card.classList.contains('selected'))));
    root.querySelector('#review-position').textContent = `${Number(carousel.find('.selected').attr('data-review')) + 1} / 7`;
    pause.textContent = paused ? 'Play animation' : 'Pause animation';
    pause.setAttribute('aria-pressed', String(paused));
  }
  function advance(direction) {
    // Recycle an invisible end card; the original class choreography stays intact.
    if (direction === 'next') carousel.append(carousel.children().first());
    else carousel.prepend(carousel.children().last());
    moveToSelected(direction);
    update();
  }
  carousel.on('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      advance(event.key === 'ArrowRight' ? 'next' : 'prev');
    }
  });
  carousel.children().on('click', function () {
    const selected = $(this);
    while (selected.index() > 3) carousel.append(carousel.children().first());
    while (selected.index() < 3) carousel.prepend(carousel.children().last());
    moveToSelected(selected);
    update();
  });
  pause.onclick = () => { paused = !paused; update(); };
  root.onmouseenter = () => hover = true;
  root.onmouseleave = () => hover = false;
  root.onfocusin = () => focus = true;
  root.onfocusout = event => { focus = root.contains(event.relatedTarget); };
  const change = () => { paused = media.matches; update(); };
  media.addEventListener('change', change);
  const interval = setInterval(() => {
    if (!paused && !hover && !focus && !document.hidden) advance('next');
  }, 4200);
  update();
  return () => {
    clearInterval(interval);
    carousel.off();
    carousel.children().off();
    media.removeEventListener('change', change);
  };
}
