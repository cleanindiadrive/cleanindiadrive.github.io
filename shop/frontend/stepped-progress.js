export function steppedProgress(labels, step, ariaLabel = 'Progress') {
  const count = labels.length;
  if (!count) return '';
  const current = Math.max(1, Math.min(count, Number(step) || 1));
  const progress = count > 1 ? ((current - 1) / (count - 1)) * 100 : 0;
  return `<div class="checkout-progress" role="group" aria-label="${ariaLabel}"><div class="checkout-progress-line" aria-hidden="true"><span style="width:${progress}%"></span></div><ol>${labels.map((label, index) => {
    const number = index + 1, done = number < current;
    const glyph=done?'<svg class="checkout-step-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 4 4L16 6.5"></path></svg>':number;
    return `<li class="${done ? 'is-complete' : ''} ${number === current ? 'is-active' : ''}" ${number === current ? 'aria-current="step"' : ''}><span class="checkout-step-marker ${done?'is-check':''}" aria-hidden="true"><span class="checkout-step-glyph">${glyph}</span></span><span>${label}</span></li>`;
  }).join('')}</ol></div>`;
}
