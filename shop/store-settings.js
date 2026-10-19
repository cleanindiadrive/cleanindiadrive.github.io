import {isInlineImage} from './image-data.js';
import {escapeHTML as e, safeImage} from './commerce.js';

export const DEFAULT_SETTINGS = {
  announcementVisible: true,
  announcementText: 'A little art. A little joy. A whole lot of handmade.',
  announcementLink: '#shop',
  bannerVisible: false,
  bannerTitle: 'Made with a little heart.',
  bannerText: 'Discover something handmade for your favourite corner.',
  bannerButton: 'Explore the collection',
  bannerLink: '#shop',
  bannerImage: 'assets/paintings-sunset.svg',
  reviewsVisible: false,
  reviewImages: []
};
export function safeStoreLink(value) {
  return typeof value === 'string' && (/^#(?:home|shop|collection\/[a-z-]+|product\/[a-zA-Z0-9_-]+|about|account)$/.test(value) || /^https:\/\/[^\s<>"']+$/.test(value)) ? value : '#shop';
}
export function normalizeSettings(value = {}) {
  const result = {...DEFAULT_SETTINGS};
  for (const key of Object.keys(result)) {
    if (typeof value[key] === typeof result[key]) result[key] = value[key];
  }
  result.announcementLink = safeStoreLink(result.announcementLink);
  result.bannerLink = safeStoreLink(result.bannerLink);
  result.bannerImage = safeImage(result.bannerImage, DEFAULT_SETTINGS.bannerImage);
  result.reviewImages = (Array.isArray(value.reviewImages)?value.reviewImages:[]).filter(url=>typeof url==='string'&&/^https:\/\//.test(url)&&url.length<=2000).slice(0,7);
  return result;
}
export function bannerMarkup(settings) {
  if (!settings.bannerVisible) return '';
  return `<section class="store-banner"><img src="${e(settings.bannerImage)}" alt="" fetchpriority="high"><div><p class="eyebrow">From our little studio</p><h2>${e(settings.bannerTitle)}</h2><p>${e(settings.bannerText)}</p><a class="button" href="${e(settings.bannerLink)}">${e(settings.bannerButton)} →</a></div></section>`;
}
export function settingsForm(s) {
  return `<form id="banner-form" class="settings-note banner-editor"><h2>Your storefront banners</h2><p>Switch each banner on or off. Changes appear across the storefront after saving.</p>
  <label class="visibility-toggle"><input type="checkbox" name="announcementVisible" ${s.announcementVisible?'checked':''}><span>Announcement bar visible</span></label>
  <div class="form-grid"><label class="field wide">Announcement text<input name="announcementText" maxlength="160" required value="${e(s.announcementText)}"></label><label class="field wide">Announcement link<input name="announcementLink" required maxlength="500" value="${e(s.announcementLink)}"></label></div>
  <hr><label class="visibility-toggle"><input type="checkbox" name="bannerVisible" ${s.bannerVisible?'checked':''}><span>Homepage banner visible</span></label>
  <div class="form-grid"><label class="field wide">Banner title<input name="bannerTitle" maxlength="100" required value="${e(s.bannerTitle)}"></label><label class="field wide">Banner description<textarea name="bannerText" maxlength="400">${e(s.bannerText)}</textarea></label><label class="field">Button text<input name="bannerButton" maxlength="50" required value="${e(s.bannerButton)}"></label><label class="field">Button link<input name="bannerLink" maxlength="500" required value="${e(s.bannerLink)}"></label><label class="field wide">Banner image URL<input name="bannerImage" maxlength="100000" data-saved-image="${isInlineImage(s.bannerImage)}" placeholder="${isInlineImage(s.bannerImage)?'Image saved · choose a new file or paste a URL to replace':'https://…'}" value="${isInlineImage(s.bannerImage)?'':e(s.bannerImage)}"></label><label class="field wide">Or choose a banner image<input name="bannerFile" type="file" accept="image/jpeg,image/png,image/webp"></label></div><p class="small muted">JPG, PNG or WebP, up to 6 MB. Links can use #shop, #collection/paintings or an HTTPS URL.</p><hr><label class="visibility-toggle"><input type="checkbox" name="reviewsVisible" ${s.reviewsVisible?'checked':''}><span>Customer reviews visible</span></label><label class="field">Review image URLs (one per line)<textarea name="reviewImages" rows="5">${e(s.reviewImages.join('\n'))}</textarea></label><p class="small muted">Add 7 genuine customer review images using HTTPS URLs. Obtain permission before publishing. The carousel advances every 4.2 seconds.</p><div id="banner-preview">${bannerMarkup({...s,bannerVisible:true})}</div><button class="button" type="submit">Save banners</button><p id="banner-notice" role="status" class="notice"></p></form>`;
}
