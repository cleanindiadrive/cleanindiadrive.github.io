import {validLocation} from './location-utils.js';
export const MAX_CART_ITEMS = 5;
export const CATEGORIES = [
  { id: 'paintings', name: 'Paintings', description: 'Little windows to a world of colour.', image: 'assets/paintings.svg' },
  { id: 'clay-models', name: 'Clay models', description: 'Small characters. Big personalities.', image: 'assets/clay-models.svg' },
  { id: 'molds', name: 'Molds', description: 'For all the things you have yet to make.', image: 'assets/molds.svg' },
  { id: 'rock-paints', name: 'Rock paints', description: 'Ordinary stones, a little less ordinary.', image: 'assets/rock-paints.svg' },
];
export const categoryOf = id => CATEGORIES.find(c => c.id === id);
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value || 0);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeImage(value, fallback = 'assets/paintings.svg') {
  if (typeof value !== 'string') return fallback;
  if (/^https:\/\//i.test(value) || /^assets\/[a-z0-9._/-]+$/i.test(value)) return value;
  return fallback;
}
export function normalizeProduct(raw) {
  return { ...raw, title: String(raw.title || 'Untitled'), category: categoryOf(raw.category) ? raw.category : 'paintings',
    price: Number.isFinite(Number(raw.price)) && Number(raw.price) >= 0 ? Number(raw.price) : 0,
    stock: Math.max(0, Math.floor(Number(raw.stock) || 0)), visible: raw.visible === true,
    images: (Array.isArray(raw.images) ? raw.images : []).map(v => safeImage(v)), description: String(raw.description || '') };
}
export function cartLines(cart, products) {
  if (!Array.isArray(cart)) return [];
  const seen = new Set();
  return cart.flatMap(item => {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) return [];
    seen.add(item.id);
    const product = products.find(p => p.id === item.id && p.visible);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || product.stock < 1) return [];
    const quantity = Math.min(item.quantity, product.stock, 99);
    return [{ product, quantity, total: Math.round(product.price * 100) * quantity / 100 }];
  });
}
export const subtotal = lines => lines.reduce((sum, line) => sum + Math.round(line.total * 100), 0) / 100;
export function filterProducts(products, { category = '', search = '', sort = 'featured', available = false } = {}) {
  const query = search.trim().toLowerCase();
  return products.filter(p => p.visible && (!category || p.category === category) && (!available || p.stock > 0) &&
    (!query || `${p.title} ${p.description} ${categoryOf(p.category)?.name}`.toLowerCase().includes(query))).sort((a,b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'newest') return (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0);
    return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
  });
}
export function validateCustomer(c) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '') || c.email.length > 254) return 'Enter a valid email address.';
  if (!c.firstName?.trim() || !c.lastName?.trim()) return 'Enter your first and last name.';
  if (!/^(?:\+91[ -]?)?[6-9]\d{9}$/.test((c.phone || '').replace(/\s/g,''))) return 'Enter a valid 10-digit Indian mobile number.';
  if (!c.address?.trim() || !c.city?.trim() || !c.state?.trim()) return 'Complete your delivery address.';
  if (!/^[1-9]\d{5}$/.test(c.postalCode || '')) return 'Enter a valid 6-digit PIN code.';
  if (c.country !== 'India') return 'Delivery is currently available within India.';
  if (!validLocation(c.location)) return 'Choose and confirm your delivery pin on the map.';
  if ([c.firstName,c.lastName,c.city,c.state].some(v => v.length > 100) || c.address.length > 300 || (c.apartment || '').length > 150 || (c.notes || '').length > 1000) return 'Please shorten the details in the form.';
  if (c.consent !== true) return 'Please allow us to use these details for your checkout request.';
  return '';
}
